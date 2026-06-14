# Public MRR & Revenue

Access public financial data (if enabled) for transparency or dashboards.

## Operations
- **Get MRR**: Monthly Recurring Revenue.
- **Merchant Info**: Public merchant profile.
- **Revenue**: Total revenue metrics.

## TS Example
(Source: `examples/ts/mrr.ts`)

```typescript
export async function getMRR() {
    try {
        const response = await fetch(`${BASE_URL}/mrr`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${API_KEY}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log("MRR Data:", data);
        return data;
    } catch (error) {
        console.error('Error fetching MRR:', error);
        throw error;
    }
}

export async function getMerchantInfo() {
    try {
        const response = await fetch(`${BASE_URL}/merchant-info`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${API_KEY}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log("Merchant Info:", data);
        return data;
    } catch (error) {
        console.error('Error fetching Merchant Info:', error);
        throw error;
    }
}

export async function getRevenue() {
    try {
        const response = await fetch(`${BASE_URL}/revenue`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${API_KEY}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log("Revenue Data:", data);
        return data;
    } catch (error) {
        console.error('Error fetching Revenue:', error);
        throw error;
    }
}
```