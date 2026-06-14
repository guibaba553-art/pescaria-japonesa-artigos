# AbacatePay CLI

The **AbacatePay CLI** is the official command-line tool for interacting with the AbacatePay platform directly from the terminal.

Designed for **developers**, it allows creating charges, listening to webhooks, simulating payments, and automating workflows—all without leaving the terminal.

## Main Capabilities

- **Authentication**: OAuth login, multiple profiles, and session management.
- **Webhooks**: Listen, forward, and debug webhooks in real-time.
- **Payments**: Create, query, and simulate charges from the terminal.
- **Automation**: JSON output, non-interactive, and scriptable.
- **Configuration**: Global flags, output formats, and environments.
- **Utilities**: Webhook verification, updates, and debugging.

## Installation

### Go (recommended)

```bash
go install github.com/AbacatePay/abacatepay-cli@latest
```

### Homebrew (macOS / Linux)

```bash
brew install --build-from-source github.com/AbacatePay/abacatepay-cli
```

**Verify installation:**

```bash
abacatepay --version
```

## Quick Start

1. **Authenticate**:
   ```bash
   abacatepay login
   ```
   The browser will open for OAuth authentication. After authorizing, provide your local server URL to receive webhooks.

2. **Start the listener**:
   ```bash
   abacatepay listen --forward-to http://localhost:3000/webhooks/abacatepay
   ```
   You can also run `abacatepay listen` to configure forwarding via interactive menu.

3. **Create a test charge**:
   In another terminal:
   ```bash
   abacatepay payments create pix
   ```
   
   You can also run `abacatepay payments create` to choose via menu, or use `-i` flag for manual data entry.

## Design & Philosophy

The AbacatePay CLI is designed to be:

- **Explicit** — No hidden magic
- **Scriptable** — Structured and predictable output
- **CI/CD Compatible** — Fully non-interactive with flags
- **Fast** — Quick initialization and minimal footprint

### Unix-friendly
Simple output, easy to parse and integrate.

### No Heavy Dependencies
Single binary, no additional runtime.

## Related Resources

- [REST Client](../ecosystem/rest) — Lightweight and typed HTTP layer for advanced integrations.
- [Official SDKs](../sdks) — Official libraries for different languages.
- [Open Source Repository](https://github.com/abacatepay/abacatepay-cli) — Source code, issues, and contributions.
- [AbacatePay Ecosystem](../ecosystem) — See the full AbacatePay ecosystem.

The AbacatePay CLI is maintained by the AbacatePay team and the community.

## Official Documentation

For comprehensive details, installation guides, and advanced usage, see [AbacatePay CLI Docs](https://docs.abacatepay.com/cli).
