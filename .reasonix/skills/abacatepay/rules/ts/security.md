# Security Best Practices

Protecting your credentials and ensuring secure data flow is paramount when handling payments.

## API Key Management

Abacatepay use API keys with the following format:
`abc_<environment>_<hash>`

- **Development**: Keys starting with `abc_dev_...` should be used for testing.
- **Production**: Keys starting with `abc_prod_...` are for live transactions.

### Rules for Keys
1. **Server-Side Only**: NEVER expose your `sk_...` (secret key) in frontend code, client-side JavaScript, or public repositories.
2. **Environment Variables**: Always store keys in environment variables (e.g., `.env` files, KMS, or CI/CD secrets).
3. **Rotation**: Rotate your keys immediately if you suspect a leak.

## Backend-Only Operations

Operations that create checkouts, manage customers, or handle payouts MUST be performed from a secure backend environment.

- **Incorrect**: Calling `abacate.checkout.create` directly from a React component.
- **Correct**: React calls your API (e.g., `/api/checkout`), and your API calls Abacatepay.

## Webhook Verification

Always verify the HMAC signature of incoming webhooks to ensure the request originated from Abacatepay and hasn't been tampered with. (See [Webhooks Guide](webhooks.md)).

## LGPD Compliance for Customer Data

As Abacatepay operates in Brazil, comply with LGPD (Lei Geral de Proteção de Dados):
- Obtain explicit consent for data collection and processing.
- Minimize data collection to what's necessary.
- Implement data retention policies (e.g., delete after 2 years).
- Provide data access, rectification, and deletion rights.
- Encrypt sensitive data at rest and in transit.
- Conduct data protection impact assessments.

## Performance Optimizations

Improve integration performance:
- **Caching Products**: Cache product lists and details using Redis or in-memory cache to reduce API calls.
- **Batch Payouts**: Use batch payout endpoints if available, or group multiple payouts in a single request to minimize overhead.
- **Rate Limiting**: Implement client-side rate limiting to avoid API throttling.
- **Async Processing**: Handle webhooks and payouts asynchronously to avoid blocking.