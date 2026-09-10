export interface ProductChangeRow {
  id: string;
  product_id: string | null;
  variation_id: string | null;
  product_name: string | null;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

const FIELD_LABELS: Record<string, string> = {
  sku: 'Código de barras / SKU',
  stock: 'Estoque',
  price: 'Preço',
  sale_price: 'Preço promocional (site)',
  sale_price_pdv: 'Preço promocional (PDV)',
  sale_starts_at: 'Início da promoção',
  sale_ends_at: 'Fim da promoção',
  sale_channel: 'Canal da promoção',
  name: 'Nome',
  cost_price: 'Custo',
  ncm: 'NCM',
  category: 'Categoria',
  subcategory: 'Subcategoria',
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

const MONEY_FIELDS = new Set(['price', 'sale_price', 'sale_price_pdv', 'cost_price']);

export function formatChangeValue(field: string, value: string | null): string {
  if (value === null || value === '') return '—';
  if (MONEY_FIELDS.has(field)) {
    const n = Number(value);
    if (!Number.isNaN(n)) {
      return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
  }
  if (field === 'sale_starts_at' || field === 'sale_ends_at') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString('pt-BR');
  }
  return value;
}
