# Abacatepay Checkout Integration (Go)

Checkouts are the simplest way to receive one-time payments.

## Structs & Types

Using typed structs ensures data integrity in your Go application.

```go
type CheckoutItem struct {
	ID       string `json:"id"`
	Quantity int    `json:"quantity"`
}

type CreateCheckoutRequest struct {
	Items         []CheckoutItem         `json:"items"`
	Customer      Customer               `json:"customer"`
	ExternalID    string                 `json:"externalId,omitempty"` // For linking/searching
	Metadata      map[string]interface{} `json:"metadata,omitempty"`   // Extra data
	ReturnURL     string                 `json:"returnUrl"`
	CompletionURL string                 `json:"completionUrl"`
}

type Customer struct {
	Name      string `json:"name"`
	Email     string `json:"email"`
	TaxID     string `json:"taxId"` // CPF/CNPJ
	Cellphone string `json:"cellphone,omitempty"`
}
```

## Features
- Supports Pix and Credit Card.
- Hosted payment page.
- **Traceability**: `ExternalID` allows you to link Abacatepay transactions with your own system records (e.g., your Order ID). You can use it to search for payments using your own codes.

## Go Example
(Source: `examples/go/checkout.go`)
... (rest of the file) ...

// See examples/go/checkout.go for full struct definitions
func CreateCheckout(items []Item, customer *Customer) (*CheckoutResponse, error) {
    // ... implementation using BaseURL+"/checkouts/create"
}

## Error Handling and Edge Cases

### Common Edge Cases
- **Payment Declines**: Handle insufficient funds, invalid cards, etc., by notifying the user and offering alternatives.
- **Rate Limits**: Respect API rate limits.
- **Validation**: Validate inputs (e.g., email format, required fields) before API calls.
- **Fallbacks**: If checkout creation fails, provide manual payment options.

### Examples
- Use error returns for API calls.
- Implement logging for errors.
- For rate limits, check response headers and retry with backoff.