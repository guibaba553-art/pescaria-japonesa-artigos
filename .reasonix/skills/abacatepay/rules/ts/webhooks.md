# Webhook Configuration & Security

Webhooks allow your application to react to real-time events.

## Available Events

| Event | Description |
|-------|-------------|
| `billing.paid` | Payment confirmed (Checkout and Transparent PIX) |
| `payout.done` | Withdrawal completed successfully |
| `payout.failed` | Withdrawal failed |

## Setup via Dashboard

To receive webhooks, you must configure them in the AbacatePay dashboard:

1. **Access the Dashboard**: Log in to your AbacatePay account at [dashboard.abacatepay.com](https://dashboard.abacatepay.com).
2. **Navigate to Webhooks**: Go to Settings > Webhooks.
3. **Create a Webhook**: Click "Add Webhook", enter your endpoint URL (e.g., `https://yourapp.com/webhook`), and select event types (e.g., `billing.paid`, `payout.done`).
4. **Copy the Secret**: After saving, copy the generated secret—use it for signature verification in your code.
5. **Test**: Send a test event from the dashboard to verify your endpoint.

The API will send POST requests to your URL with event data and a signature header. Always validate the signature using the secret to ensure authenticity.

## Implementation Details

To verify signatures, you need the **Raw Body** of the request. Frameworks that auto-parse JSON (like Express with `bodyParser.json()`) can break signature verification.

### Express.js Example

```typescript
import express from 'express';
import AbacatePay from '@abacatepay/sdk';

const app = express();
const abacate = AbacatePay(process.env.ABACATEPAY_API_KEY);

// Use express.raw for the webhook route to get the buffer
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-webhook-signature'] as string;
  const rawBody = req.body; // This is a Buffer

  try {
    const event = abacate.webhooks.verify(rawBody, signature);
    
    if (event.event === 'billing.paid') {
       // Use event.data.billing.externalId or event.data.billing.metadata to find your order
       console.log('Payment confirmed for:', event.data.billing.externalId);
    }

    if (event.event === 'payout.done') {
       console.log('Payout completed:', event.data.id);
    }

    if (event.event === 'payout.failed') {
       console.log('Payout failed:', event.data.id);
    }

    res.status(200).send('Webhook processed');
  } catch (err) {
    res.status(401).send('Invalid signature');
  }
});
```

### Next.js App Router Example

```typescript
// app/api/webhook/route.ts
import { NextResponse } from 'next/server';
import AbacatePay from '@abacatepay/sdk';

const abacate = AbacatePay(process.env.ABACATEPAY_API_KEY);

export async function POST(req: Request) {
  const signature = req.headers.get('x-webhook-signature');
  const rawBody = await req.text(); // Next.js allows getting text/raw body easily

  try {
    const event = abacate.webhooks.verify(rawBody, signature!);
    // Process event...
    return NextResponse.json({ received: true });
  } catch (err) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
```

## Traceability with Metadata
When you receive a webhook, use the `externalId` or `metadata` fields you sent during checkout creation to identify which user or order this event belongs to. These fields are returned in the event data.

## Handling Failures and Edge Cases
... (rest of the file) ...

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