import React, { useState } from 'react';

/**
 * SECURITY WARNING:
 * Never call Abacatepay SDK directly from the frontend using your Secret Key (sk_...).
 * Instead, call your OWN backend API which then communicates with Abacatepay.
 */

interface CheckoutProps {
  items: any[];
  customer: any;
  externalId?: string;
}

const CheckoutComponent: React.FC<CheckoutProps> = ({
  items,
  customer,
  externalId,
}) => {
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateCheckout = async () => {
    setLoading(true);
    setError(null);
    try {
      // RECOMMENDED: Call your own backend endpoint
      const response = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, customer, externalId }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create checkout');
      
      setCheckoutUrl(data.url);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border rounded shadow-sm">
      <h3 className="text-lg font-bold mb-4">Complete your Purchase</h3>
      <button 
        type="button" 
        onClick={handleCreateCheckout} 
        disabled={loading}
        className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {loading ? 'Processing...' : 'Pay with Pix / Card'}
      </button>
      
      {error && <p className="mt-2 text-red-500 text-sm">{error}</p>}
      
      {checkoutUrl && (
        <div className="mt-4">
          <p className="text-green-600 font-medium">Checkout ready!</p>
          <a 
            href={checkoutUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-500 underline"
          >
            Click here to open the payment page
          </a>
        </div>
      )}
    </div>
  );
};

export default CheckoutComponent;

// Usage example in a Next.js page:
/*
import CheckoutComponent from './checkout-react';

export default function PaymentPage() {
  return (
    <CheckoutComponent
      items={[{ id: 'prod_456', quantity: 2 }]}
      customer={{
        name: 'Victor Albuquerque',
        email: 'contact@albuquerquesz.com',
        cellphone: '+5511999999999',
        taxId: '12345678900',
      }}
      externalId="pedido-123"
      returnUrl="https://links.albuquerquesz.com.br"
      completionUrl="https://me.albuquerquesz.com.br"
    />
  );
}
*/