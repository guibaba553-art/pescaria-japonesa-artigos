import { AbacatePay } from '@abacatepay/sdk';

// Define types for customer operations
export type CustomerData = {
  email: string;
  taxId?: string;
  name?: string;
  cellphone?: string;
  zipCode?: string;
};

export type Customer = {
  id: string;
  email: string;
  taxId: string;
  name: string;
  cellphone?: string;
  zipCode?: string;
  createdAt: string;
  updatedAt: string;
};

const abacate = AbacatePay({ secret: process.env.ABACATEPAY_API_KEY });

/**
 * Creates a new customer with personal and contact information.
 * Supports metadata for custom fields and tracking.
 * @returns Promise<Customer> - Created customer object
 */
export async function createCustomer(): Promise<Customer> {
  try {
    // Create customer - only email is required, others are recommended
    const customer = await abacate.customers.create({
      data: {
        email: "customer@example.com", // Required: valid email
        name: "João Silva",            // Optional but recommended
        taxId: "12345678900",          // Optional: CPF/CNPJ
        cellphone: "+5511999999999",   // Optional: contact phone
        zipCode: "01310-100"           // Optional: postal code
      },
      metadata: {
        customField: "value" // Optional: custom tracking data
      }
    });

    console.log("Customer created:", customer.id);
    return customer;
  } catch (error) {
    console.error("Error creating customer:", error);
    throw error;
  }
}

/**
 * Lists all customers with pagination.
 * Useful for admin interfaces or bulk operations.
 * @returns Promise<Customer[]> - Array of customers
 */
export async function listCustomers(): Promise<Customer[]> {
  try {
    // Retrieve paginated list of customers
    const customers = await abacate.customers.list();

    console.log("Customers retrieved:", customers.length, "items");
    return customers;
  } catch (error) {
    console.error("Error listing customers:", error);
    throw error;
  }
}

/**
 * Retrieves a specific customer by ID.
 * Useful for profile pages or order associations.
 * @param id - Customer ID to retrieve
 * @returns Promise<Customer> - Customer details
 */
export async function getCustomer(id: string): Promise<Customer> {
  try {
    // Fetch specific customer details
    const customer = await abacate.customers.get({ id });

    console.log("Customer retrieved:", customer.id);
    return customer;
  } catch (error) {
    console.error("Error getting customer:", error);
    throw error;
  }
}

/**
 * Deletes a customer by ID.
 * Use with caution - may affect associated subscriptions.
 * @param id - Customer ID to delete
 * @returns Promise<boolean> - Success confirmation
 */
export async function deleteCustomer(id: string): Promise<boolean> {
  try {
    // Delete customer - check for dependencies first in production
    const ok = await abacate.customers.delete({ id });

    console.log("Customer deleted:", id);
    return ok;
  } catch (error) {
    console.error("Error deleting customer:", error);
    throw error;
  }
}
