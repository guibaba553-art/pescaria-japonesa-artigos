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

// CreateCustomerRequest represents the request payload for creating a customer.
// It includes customer data and optional metadata.
type CreateCustomerRequest struct {
	Data     CustomerData           `json:"data"`
	Metadata map[string]interface{} `json:"metadata,omitempty"`
}

// CustomerData holds the core customer information.
type CustomerData struct {
	Email     string `json:"email"`
	TaxID     string `json:"taxId,omitempty"`
	Name      string `json:"name,omitempty"`
	Cellphone string `json:"cellphone,omitempty"`
	ZipCode   string `json:"zipCode,omitempty"`
}

// Customer represents a customer object with ID and data.
type Customer struct {
	ID        string          `json:"id"`
	Email     string          `json:"email"`
	TaxID     string          `json:"taxId"`
	Name      string          `json:"name"`
	Cellphone string          `json:"cellphone,omitempty"`
	ZipCode   string          `json:"zipCode,omitempty"`
	CreatedAt string          `json:"createdAt"`
	UpdatedAt string          `json:"updatedAt"`
}

// CustomerActionRequest represents a request with customer ID for actions like delete.
type CustomerActionRequest struct {
	ID string `json:"id"`
}

// CreateCustomer creates a new customer with personal and contact information.
// Supports metadata for custom fields and tracking.
// Parameters:
//   - data: Customer data including email, name, etc.
//   - metadata: Optional custom metadata.
//
// Returns: A pointer to DefaultResponse[Customer] and an error if any.
func CreateCustomer(data CustomerData, metadata map[string]interface{}) (*DefaultResponse[Customer], error) {
	apiKey := os.Getenv("ABACATEPAY_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("ABACATEPAY_API_KEY not set")
	}

	reqBody := CreateCustomerRequest{
		Data:     data,
		Metadata: metadata,
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", BaseURL+"/customers/create", bytes.NewBuffer(jsonBody))
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

	var result DefaultResponse[Customer]
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &result, nil
}

// ListCustomers lists all customers.
// Useful for admin interfaces or bulk operations.
// Returns: A pointer to DefaultResponse[[]Customer] and an error if any.
func ListCustomers() (*DefaultResponse[[]Customer], error) {
	apiKey := os.Getenv("ABACATEPAY_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("ABACATEPAY_API_KEY not set")
	}

	req, err := http.NewRequest("GET", BaseURL+"/customers/list", nil)
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

	var result DefaultResponse[[]Customer]
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &result, nil
}

// GetCustomer retrieves a specific customer by ID.
// Useful for profile pages or order associations.
// Parameters:
//   - id: Customer ID to retrieve.
//
// Returns: A pointer to DefaultResponse[Customer] and an error if any.
func GetCustomer(id string) (*DefaultResponse[Customer], error) {
	apiKey := os.Getenv("ABACATEPAY_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("ABACATEPAY_API_KEY not set")
	}

	url := fmt.Sprintf("%s/customers/get?id=%s", BaseURL, id)
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

	var result DefaultResponse[Customer]
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &result, nil
}

// DeleteCustomer deletes a customer by ID.
// Use with caution - may affect associated subscriptions.
// Parameters:
//   - id: Customer ID to delete.
//
// Returns: An error if any.
func DeleteCustomer(id string) error {
	apiKey := os.Getenv("ABACATEPAY_API_KEY")
	if apiKey == "" {
		return fmt.Errorf("ABACATEPAY_API_KEY not set")
	}

	reqBody := CustomerActionRequest{ID: id}
	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return err
	}

	reqAPI, err := http.NewRequest("DELETE", BaseURL+"/customers/delete", bytes.NewBuffer(jsonBody))
	if err != nil {
		return err
	}

	reqAPI.Header.Set("Authorization", "Bearer "+apiKey)
	reqAPI.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(reqAPI)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("api error: status %d - %s", resp.StatusCode, string(body))
	}

	return nil
}
