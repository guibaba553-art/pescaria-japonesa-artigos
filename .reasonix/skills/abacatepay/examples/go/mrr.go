package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// Define structs for MRR operations
type MrrData struct {
	MRR                      float64 `json:"mrr"`
	TotalActiveSubscriptions int     `json:"totalActiveSubscriptions"`
}

type MrrResponse struct {
	Data    *MrrData `json:"data,omitempty"`
	Error   *string  `json:"error"`
	Success bool     `json:"success"`
}

type MerchantInfo struct {
	Name      string `json:"name"`
	Website   string `json:"website"`
	CreatedAt string `json:"createdAt"`
}

type Transaction struct {
	Amount int `json:"amount"`
	Count  int `json:"count"`
}

type RevenueData struct {
	TotalRevenue       int                    `json:"totalRevenue"`
	TotalTransactions  int                    `json:"totalTransactions"`
	TransactionsPerDay map[string]Transaction `json:"transactionsPerDay"`
	Revenue            float64                `json:"revenue"`
	Currency           string                 `json:"currency"`
}

var MRRBaseURL = BaseURL + "/public-mrr"

// Retrieves Monthly Recurring Revenue (MRR) data.
// Shows recurring revenue metrics for business insights.
// Returns array of MRR data points.
func GetMRR() (*DefaultResponse[[]MrrData], error) {
	apiKey := os.Getenv("ABACATEPAY_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("ABACATEPAY_API_KEY not set")
	}

	req, err := http.NewRequest("GET", MRRBaseURL+"/mrr", nil)
	if err != nil {
		return nil, fmt.Errorf("error creating request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error making request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("api error: status %d - %s", resp.StatusCode, string(body))
	}

	var result DefaultResponse[[]MrrData]
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("error decoding response: %w", err)
	}

	return &result, nil
}

// Retrieves merchant account information.
// Useful for account verification and profile data.
// Returns merchant account details.
func GetMerchantInfo() (*DefaultResponse[MerchantInfo], error) {
	apiKey := os.Getenv("ABACATEPAY_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("ABACATEPAY_API_KEY not set")
	}

	req, err := http.NewRequest("GET", MRRBaseURL+"/merchant-info", nil)
	if err != nil {
		return nil, fmt.Errorf("error creating request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error making request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("api error: status %d - %s", resp.StatusCode, string(body))
	}

	var result DefaultResponse[MerchantInfo]
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("error decoding response: %w", err)
	}

	return &result, nil
}

// Retrieves revenue data and analytics.
// Provides total revenue metrics for business reporting.
// Returns array of revenue data points.
func GetRevenue() (*DefaultResponse[[]RevenueData], error) {
	apiKey := os.Getenv("ABACATEPAY_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("ABACATEPAY_API_KEY not set")
	}

	req, err := http.NewRequest("GET", MRRBaseURL+"/revenue", nil)
	if err != nil {
		return nil, fmt.Errorf("error creating request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error making request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("api error: status %d - %s", resp.StatusCode, string(body))
	}

	var result DefaultResponse[[]RevenueData]
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("error decoding response: %w", err)
	}

	return &result, nil
}
