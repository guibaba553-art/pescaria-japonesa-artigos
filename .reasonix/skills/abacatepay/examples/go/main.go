package main

// BaseURL is the base endpoint for the AbacatePay API v2.
// It is used across all examples to ensure consistency in API calls.
const BaseURL = "https://api.abacatepay.com/v2"

// Pagination contains metadata about the list response,
// helping in navigating through large sets of data.
type Pagination struct {
	Page       int `json:"page"`       // Current page number
	Limit      int `json:"limit"`      // Number of items per page
	Total      int `json:"total"`      // Total number of items available
	TotalPages int `json:"totalPages"` // Total number of pages
}

// DefaultResponse is the generic wrapper for all API responses.
// It standardizes how success data, errors, and pagination are returned.
//
// T represents the type of the Data field, which can be a specific object (e.g., *Checkout)
// or a slice of objects (e.g., []Checkout).
type DefaultResponse[T any] struct {
	// Data holds the actual payload of the response.
	// It is generic to support various resource types.
	Data T `json:"data"`

	// Error contains a descriptive error message if the request failed.
	// It is nil if the request was successful.
	Error *string `json:"error"`

	// Pagination provides navigation details for list endpoints.
	// It is omitted for single-item responses.
	Pagination *Pagination `json:"pagination,omitempty"`

	// Success indicates whether the API request was processed successfully.
	Success bool `json:"success"`
}
