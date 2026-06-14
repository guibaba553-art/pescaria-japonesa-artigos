package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// CreateCheckoutRequest represents the request payload for creating a checkout.
// It includes items, optional customer details, and other metadata.
type CreateCheckoutRequest struct {
	Items         []Item                 `json:"items"`
	CustomerID    string                 `json:"customerId,omitempty"`
	Customer      *CheckoutCustomer      `json:"customer,omitempty"`
	Coupons       *[]string              `json:"coupons,omitempty"`
	ExternalID    string                 `json:"externalId,omitempty"`
	ReturnURL     string                 `json:"returnUrl,omitempty"`
	CompletionURL string                 `json:"completionUrl,omitempty"`
	Metadata      map[string]interface{} `json:"metadata,omitempty"`
}

// Item represents a checkout item with ID and quantity.
type Item struct {
	ID       string `json:"id"`
	Quantity int    `json:"quantity"`
}

// CheckoutCustomer represents customer information for checkout.
type CheckoutCustomer struct {
	Name      string `json:"name"`
	Email     string `json:"email"`
	Cellphone string `json:"cellphone"`
	TaxID     string `json:"taxId"`
}

// Checkout represents a checkout object returned by the API.
type Checkout struct {
	ID            string  `json:"id"`
	ExternalID    *string `json:"externalId"`
	Amount        int     `json:"amount"`
	PaidAmount    *int    `json:"paidAmount"`
	Items         []Item  `json:"items"`
	DevMode       bool    `json:"devMode"`
	CustomerID    *string `json:"customerId"`
	ReturnURL     *string `json:"returnUrl"`
	CompletionURL *string `json:"completionUrl"`
	Status        string  `json:"status"`
	URL           string  `json:"url"`
	ExpiresAt     string  `json:"expiresAt"`
}

// CreateCheckout creates a new checkout with the provided items and customer.
// It validates input, sends a POST request to the API, and handles errors like rate limiting and declines.
// Parameters:
//   - items: List of items to include in the checkout.
//   - customer: Customer details for the checkout.
//
// Returns: A pointer to DefaultResponse[Checkout] and an error if any.
func CreateCheckout(items []Item, customer *CheckoutCustomer) (*DefaultResponse[Checkout], error) {
	apiKey := os.Getenv("ABACATEPAY_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("ABACATEPAY_API_KEY not set")
	}

	reqBody := CreateCheckoutRequest{
		Items:         items,
		Customer:      customer,
		ReturnURL:     "https://docs.abacatepay.com/back",
		CompletionURL: "https://yoursite.com/success",
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", BaseURL+"/checkouts/create", bytes.NewBuffer(jsonBody))
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

	if resp.StatusCode == 429 {
		// Rate limited, implement exponential backoff
		fmt.Println("Rate limited, retrying with backoff...")
		time.Sleep(2 * time.Second)            // Simple backoff
		return CreateCheckout(items, customer) // Retry
	}

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		if strings.Contains(string(body), "decline") {
			return nil, fmt.Errorf("payment declined: %s", string(body))
		}
		return nil, fmt.Errorf("api error: status %d - %s", resp.StatusCode, string(body))
	}

	var result DefaultResponse[Checkout]
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &result, nil
}

// ListCheckouts lists existing checkouts with pagination.
// Useful for admin dashboards or transaction history.
// Parameters:
//   - page: Page number for pagination.
//   - limit: Number of items per page.
//
// Returns: A pointer to DefaultResponse[[]Checkout] and an error if any.
func ListCheckouts(page int, limit int) (*DefaultResponse[[]Checkout], error) {
	apiKey := os.Getenv("ABACATEPAY_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("ABACATEPAY_API_KEY not set")
	}

	url := fmt.Sprintf("%s/checkouts/list?page=%d&limit=%d", BaseURL, page, limit)
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

	var result DefaultResponse[[]Checkout]
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &result, nil
}

// GetCheckout retrieves a specific checkout by ID.
// Useful for status checking or order details.
// Parameters:
//   - id: Checkout ID to retrieve.
//
// Returns: A pointer to DefaultResponse[Checkout] and an error if any.
func GetCheckout(id string) (*DefaultResponse[Checkout], error) {
	apiKey := os.Getenv("ABACATEPAY_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("ABACATEPAY_API_KEY not set")
	}

	url := fmt.Sprintf("%s/checkouts/get?id=%s", BaseURL, id)
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

	var result DefaultResponse[Checkout]
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &result, nil
}
