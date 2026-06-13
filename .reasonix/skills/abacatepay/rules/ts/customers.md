# Customer Management

Manage your customers to reuse their data in future checkouts or subscriptions.

## Operations
- **Create**: Add a new customer.
- **List**: Retrieve all customers (with pagination).
- **Get**: Retrieve a specific customer by ID.
- **Delete**: Remove a customer.

## TS Example
(Source: `examples/ts/customers.ts`)

// See examples/ts/customers.ts for implementation
export async function createCustomer() {
  try {
    const customer = await abacate.customers.create({
      data: {
        email: "customer@example.com",
        taxId: "12345678900",
        name: "João Silva",
        cellphone: "+5511999999999",
        zipCode: "01310-100"
      },
      metadata: {
        customField: "value"
      }
    });

    console.log("Customer created:", customer.id);
    return customer;
  } catch (error) {
    console.error("Error creating customer:", error);
    throw error;
  }
}

export async function listCustomers() {
  try {
    const customers = await abacate.customers.list();

    console.log("Customers retrieved");
    return customers;
  } catch (error) {
    console.error("Error listing customers:", error);
    throw error;
  }
}

export async function getCustomer(id: string) {
  try {
    const customer = await abacate.customers.get({ id });

    console.log("Customer retrieved:", customer.id);
    return customer;
  } catch (error) {
    console.error("Error getting customer:", error);
    throw error;
  }
}

export async function deleteCustomer(id: string) {
  try {
    const ok = await abacate.customers.delete({ id })

    return ok;
  } catch (error) {
    console.error("Error getting customer:", error);
    throw error;
  }
}

## LGPD Compliance

When handling customer data:
- Obtain consent for data processing.
- Store only necessary data (e.g., email, name, tax ID).
- Implement data encryption and retention limits.
- Provide data portability and deletion options.