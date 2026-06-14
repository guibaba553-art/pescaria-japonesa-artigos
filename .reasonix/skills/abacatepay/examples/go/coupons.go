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

// CreateCouponRequest represents the request payload for creating a coupon.
type CreateCouponRequest struct {
	Code         string                 `json:"code"`
	DiscountKind string                 `json:"discountKind"` // "PERCENTAGE" or "FIXED"
	Discount     int                    `json:"discount"`     // percentage or amount in cents
	MaxRedeems   int                    `json:"maxRedeems"`   // -1 for unlimited
	Notes        string                 `json:"notes,omitempty"`
	Metadata     map[string]interface{} `json:"metadata,omitempty"`
}

// Coupon represents a discount coupon object.
type Coupon struct {
	ID           string `json:"id"`
	Code         string `json:"code"`
	DiscountKind string `json:"discountKind"`
	Discount     int    `json:"discount"`
	MaxRedeems   int    `json:"maxRedeems"`
	RedeemsCount int    `json:"redeemsCount"`
	Notes        string `json:"notes,omitempty"`
	Status       bool   `json:"status"`
	CreatedAt    string `json:"createdAt"`
	UpdatedAt    string `json:"updatedAt"`
}

// CouponActionRequest represents a request with coupon ID for actions like delete or toggle.
type CouponActionRequest struct {
	ID string `json:"id"`
}

// CreateCoupon creates a new discount coupon.
// Coupons can be percentage or fixed amount discounts.
// Parameters:
//   - req: Coupon creation request data.
//
// Returns: A pointer to DefaultResponse[Coupon] and an error if any.
func CreateCoupon(req CreateCouponRequest) (*DefaultResponse[Coupon], error) {
	apiKey := os.Getenv("ABACATEPAY_API_KEY")

	if apiKey == "" {
		return nil, fmt.Errorf("ABACATEPAY_API_KEY not set")
	}

	jsonBody, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	reqAPI, err := http.NewRequest("POST", BaseURL+"/coupons/create", bytes.NewBuffer(jsonBody))
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

	var result DefaultResponse[Coupon]

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &result, nil
}

// ListCoupons lists all coupons with their status and usage.
// Useful for coupon management dashboards.
// Parameters:
//   - page: Page number for pagination.
//   - limit: Number of items per page.
//
// Returns: A pointer to DefaultResponse[[]Coupon] and an error if any.

func ListCoupons(page int, limit int) (*DefaultResponse[[]Coupon], error) {
	apiKey := os.Getenv("ABACATEPAY_API_KEY")

	if apiKey == "" {
		return nil, fmt.Errorf("ABACATEPAY_API_KEY not set")
	}

	url := fmt.Sprintf("%s/coupons/list?page=%d&limit=%d", BaseURL, page, limit)

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

	var result DefaultResponse[[]Coupon]

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &result, nil
}

// GetCoupon retrieves a specific coupon by ID.

// Useful for validation or detailed coupon info.

// Parameters:

//   - id: Coupon ID to retrieve.

//

// Returns: A pointer to DefaultResponse[Coupon] and an error if any.

func GetCoupon(id string) (*DefaultResponse[Coupon], error) {
	apiKey := os.Getenv("ABACATEPAY_API_KEY")

	if apiKey == "" {
		return nil, fmt.Errorf("ABACATEPAY_API_KEY not set")
	}

	url := fmt.Sprintf("%s/coupons/get?id=%s", BaseURL, id)

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

	var result DefaultResponse[Coupon]

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &result, nil
}

// DeleteCoupon deletes a coupon by ID.

// Parameters:

//   - id: Coupon ID to delete.

//

// Returns: An error if any.

func DeleteCoupon(id string) error {
	apiKey := os.Getenv("ABACATEPAY_API_KEY")

	if apiKey == "" {
		return fmt.Errorf("ABACATEPAY_API_KEY not set")
	}

	reqBody := CouponActionRequest{ID: id}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return err
	}

	reqAPI, err := http.NewRequest("DELETE", BaseURL+"/coupons/delete", bytes.NewBuffer(jsonBody))
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

// ToggleCoupon toggles the active status of a coupon.

// Parameters:

//   - id: Coupon ID to toggle.

//

// Returns: A pointer to DefaultResponse[Coupon] and an error if any.

func ToggleCoupon(id string) (*DefaultResponse[Coupon], error) {
	apiKey := os.Getenv("ABACATEPAY_API_KEY")

	if apiKey == "" {
		return nil, fmt.Errorf("ABACATEPAY_API_KEY not set")
	}

	reqBody := CouponActionRequest{ID: id}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	reqAPI, err := http.NewRequest("PATCH", BaseURL+"/coupons/toggle", bytes.NewBuffer(jsonBody))
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

	var result DefaultResponse[Coupon]

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &result, nil
}
