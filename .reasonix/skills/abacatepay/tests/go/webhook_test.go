package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestWebhookHandler(t *testing.T) {
	// Set up test data
	secret := "test_secret"
	os.Setenv("ABACATEPAY_WEBHOOK_SECRET", secret)
	defer os.Unsetenv("ABACATEPAY_WEBHOOK_SECRET")

	body := `{"event": "test"}`
	bodyBytes := []byte(body)

	// Calculate expected signature
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(bodyBytes)
	expectedSignature := hex.EncodeToString(mac.Sum(nil))

	// Create request
	req := httptest.NewRequest("POST", "/webhook?webhookSecret="+secret, bytes.NewReader(bodyBytes))
	req.Header.Set("X-Webhook-Signature", expectedSignature)
	req.Header.Set("Content-Type", "application/json")

	// Create response recorder
	w := httptest.NewRecorder()

	// Call handler
	webhookHandler(w, req)

	// Check response
	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	if w.Body.String() != "OK" {
		t.Errorf("Expected body 'OK', got %s", w.Body.String())
	}
}

func TestWebhookHandlerInvalidSecret(t *testing.T) {
	os.Setenv("ABACATEPAY_WEBHOOK_SECRET", "secret")
	defer os.Unsetenv("ABACATEPAY_WEBHOOK_SECRET")

	req := httptest.NewRequest("POST", "/webhook?webhookSecret=wrong", nil)
	w := httptest.NewRecorder()

	webhookHandler(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected status 401, got %d", w.Code)
	}
}

func TestWebhookHandlerInvalidSignature(t *testing.T) {
	secret := "secret"
	os.Setenv("ABACATEPAY_WEBHOOK_SECRET", secret)
	defer os.Unsetenv("ABACATEPAY_WEBHOOK_SECRET")

	body := `{"event": "test"}`
	req := httptest.NewRequest("POST", "/webhook?webhookSecret="+secret, bytes.NewReader([]byte(body)))
	req.Header.Set("X-Webhook-Signature", "invalid")

	w := httptest.NewRecorder()

	webhookHandler(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected status 401, got %d", w.Code)
	}
}
