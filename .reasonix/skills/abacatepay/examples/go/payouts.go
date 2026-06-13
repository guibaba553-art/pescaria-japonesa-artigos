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

// CreatePayoutRequest represents the request payload for creating a payout.
type CreatePayoutRequest struct {
	Amount      int     `json:"amount"` // in cents
	ExternalID  string  `json:"externalId"`
	Description *string `json:"description,omitempty"`
}

// Payout represents a payout object.
type Payout struct {
	ID           string  `json:"id"`
	Status       string  `json:"status"`
	DevMode      bool    `json:"devMode"`
	ReceiptURL   *string `json:"receiptUrl"`
	Amount       int     `json:"amount"`
	PlatformFree int     `json:"platformFree"`
	ExternalID   string  `json:"externalId"`
	CreatedAt    string  `json:"createdAt"`
	UpdatedAt    string  `json:"updatedAt,omitempty"`
}

// CreatePayout creates a new payout request for fund withdrawal.
// Payouts transfer money from your account to external destinations.
// Parameters:
//   - amount: Amount in cents.
//   - externalID: Unique identifier for tracking.
//
// Returns: A pointer to DefaultResponse[Payout] and an error if any.
func CreatePayout(amount int, externalID string) (*DefaultResponse[Payout], error) {
	apiKey := os.Getenv("ABACATEPAY_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("ABACATEPAY_API_KEY not set")
	}

	reqBody := CreatePayoutRequest{
		Amount:     amount,
		ExternalID: externalID,
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	reqAPI, err := http.NewRequest("POST", BaseURL+"/payouts/create", bytes.NewBuffer(jsonBody))
	if err != nil {
		return nil, err
	}

	reqAPI.Header.Set("Authorization", "Bearer "+apiKey)
	reqAPI.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(reqAPI)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("api error: status %d - %s", resp.StatusCode, string(body))
	}

	var result DefaultResponse[Payout]
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &result, nil
}

// GetPayout retrieves a specific payout by ID.
// Useful for checking payout status and details.
// Parameters:
//   - id: Payout ID to retrieve.
//
// Returns: A pointer to DefaultResponse[Payout] and an error if any.
func GetPayout(id string) (*DefaultResponse[Payout], error) {
	apiKey := os.Getenv("ABACATEPAY_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("ABACATEPAY_API_KEY not set")
	}

	url := fmt.Sprintf("%s/payouts/get?id=%s", BaseURL, id)
	reqAPI, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}

	reqAPI.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(reqAPI)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("api error: status %d - %s", resp.StatusCode, string(body))
	}

	var result DefaultResponse[Payout]
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &result, nil
}

// ListPayouts lists payouts with pagination.
// Useful for financial reporting and payout tracking.
// Parameters:
//   - page: Page number for pagination.
//   - limit: Number of items per page.
//
// Returns: A pointer to DefaultResponse[[]Payout] and an error if any.
func ListPayouts(page int, limit int) (*DefaultResponse[[]Payout], error) {
	apiKey := os.Getenv("ABACATEPAY_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("ABACATEPAY_API_KEY not set")
	}

	url := fmt.Sprintf("%s/payouts/list?page=%d&limit=%d", BaseURL, page, limit)
	reqAPI, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}

	reqAPI.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(reqAPI)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("api error: status %d - %s", resp.StatusCode, string(body))
	}

	var result DefaultResponse[[]Payout]
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &result, nil
}
