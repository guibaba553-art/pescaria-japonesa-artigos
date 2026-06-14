# Webhook Configuration & Security

Webhooks allow your application to react to real-time events (e.g., `checkout.paid`).

## Setup via Dashboard

To receive webhooks, you must configure them in the AbacatePay dashboard:

1. **Access the Dashboard**: Log in to your AbacatePay account at [dashboard.abacatepay.com](https://dashboard.abacatepay.com).
2. **Navigate to Webhooks**: Go to Settings > Webhooks.
3. **Create a Webhook**: Click "Add Webhook", enter your endpoint URL (e.g., `https://yourapp.com/webhook`), and select event types (e.g., `checkout.paid`, `subscription.created`).
4. **Copy the Secret**: After saving, copy the generated secret—use it for signature verification in your code.
5. **Test**: Send a test event from the dashboard to verify your endpoint.

The API will send POST requests to your URL with event data and a signature header. Always validate the signature using the secret to ensure authenticity.

## Security
Always verify the webhook signature to ensure the request comes from Abacatepay.

1.  **Secret in Query**: Simple check (`?webhookSecret=...`).
2.  **Robust HMAC Validation**:
    - Calculate `HMAC-SHA256(rawBody, secret)` and compare with `X-Webhook-Signature` using constant-time comparison.
    - Include timestamp validation (e.g., check `X-Webhook-Timestamp` and reject events older than 5 minutes) to prevent replay attacks.
    - Store webhook secrets securely using environment variables.
    - Log invalid attempts for monitoring.

## Example
(Source: `examples/go/webhook.go`)

mac := hmac.New(sha256.New, []byte(secret))
mac.Write(bodyBytes)
expectedSignature := hex.EncodeToString(mac.Sum(nil))

## Handling Failures and Edge Cases

### Webhook Failures
- **Retries**: If processing fails, implement retries (e.g., exponential backoff).
- **Idempotency**: Use event IDs to prevent duplicate processing.
- **Validation**: Verify payload structure before processing.
- **Logging**: Log all attempts and failures.
- **Fallbacks**: Queue failed webhooks or alert developers.

### Examples
- Return appropriate HTTP status codes (200 for success, 500 for processing errors to trigger retries).
- Implement idempotent operations based on event IDs.

## Monitoring Tips

- **Logging**: Log all incoming webhooks with timestamps, event types, and processing outcomes.
- **Metrics**: Track success rates, failure rates, and response times using tools like Prometheus or DataDog.
- **Alerts**: Set up alerts for high failure rates or missing events.
- **Dashboards**: Create dashboards to visualize webhook health and performance.
- **Retry Monitoring**: Monitor retry attempts and implement exponential backoff.
- **Idempotency Checks**: Ensure events are not processed multiple times by tracking event IDs.
