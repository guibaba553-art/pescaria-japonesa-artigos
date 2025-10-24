// Tipos centralizados para produtos
export interface ProductVariation {
  id: string;
  product_id: string;
  name: string;
  value: string;
  price_adjustment: number;
  stock: number;
  created_at?: string;
  updated_at?: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  short_description?: string;
  price: number;
  category: string;
  image_url: string | null;
  images?: string[] | null;
  rating: number;
  stock: number;
  featured: boolean;
  on_sale: boolean;
  sale_price?: number;
  sale_ends_at?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  variations?: ProductVariation[];
}

export interface CartProduct {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
}
