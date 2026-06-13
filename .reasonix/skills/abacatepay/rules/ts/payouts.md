# Payouts (Withdrawals)

Automate the withdrawal of funds from your Abacatepay account to your bank account.

## Operations
- **Create**: Request a payout.
- **Batch Create**: Request multiple payouts in a single request for efficiency.
- **List/Get**: Check status of payouts.

## TS Example
(Source: `examples/ts/payouts.ts`)

```typescript
export async function createPayout() {
  try {
    const payout = await abacate.payout.create({
      amount: 10000,
      externalId: "saque-123"
    });

    console.log("Payout created:", payout.id);
    return payout;
  } catch (error) {
    console.error("Error creating payout:", error);
    throw error;
  }
}

export async function listPayouts(page: number = 1, limit: number = 20) {
  try {
    const payouts = await abacate.payout.list({
      page,
      limit
    });

    console.log("Payouts retrieved");
    return payouts;
  } catch (error) {
    console.error("Error listing payouts:", error);
    throw error;
  }
}

export async function getPayout(id: string) {
  try {
    const payout = await abacate.payout.get({ id });

    console.log("Payout retrieved:", payout.id);
    return payout;
  } catch (error) {
    console.error("Error getting payout:", error);
    throw error;
  }
}


```

## Error Handling and Edge Cases

### Payout Failures
- **Declines**: Handle insufficient balance, bank issues.
- **Rate Limits**: Implement backoff for API limits.
- **Validation**: Ensure valid amount and bank details.
- **Logging**: Log payout statuses and errors.
- **Fallbacks**: Notify user and retry or escalate.