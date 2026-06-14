# Dev Mode

Understand Dev mode and learn to use this environment to test your integration safely.

## What is Dev Mode?

**Dev mode** is AbacatePay's testing environment.
It allows you to experiment with the entire platform without risk, simulating payments, charges, and webhooks before going to production.

## What is Dev Mode?

When you create your account, you start in Dev mode.
In this environment:

- Payments are **simulated**
- Nothing is actually charged
- You can test as many times as you want
- Your tests don't affect production data

It's the ideal place to build and validate your entire integration.

### Why Use Dev Mode?
- Test your integration safely
- Simulate different types of payment
- Configure webhooks without risk
- Experiment with all API features

## How to Use Dev Mode

1. **Create an Account**: Sign up at [dashboard.abacatepay.com](https://dashboard.abacatepay.com) — you're automatically in Dev mode.

2. **Generate API Keys**: Go to Settings > API Keys and create keys for Dev mode.

3. **Start Testing**: Use the API or SDKs with your Dev keys. All operations are simulated.

4. **Simulate Payments**: For checkouts, use test card numbers or simulate Pix payments through the dashboard.

## Simulating Different Scenarios

### Successful Payments
- Use any valid test data
- Payments will appear as "paid" immediately

### Failed Payments
- Use specific test values to trigger failures
- Check error responses in your integration

### Webhooks
- Configure webhook URLs in Dev mode
- All webhook events are sent normally
- Use the dashboard to trigger test webhooks

## Transitioning to Production

When ready:

1. **Create Production Keys**: In the dashboard, switch to Production mode and generate new keys.

2. **Update Your Code**: Replace Dev API keys with Production ones.

3. **Test Thoroughly**: Do final tests with small amounts.

4. **Go Live**: Monitor your first real transactions.

## Best Practices

- **Use Realistic Data**: Test with data similar to production.
- **Test Edge Cases**: Invalid cards, network failures, timeouts.
- **Monitor Logs**: Check API logs in the dashboard.
- **Version Control**: Keep test configurations separate from production.

## Limitations

- No real money transactions
- Some features may have simplified behavior
- Rate limits may be higher than production

## Troubleshooting

### API Key Issues
- Ensure you're using Dev mode keys
- Check key permissions

### Webhook Problems
- Verify URLs are accessible
- Check signature verification

### Simulation Errors
- Use correct test data formats
- Contact support for complex scenarios

## Related Resources

- [API Keys](../auth) — How to create and manage keys
- [Production Guide](../production) — Best practices for going live
- [CLI](../cli) — Development tools for testing

## Official Documentation

For detailed Dev mode usage, see [AbacatePay Dev Mode Docs](https://docs.abacatepay.com/devmode).