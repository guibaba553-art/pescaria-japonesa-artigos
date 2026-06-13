package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"time"
)

var processedEvents = make(map[string]bool) // Simple in-memory for idempotency

func webhookHandler(w http.ResponseWriter, r *http.Request) {
	secret := os.Getenv("ABACATEPAY_WEBHOOK_SECRET")

	querySecret := r.URL.Query().Get("webhookSecret")
	if querySecret != secret {
		fmt.Println("Invalid secret query")
		http.Error(w, "Invalid secret query", http.StatusUnauthorized)
		return
	}

	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		fmt.Println("Error reading body:", err)
		http.Error(w, "Error reading body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	// Basic validation
	var event map[string]interface{}
	if err := json.Unmarshal(bodyBytes, &event); err != nil || event["id"] == nil {
		fmt.Println("Invalid payload structure")
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	timestampStr := r.Header.Get("X-Webhook-Timestamp")
	if timestampStr == "" {
		fmt.Println("Missing timestamp")
		http.Error(w, "Missing timestamp", http.StatusUnauthorized)
		return
	}
	timestamp, err := strconv.ParseInt(timestampStr, 10, 64)
	if err != nil || time.Now().Unix()-timestamp > 300 { // 5 minutes
		fmt.Println("Invalid or expired timestamp")
		http.Error(w, "Invalid timestamp", http.StatusUnauthorized)
		return
	}

	signature := r.Header.Get("X-Webhook-Signature")

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(bodyBytes)
	expectedSignature := base64.StdEncoding.EncodeToString(mac.Sum(nil))

	// Constant-time comparison
	if subtle.ConstantTimeCompare([]byte(signature), []byte(expectedSignature)) != 1 {
		fmt.Println("Invalid signature")
		http.Error(w, "Invalid signature", http.StatusUnauthorized)
		return
	}

	eventID := event["id"].(string)
	eventType := event["event"].(string)

	// Idempotency
	if processedEvents[eventID] {
		fmt.Println("Event already processed:", eventID)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Already processed"))
		return
	}

	fmt.Println("Processing event:", eventType, "ID:", eventID)

	// Simulate processing
	if eventType == "billing.paid" {
		// Process payment
		fmt.Println("Payment confirmed for:", event["data"].(map[string]interface{})["id"])
		processedEvents[eventID] = true
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	} else {
		// Unknown event, but accept to avoid retries
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	}
}
