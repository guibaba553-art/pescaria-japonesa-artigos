# Go Integration

Direct HTTP integration for AbacatePay API in Go - Use pure requests since the official SDK is not yet updated for v2.

## Installation

No special installation needed - use Go's standard `net/http` package.

## Quick Usage

```go
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
)

const BaseURL = "https://api.abacatepay.com/v2"

func main() {
	apiKey := os.Getenv("ABACATEPAY_API_KEY")
	// Use the API...
}
```

## Creating a Charge

```go
type CheckoutItem struct {
	ID       string `json:"id"`
	Quantity int    `json:"quantity"`
}

type CreateCheckoutRequest struct {
	Items    []CheckoutItem `json:"items"`
	Customer struct {
		Name  string `json:"name"`
		Email string `json:"email"`
	} `json:"customer"`
	ReturnURL     string `json:"returnUrl"`
	CompletionURL string `json:"completionUrl"`
}

func CreateCheckout(req CreateCheckoutRequest) (map[string]interface{}, error) {
	apiKey := os.Getenv("ABACATEPAY_API_KEY")
	jsonBody, _ := json.Marshal(req)

	request, _ := http.NewRequest("POST", BaseURL+"/checkouts/create", bytes.NewBuffer(jsonBody))
	request.Header.Set("Authorization", "Bearer "+apiKey)
	request.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("API error: %d", resp.StatusCode)
	}

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	return result, nil
}
```

## Response

```json
{
  "data": {
    "id": "bill_123456789",
    "amount": 10000,
    "currency": "BRL",
    "status": "pending",
    "checkoutUrl": "https://pay.abacatepay.com/bill_123456789",
    "expiresAt": "2023-12-31T23:59:59Z"
  },
  "error": null,
  "success": true
}
```

## Managing Customers

```go
type CreateCustomerRequest struct {
	Name   string `json:"name"`
	Email  string `json:"email"`
	TaxID  string `json:"taxId"`
}

func CreateCustomer(req CreateCustomerRequest) (map[string]interface{}, error) {
	apiKey := os.Getenv("ABACATEPAY_API_KEY")
	jsonBody, _ := json.Marshal(req)

	request, _ := http.NewRequest("POST", BaseURL+"/customers/create", bytes.NewBuffer(jsonBody))
	request.Header.Set("Authorization", "Bearer "+apiKey)
	request.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	return result, nil
}
```

## Webhooks

```go
import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

func VerifyWebhook(rawBody, signature, secret string) error {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(rawBody))
	expectedSignature := hex.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(signature), []byte(expectedSignature)) {
		return fmt.Errorf("invalid signature")
	}
	return nil
}
```

## Error Handling

```go
checkout, err := CreateCheckout(request)
if err != nil {
	fmt.Printf("Error: %v\n", err)
	return
}

// Check for API errors
if errorMsg, ok := checkout["error"].(string); ok && errorMsg != "" {
	fmt.Printf("API Error: %s\n", errorMsg)
}
```

## Documentation

For full API reference, see [AbacatePay API Docs](https://docs.abacatepay.com).