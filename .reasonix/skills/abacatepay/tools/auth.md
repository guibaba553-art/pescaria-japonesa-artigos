# API Keys

Learn how API keys work and how to use them to access AbacatePay.

## What You Can Do with Your Keys

API keys are managed directly through the dashboard. With them, you can:

- View all active keys
- Create new keys for different projects
- Revoke compromised keys or those no longer in use

### Dev Mode vs Production
All requests use the same endpoint (`https://api.abacatepay.com`).
The environment is defined **by the key used**:
- Keys created in **Dev mode** → simulated transactions
- Keys created in **Production** → real transactions

## Creating an API Key

1. **Access the Dashboard**: Log in to your AbacatePay account at [dashboard.abacatepay.com](https://dashboard.abacatepay.com).
2. **Navigate to API Keys**: Go to Settings > API Keys.
3. **Create a Key**: Click "Create API Key" and choose the environment (Dev or Production).
4. **Copy the Key**: Save the generated key securely— it won't be shown again.

## Using API Keys

Include the key in the Authorization header for all requests:

```bash
curl -X GET "https://api.abacatepay.com/v2/customers/list" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### In SDKs

```typescript
// Node.js SDK
import { AbacatePay } from '@abacatepay/sdk';
const abacate = AbacatePay({ secret: process.env.ABACATEPAY_API_KEY });
```

```go
// Go SDK
apiKey := os.Getenv("ABACATEPAY_API_KEY")

client, err := abacatepay.New(&abacatepay.ClientConfig{
    ApiKey: apiKey,
})
```

## Security Best Practices

- **Never commit keys to version control**
- **Use environment variables** to store keys
- **Rotate keys regularly** and revoke unused ones
- **Monitor API usage** through the dashboard
- **Use separate keys** for different environments/projects

## Troubleshooting

### Invalid API Key
- Check if the key is correct and active
- Ensure you're using the right environment (Dev/Prod)

### Rate Limiting
- API has rate limits; implement retries with exponential backoff
- Monitor your usage in the dashboard

### Permissions
- Some endpoints require specific permissions
- Check your account plan for limitations

## Related Resources

- [Dev Mode](../devmode) — Learn about development environment
- [Production Guide](../production) — Best practices for production deployments

## Official Documentation

For detailed API key management, see [AbacatePay Authentication Docs](https://docs.abacatepay.com/authentication).
