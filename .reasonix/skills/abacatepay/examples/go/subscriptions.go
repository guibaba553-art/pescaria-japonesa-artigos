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

// SubscriptionFrequency represents the billing cycle for subscriptions.
type SubscriptionFrequency struct {
	Cycle string `json:"cycle"` // e.g., "MONTHLY", "YEARLY"
}

// CreateSubscriptionRequest represents the request payload for creating a subscription product.
type CreateSubscriptionRequest struct {
	ExternalID  string                `json:"externalId"`
	Name        string                `json:"name"`
	Price       int                   `json:"price"` // in cents
	Frequency   SubscriptionFrequency `json:"frequency"`
	Currency    string                `json:"currency"`
	Description string                `json:"description,omitempty"`
	Image       string                `json:"image,omitempty"`
}

// Subscription represents a subscription product object.
type Subscription struct {
	ID         string                `json:"id"`
	ExternalID string                `json:"externalId"`
	Name       string                `json:"name"`
	Price      int                   `json:"price"`
	Frequency  SubscriptionFrequency `json:"frequency"`
	Currency   string                `json:"currency"`
	Status     string                `json:"status"`
	CreatedAt  string                `json:"createdAt"`
	UpdatedAt  string                `json:"updatedAt"`
}

// CreateSubscription creates a new subscription product.
// Subscription products define recurring billing items.
// Parameters:
//   - req: Subscription creation request data.
//
// Returns: A pointer to DefaultResponse[Subscription] and an error if any.
func CreateSubscription(req CreateSubscriptionRequest) (*DefaultResponse[Subscription], error) {
	apiKey := os.Getenv("ABACATEPAY_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("ABACATEPAY_API_KEY not set")
	}

	jsonBody, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	reqAPI, err := http.NewRequest("POST", BaseURL+"/subscriptions/create", bytes.NewBuffer(jsonBody))
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

	var result DefaultResponse[Subscription]
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &result, nil
}

// ListSubscriptions lists all subscription products.
// Useful for catalog management and billing setup.
// Parameters:
//   - page: Page number for pagination.
//   - limit: Number of items per page.
//
// Returns: A pointer to DefaultResponse[[]Subscription] and an error if any.
func ListSubscriptions(page int, limit int) (*DefaultResponse[[]Subscription], error) {
	apiKey := os.Getenv("ABACATEPAY_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("ABACATEPAY_API_KEY not set")
	}

	url := fmt.Sprintf("%s/subscriptions/list?page=%d&limit=%d", BaseURL, page, limit)
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

	var result DefaultResponse[[]Subscription]
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &result, nil
}
