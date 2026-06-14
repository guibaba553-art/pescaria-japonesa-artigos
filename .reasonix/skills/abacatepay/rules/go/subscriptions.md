# Subscriptions & Products

Handle recurring billing by creating products with defined frequencies (e.g., Monthly).

## Operations
- **Create Product**: Define the recurring plan details.
- **List Products**: View available plans.

## Go Example
(Source: `examples/go/subscriptions.go`)

// See examples/go/subscriptions.go
func CreateSubscription(req CreateSubscriptionRequest) (*SubscriptionResponse, error)
func ListSubscriptions(page int, limit int) (*SubscriptionListResponse, error)