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

// CreateProductRequest represents the request payload for creating a product.
type CreateProductRequest struct {
	ExternalID  string  `json:"externalId"`
	Name        string  `json:"name"`
	Price       int     `json:"price"` // in cents
	Currency    string  `json:"currency"`
	Description *string `json:"description,omitempty"`
}

// Product represents a product object.
type Product struct {
	ID          string  `json:"id"`
	ExternalID  string  `json:"externalId"`
	Name        string  `json:"name"`
	Description *string `json:"description"`
	Price       int     `json:"price"`
	DevMode     bool    `json:"devMode"`
	Currency    string  `json:"currency"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
	Status      string  `json:"status"`
}

// ProductActionRequest represents a request with product ID for actions like delete.
type ProductActionRequest struct {
	ID string `json:"id"`
}

// CreateProduct creates a new product in the catalog.
// Products can be used in checkouts and subscriptions.
// Parameters:
//   - req: Product creation request data.
//
// Returns: A pointer to DefaultResponse[Product] and an error if any.
func CreateProduct(req CreateProductRequest) (*DefaultResponse[Product], error) {
	apiKey := os.Getenv("ABACATEPAY_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("ABACATEPAY_API_KEY not set")
	}

	jsonBody, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	reqAPI, err := http.NewRequest("POST", BaseURL+"/products/create", bytes.NewBuffer(jsonBody))
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

	var result DefaultResponse[Product]
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &result, nil
}

// ListProducts lists all products with caching for performance.
// Cache reduces API calls and improves response time.
// Parameters:
//   - page: Page number for pagination.
//   - limit: Number of items per page.
//
// Returns: A pointer to DefaultResponse[[]Product] and an error if any.
func ListProducts(page int, limit int) (*DefaultResponse[[]Product], error) {
	apiKey := os.Getenv("ABACATEPAY_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("ABACATEPAY_API_KEY not set")
	}

	url := fmt.Sprintf("%s/products/list?page=%d&limit=%d", BaseURL, page, limit)
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

	var result DefaultResponse[[]Product]
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &result, nil
}

// GetProduct retrieves a specific product by ID.
// Useful for product details or checkout preparation.
// Parameters:
//   - id: Product ID to retrieve.
//
// Returns: A pointer to DefaultResponse[Product] and an error if any.
func GetProduct(id string) (*DefaultResponse[Product], error) {
	apiKey := os.Getenv("ABACATEPAY_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("ABACATEPAY_API_KEY not set")
	}

	url := fmt.Sprintf("%s/products/get?id=%s", BaseURL, id)
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

	var result DefaultResponse[Product]
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &result, nil
}

// DeleteProduct deletes a product by ID.
// Ensure it's not referenced in active checkouts before deleting.
// Parameters:
//   - id: Product ID to delete.
//
// Returns: An error if any.
func DeleteProduct(id string) error {
	apiKey := os.Getenv("ABACATEPAY_API_KEY")
	if apiKey == "" {
		return fmt.Errorf("ABACATEPAY_API_KEY not set")
	}

	reqBody := ProductActionRequest{ID: id}
	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return err
	}

	reqAPI, err := http.NewRequest("DELETE", BaseURL+"/products/delete", bytes.NewBuffer(jsonBody))
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
