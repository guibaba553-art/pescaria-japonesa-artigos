# Going to Production

How to leave dev mode and start billing.

## Verification Process

When migrating from the development environment to production, you'll need to complete your account verification process. This process is necessary to ensure security and compliance of operations.

### Project Validation
In addition to document verification, our team also validates if your project is within specifications and in compliance with our terms of use and operating rules.

Before starting the process, check if your operation is in our [list of supported operations](/operacoes-suportadas) to ensure we can support your business.

## Account Verification Steps

To activate your account in production, follow these steps:

1. **Access Production Mode**: In the dashboard, switch to production mode.

2. **Submit Documents**: Provide required identification and business documents.

3. **Wait for Approval**: Our team will review your submission (usually 1-3 business days).

4. **Generate Production Keys**: Once approved, create API keys for production.

5. **Update Your Integration**: Replace dev keys with production keys in your code.

## Security Checklist

Before going live:

- [ ] Use HTTPS for all webhook endpoints
- [ ] Implement proper error handling and logging
- [ ] Set up monitoring and alerts
- [ ] Test with small amounts first
- [ ] Have a rollback plan

## Best Practices for Production

### Code Quality
- Use environment variables for sensitive data
- Implement comprehensive error handling
- Add logging for debugging
- Write unit and integration tests

### Performance
- Implement caching where appropriate
- Use connection pooling for databases
- Monitor response times and error rates
- Set up proper rate limiting

### Monitoring
- Track API usage and costs
- Set up alerts for failed payments
- Monitor webhook delivery
- Keep detailed logs for auditing

### Compliance
- Ensure GDPR/LGPD compliance for data handling
- Keep customer data secure
- Implement proper data retention policies
- Regular security audits

## Going Live Checklist

- [ ] Account verified and approved
- [ ] Production API keys generated
- [ ] Integration updated with production keys
- [ ] Webhooks configured with production URLs
- [ ] Final testing with real payment methods
- [ ] Monitoring and alerting set up
- [ ] Support contact information ready

## Common Issues and Solutions

### Account Not Approved
- Ensure all required documents are submitted
- Check if your business type is supported
- Contact support for clarification

### Integration Problems
- Double-check API keys and endpoints
- Verify webhook signatures
- Test with small transactions first

### Performance Issues
- Implement proper error handling
- Add retry logic with exponential backoff
- Monitor API rate limits

## Support

If you encounter issues during the production migration:

- Check the [FAQ](../faq) for common questions
- Contact support through the dashboard
- Join our [Discord community](https://discord.com/channels/1303726278670553158/1303730939490336819)

## Related Resources

- [Dev Mode](../devmode) — Testing environment details
- [API Keys](../auth) — Key management
- [Security](../security) — Security best practices

## Official Documentation

For complete production deployment guide, see [AbacatePay Production Docs](https://docs.abacatepay.com/production).