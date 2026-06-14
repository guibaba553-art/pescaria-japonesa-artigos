# Payouts (Withdrawals)

Automate the withdrawal of funds from your Abacatepay account to your bank account.

## Operations
- **Create**: Request a payout.
- **Batch Create**: Request multiple payouts in a single request for efficiency.
- **List/Get**: Check status of payouts.

## Go Example
(Source: `examples/go/payouts.go`)

```go
func CreatePayout(amount int, externalID string) (*PayoutResponse, error)
func BatchCreatePayouts(payouts []PayoutData) (*BatchPayoutResponse, error)
func ListPayouts(page int, limit int) (*PayoutListResponse, error)
```

## Error Handling and Edge Cases

### Payout Failures
- **Declines**: Handle insufficient balance, bank issues.
- **Rate Limits**: Implement backoff for API limits.
- **Validation**: Ensure valid amount and bank details.
- **Logging**: Log payout statuses and errors.
- **Fallbacks**: Notify user and retry or escalate.