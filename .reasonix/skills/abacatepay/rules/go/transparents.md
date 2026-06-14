# Transparent Checkout

Process payments without redirecting the user away from your application.

## Operations
- **Create**: Initiate a transparent transaction.
- **Simulate**: Test payment flows (Dev mode).
- **Check**: Verify transaction status.

## Go Example
(Source: `examples/go/transparents.go`)

```go
func CreateTransparent(amount int) (*TransparentResponse, error)
func SimulateTransparent() (*TransparentResponse, error)
func CheckTransparentStatus() (*TransparentResponse, error)
```