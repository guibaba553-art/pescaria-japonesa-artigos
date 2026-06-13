import { AbacatePay } from '@abacatepay/sdk';

// Define types for product operations
export type ProductData = {
  externalId: string;
  name: string;
  price: number; // in cents
  currency: string;
  description?: string;
};

export type Product = {
  id: string;
  externalId: string;
  name: string;
  description: string | null;
  price: number;
  devMode: boolean;
  currency: string;
  createdAt: string;
  updatedAt: string;
  status: string;
};

const abacate = AbacatePay({ secret: process.env.ABACATEPAY_API_KEY });

// Simple in-memory cache for product list (use Redis in production)
const cache = new Map<string, { data: Product[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Creates a new product in the catalog.
 * Products can be used in checkouts and subscriptions.
 * @returns Promise<Product> - Created product object
 */
export async function createProduct(): Promise<Product> {
  // Create product with required fields
  const product = await abacate.products.create({
    externalId: "prod-123", // Unique identifier for your system
    name: "Abacatinho",
    price: 2500, // Price in cents (R$ 25.00)
    currency: "BRL"
  });

  console.log("Product created:", product);
  return product;
}

/**
 * Lists all products with caching for performance.
 * Cache reduces API calls and improves response time.
 * @returns Promise<Product[]> - Array of products
 */
export async function listProducts(): Promise<Product[]> {
  const cacheKey = 'products_list';

  // Check cache first to avoid unnecessary API calls
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('Returning cached products');
    return cached.data;
  }

  // Fetch from API if not cached or expired
  const products = await abacate.products.list();
  cache.set(cacheKey, { data: products, timestamp: Date.now() });

  console.log("Products retrieved:", products.length, "items");
  return products;
}

/**
 * Retrieves a specific product by ID.
 * Useful for product details or checkout preparation.
 * @param id - Product ID to retrieve
 * @returns Promise<Product> - Product details
 */
export async function getProduct(id: string): Promise<Product> {
  // Get specific product details
  const product = await abacate.products.get({ id });

  console.log("Product retrieved:", product);
  return product;
}

/**
 * Deletes a product by ID.
 * Ensure it's not referenced in active checkouts before deleting.
 * @param id - Product ID to delete
 * @returns Promise<boolean> - Success confirmation
 */
export async function deleteProduct(id: string): Promise<boolean> {
  // Delete product - check dependencies in production
  const result = await abacate.products.delete({ id });

  console.log("Product deleted:", id);
  return result;
}
