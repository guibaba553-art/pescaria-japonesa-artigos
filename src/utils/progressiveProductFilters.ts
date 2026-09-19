export interface ProductFilterFacets {
  brands: string[];
  pounds: string[];
  sizes: string[];
  groupIds: string[];
}

interface FilterableProduct {
  id: string;
  brand?: string | null;
  pound_test?: string | null;
  size?: string | null;
}

export function filterProductsByFacets<T extends FilterableProduct>(
  products: T[],
  facets: ProductFilterFacets,
  memberships: Map<string, Set<string>>,
): T[] {
  return products.filter((product) => {
    if (facets.brands.length && (!product.brand || !facets.brands.includes(product.brand))) return false;
    if (facets.pounds.length && (!product.pound_test || !facets.pounds.includes(product.pound_test))) return false;
    if (facets.sizes.length && (!product.size || !facets.sizes.includes(product.size))) return false;

    if (facets.groupIds.length) {
      const productGroups = memberships.get(product.id);
      if (!productGroups || !facets.groupIds.every((groupId) => productGroups.has(groupId))) return false;
    }

    return true;
  });
}