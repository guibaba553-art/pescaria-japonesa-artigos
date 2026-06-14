# Abacatepay Checkout Integration

Checkouts are the simplest way to receive one-time payments.

## Schema & Types

Defining the data structures helps ensure reliable integrations.

```typescript
interface CheckoutItem {
  id: string;      // Product ID
  quantity: number;
}

interface CreateCheckoutRequest {
  items: CheckoutItem[];
  customer: {
    name: string;
    email: string;
    taxId: string;    // CPF or CNPJ
    cellphone?: string;
  };
  externalId?: string; // Optional: Your internal order ID for linking/searching
  metadata?: Record<string, any>; // Optional: Extra data for your tracking
  returnUrl: string;    // Where to redirect after payment
  completionUrl: string; // Where to redirect after completion
}
```

## Features
- Supports Pix and Credit Card.
- Hosted payment page.
- **Traceability**: `externalId` allows you to link Abacatepay transactions with your own system records (e.g., your Order ID). You can use it to search for payments using your own codes.

## TS Example
(Source: `examples/ts/checkout.ts`)
... (rest of the file) ...

// See examples/ts/checkout.ts for full implementation
export async function createCheckout() {
  const items = [{ id: "prod_456", quantity: 2 }];
  const customer = {
    name: "Victor Albuquerque",
    email: "contact@albuquerquesz.com.br",
    cellphone: "+5511999999999",
    taxId: "12345678900"
  };

  try {
    const checkout = await abacate.checkouts.create({
      items,
      customer,
      externalId: "pedido-123",
      returnUrl: "https://links.albuquerquesz.com.br",
      completionUrl: "https://me.albuquerquesz.com.br",
    });

    console.log("Checkout created:", checkout.url);
    return checkout;
  } catch (error: any) {
    console.error("Error creating checkout:", error.message);
    throw error;
  }
}

## React Integration
For React applications, you can integrate checkout creation directly in components.

```tsx
// See examples/ts/checkout-react.tsx
const CheckoutComponent: React.FC<CheckoutProps> = ({
  items,
  customer,
  externalId,
  returnUrl,
  completionUrl,
}) => {
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateCheckout = async () => {
    setLoading(true);
    setError(null);
    try {
      const checkout = await abacate.checkouts.create({
        items,
        customer,
        externalId,
        returnUrl,
        completionUrl,
      });
      setCheckoutUrl(checkout.url);
    } catch (err: any) {
      setError(err.message || 'Failed to create checkout');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button type="button" onClick={handleCreateCheckout} disabled={loading}>
        {loading ? 'Creating Checkout...' : 'Create Checkout'}
      </button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {checkoutUrl && (
        <div>
          <p>Checkout created successfully!</p>
          <a href={checkoutUrl} target="_blank" rel="noopener noreferrer">
            Proceed to Payment
          </a>
        </div>
      )}
    </div>
  );
};
```

## Error Handling and Edge Cases

### Common Edge Cases
- **Payment Declines**: Handle insufficient funds, invalid cards, etc., by notifying the user and offering alternatives.
- **Rate Limits**: Respect API rate limits.
- **Validation**: Validate inputs (e.g., email format, required fields) before API calls.
- **Fallbacks**: If checkout creation fails, provide manual payment options.

### Examples
- Use error returns for API calls.
- Implement logging for errors.
- For rate limits, check response headers and retry with backoff.