/**
 * Colunas SEGURAS de `products` para telas voltadas ao cliente (anon/authenticated).
 *
 * Por motivos de segurança, anon/authenticated só têm GRANT nas colunas
 * abaixo. Usar `select('*')` causa "permission denied for table products".
 * Telas administrativas (admin/employee) devem usar a RPC `get_products_admin`.
 */
export const PUBLIC_PRODUCT_COLUMNS = [
  'id',
  'name',
  'description',
  'short_description',
  'price',
  'category',
  'subcategory',
  'brand',
  'size',
  'pound_test',
  'image_url',
  'images',
  'rating',
  'stock',
  'featured',
  'on_sale',
  'sale_price',
  'sale_ends_at',
  'minimum_quantity',
  'sku',
  'sold_by_weight',
  'weight_grams',
  'length_cm',
  'width_cm',
  'height_cm',
  'created_at',
  'updated_at',
  'ncm',
  'cest',
  'csosn',
  'cfop',
  'origem',
  'unidade_comercial',
  'include_in_nfe',
].join(', ');

/** Versão com variações embutidas (também só colunas seguras). */
export const PUBLIC_PRODUCT_COLUMNS_WITH_VARIATIONS =
  `${PUBLIC_PRODUCT_COLUMNS}, variations:product_variations(*)`;
