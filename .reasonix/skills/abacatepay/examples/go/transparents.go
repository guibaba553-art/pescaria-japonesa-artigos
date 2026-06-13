package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// CreateTransparentRequest represents the request payload for creating a transparent payment.
type CreateTransparentRequest struct {
	Data     TransparentData        `json:"data"`
	Metadata map[string]interface{} `json:"metadata,omitempty"`
}

// TransparentData holds the amount for the payment.
type TransparentData struct {
	Amount int     `json:"amount"` // in cents
	Status *string `json:"status,omitempty"`
}

// TransparentPayment represents a transparent payment object.
type TransparentPayment struct {
	ID         string `json:"id"`
	Amount     int    `json:"amount"`
	Status     string `json:"status"`
	QRCode     string `json:"qrCode,omitempty"`
	QRCodeText string `json:"qrCodeText,omitempty"`
	CreatedAt  string `json:"createdAt"`
}

// CreateTransparent creates a transparent payment (PIX QR Code).
// Returns QR code for customer to complete payment.
// Parameters:
//   - amount: Amount in cents.
//
// Returns: A pointer to DefaultResponse[TransparentPayment] and an error if any.
func CreateTransparent(amount int) (*DefaultResponse[TransparentPayment], error) {
	apiKey := os.Getenv("ABACATEPAY_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("ABACATEPAY_API_KEY not set")
	}

	reqBody := CreateTransparentRequest{
		Data: TransparentData{
			Amount: amount,
		},
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", BaseURL+"/transparents/create", bytes.NewBuffer(jsonBody))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("api error: status %d", resp.StatusCode)
	}

	var result DefaultResponse[TransparentPayment]
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &result, nil
}

// SimulateTransparent simulates a payment for testing purposes.
// Only works in dev mode - marks payment as completed.
// Returns: A pointer to DefaultResponse[TransparentPayment] and an error if any.
func SimulateTransparent() (*DefaultResponse[TransparentPayment], error) {
	apiKey := os.Getenv("ABACATEPAY_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("ABACATEPAY_API_KEY not set")
	}

	reqBody := map[string]interface{}{
		"metadata": map[string]interface{}{},
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", BaseURL+"/transparents/simulate-payment", bytes.NewBuffer(jsonBody))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("api error: status %d - %s", resp.StatusCode, string(body))
	}

	var result DefaultResponse[TransparentPayment]
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &result, nil
}

// CheckTransparentStatus checks the status of a transparent payment.
// Useful for polling payment completion.
// Returns: A pointer to DefaultResponse[TransparentPayment] and an error if any.
func CheckTransparentStatus() (*DefaultResponse[TransparentPayment], error) {
	apiKey := os.Getenv("ABACATEPAY_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("ABACATEPAY_API_KEY not set")
	}

	req, err := http.NewRequest("GET", BaseURL+"/transparents/check", nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("api error: status %d - %s", resp.StatusCode, string(body))
	}

	var result DefaultResponse[TransparentPayment]
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &result, nil
}
