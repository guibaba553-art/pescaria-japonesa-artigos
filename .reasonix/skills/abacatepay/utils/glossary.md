# Glossary

Concepts and technical terms of AbacatePay explained simply.

## Welcome to the Glossary

Found a term you don't know? This glossary explains the main concepts and technical terms used in AbacatePay documentation in a simple and direct way.

## 🔐 Authentication and Security

### Bearer Token
Also called **API key**, it's the authentication method used to authorize your requests to the AbacatePay API. The key is sent in the HTTP header `Authorization: Bearer your_api_key`. Without a valid key, no request will be accepted.

### Webhook Secret
A unique and secret string that ensures received webhooks really came from AbacatePay. It's sent in the webhook URL as a query string parameter and must be validated on your server to avoid malicious requests.

## 🏗️ Environments and Modes

### Dev Mode (Development Mode)
Testing environment where all transactions are **simulated**. Nothing is actually charged and you can test as many times as you want without risks. Ideal for developing and validating your integration before going to production.

### Sandbox
Another term for testing/development environment. In AbacatePay, the environment is determined by the API key used (Dev mode key = sandbox, Production key = real environment).

### Production
Real environment where transactions are processed for real and real values are moved. Requires verified account and AbacatePay approval.

## 💳 Payments and Charges

### Checkout
Secure page provided by AbacatePay where your customers complete payment. There are two types:

- **Integrated Checkout**: You create a charge and AbacatePay generates a URL where the customer completes payment on a page managed by us.
- **Transparent Checkout**: You receive a PIX QRCode or copy-paste code and manage the entire payment experience in your own application.

### Payment Gateway
Intermediate platform that processes payments between customer and seller. AbacatePay is a payment gateway that facilitates PIX and credit card transactions.

### Fintech
Company that uses technology to offer financial services. AbacatePay is a fintech focused on simplifying payments.

### Payout
Money transfer from your AbacatePay account to another account (yours or third parties). Also called withdrawal or external transfer.

## 📝 Data Structure

### External ID
Unique identifier created by you to relate AbacatePay transactions with your system records. Useful for searching payments using your own order codes.

### Metadata
Additional data you can attach to transactions, customers, or products. It's a flexible object where you can store custom information for your integration.

### Tax ID
Brazilian tax identifier (CPF for individuals, CNPJ for companies). Required for some operations and used for compliance.

## 📊 Metrics and Analytics

### MRR (Monthly Recurring Revenue)
Total recurring revenue expected in a month, calculated from active subscriptions.

### ARR (Annual Recurring Revenue)
Total recurring revenue expected in a year (MRR × 12).

### Churn Rate
Percentage of customers who cancel their subscriptions in a given period.

## 🔄 Operations

### Idempotency
Guarantee that an operation performed multiple times has the same effect as if performed once. In APIs, it prevents duplicate charges from retries.

### Rate Limiting
Restriction on the number of API requests you can make in a certain time period to prevent abuse.

### Retry Logic
Automatic retry mechanism for failed requests, usually with exponential backoff.

## 🌐 Other Terms

### PIX
Brazilian instant payment system, similar to instant transfers. Fast, free, and available 24/7.

### QR Code
Two-dimensional barcode that can store information. In payments, used for PIX transactions.

### Webhook
HTTP callback sent by AbacatePay to your server when events occur (e.g., payment completed).

### SDK
Software Development Kit - libraries that make integration easier by providing ready-made functions.

## Need Help?

If you still have questions, check:
- [FAQ](../faq) — Frequently asked questions
- [Support](https://discord.com/channels/1303726278670553158/1303730939490336819) — Community Discord

## Official Documentation

For the complete glossary, see [AbacatePay Glossary Docs](https://docs.abacatepay.com/glossario).