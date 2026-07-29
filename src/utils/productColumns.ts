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
  'brand_id',
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
  'sale_limit_qty',
  'sale_sold_qty',
  'min_sale_price',
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
  'pdv_only',
  'sale_channel',
].join(', ');

/**
 * Colunas SEGURAS de `product_variations` para telas voltadas ao cliente.
 *
 * Estas são as únicas colunas que anon/authenticated podem SELECT.
 * Telas administrativas que precisam de todas as colunas devem usar
 * `rpc('get_product_variations_admin')` ou `rpc('get_product_variations_by_product', { p_product_id })`.
 */
export const PUBLIC_VARIATION_COLUMNS = [
  'id',
  'product_id',
  'name',
  'price',
  'stock',
  'sku',
  'created_at',
  'updated_at',
  'description',
  'image_url',
  'weight_grams',
  'length_cm',
  'width_cm',
  'height_cm',
  'min_stock',
  'on_sale',
  'sale_price',
  'sale_ends_at',
  'sale_limit_qty',
  'sale_sold_qty',
  'min_sale_price',
  'sale_channel',
].join(', ');

/** Versão com variações embutidas usando apenas colunas seguras. */
export const PUBLIC_PRODUCT_COLUMNS_WITH_VARIATIONS =
  `${PUBLIC_PRODUCT_COLUMNS}, variations:product_variations(${PUBLIC_VARIATION_COLUMNS})`;
