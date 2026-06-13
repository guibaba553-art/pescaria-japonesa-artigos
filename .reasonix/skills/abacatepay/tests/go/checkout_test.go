package main

import (
	"testing"
)

func TestCreateCheckout(t *testing.T) {
	// Note: This is an example test. In a real scenario, use httptest or mocks.
	// For integration tests, set ABACATEPAY_API_KEY environment variable.

	items := []Item{{ID: "prod_123", Quantity: 1}}
	customer := &Customer{Name: "Victor Albuquerque", Email: "albuquerquesz@abacatepay.com", Cellphone: "+5511999999999", TaxID: "12345678900"}

	// Mock or skip if no API key
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	_, err := CreateCheckout(items, customer)
	if err != nil {
		t.Errorf("CreateCheckout failed: %v", err)
	}
}

func TestListCheckouts(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	_, err := ListCheckouts(1, 10)
	if err != nil {
		t.Errorf("ListCheckouts failed: %v", err)
	}
}

func TestGetCheckout(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	// Assume a valid ID exists
	_, err := GetCheckout("some_id")
	if err != nil {
		t.Errorf("GetCheckout failed: %v", err)
	}
}
