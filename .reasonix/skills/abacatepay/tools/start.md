# Getting Started

Start using the AbacatePay API in minutes.

## Prerequisites

Before you begin, you need:

- An AbacatePay account
- An API key (created in the dashboard)
- Basic knowledge of HTTP and JSON

### New to AbacatePay?
If you don't have an account yet, access the [dashboard](https://dashboard.abacatepay.com) and create your free account.

## Step 1: Get Your API Key

First, create an API key in the AbacatePay dashboard:

1. **Access the Dashboard**: Log in to the [AbacatePay dashboard](https://dashboard.abacatepay.com)
2. **Create an API Key**: Navigate to the integrations section and click "Create Key"
3. **Copy Your Key**: Copy the generated key and store it securely

**Important**: Your API key is a sensitive credential. Never share it publicly or commit it to code repositories.

## Step 2: Make Your First Request

Let's create a simple checkout using curl:

```bash
curl -X POST "https://api.abacatepay.com/v2/checkouts/create" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "id": "item_1",
        "quantity": 1
      }
    ],
    "customer": {
      "name": "Victor Albuquerque",
      "email": "albuquerquesz@abacatepay.com"
    },
    "returnUrl": "https://example.com/success",
    "completionUrl": "https://example.com/complete"
  }'
```

## Step 3: Handle the Response

You'll receive a response like this:

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

## Step 4: Test the Payment

1. Open the `checkoutUrl` in your browser
2. Complete the payment using test credentials
3. Verify the transaction in your dashboard

## Next Steps

- Explore the [API Reference](../api-reference) for all endpoints
- Set up [webhooks](../webhooks) for real-time notifications
- Learn about [authentication](../auth) and security best practices
- Check the [examples](../examples) for code samples in different languages

## Need Help?

- Join our [Discord community](https://discord.com/channels/1303726278670553158/1303730939490336819)
- Check the [FAQ](../faq) for common questions
- Contact support through the dashboard

## Official Documentation

For the complete quickstart guide, see [AbacatePay Quickstart Docs](https://docs.abacatepay.com/start/quickstart).
