export type SalesChannel = 'all' | 'pdv' | 'site';

export interface ProductAnalysisOrder {
  id: string;
  created_at: string;
  status: string;
  source: string | null;
}

export interface ProductAnalysisItem {
  order_id: string;
  product_id: string;
  quantity: number;
  price_at_purchase: number;
}

export interface ProductAnalysisProduct {
  id: string;
  name: string;
}

export interface ProductSalesRow {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
  orders: number;
}

const SITE_FINALIZED = new Set(['entregado', 'retirado', 'pronto_retirada', 'em_preparo', 'enviado']);

export function aggregateProductSales({
  orders,
  items,
  products,
  productIds,
  channel,
}: {
  orders: ProductAnalysisOrder[];
  items: ProductAnalysisItem[];
  products: ProductAnalysisProduct[];
  productIds: Set<string>;
  channel: SalesChannel;
}) {
  const validOrders = new Map(
    orders
      .filter((order) => {
        const isPdv = order.source === 'pdv';
        if (channel === 'pdv' && !isPdv) return false;
        if (channel === 'site' && isPdv) return false;
        return isPdv ? order.status === 'entregado' : SITE_FINALIZED.has(order.status);
      })
      .map((order) => [order.id, order]),
  );
  const names = new Map(products.map((product) => [product.id, product.name]));
  const productRows = new Map<string, ProductSalesRow>();
  const daily = new Map<string, { date: string; quantity: number; revenue: number }>();
  const distinctOrders = new Set<string>();
  let quantity = 0;
  let revenue = 0;

  items.forEach((item) => {
    if (!productIds.has(item.product_id)) return;
    const order = validOrders.get(item.order_id);
    if (!order) return;
    const itemQuantity = Number(item.quantity || 0);
    const itemRevenue = itemQuantity * Number(item.price_at_purchase || 0);
    const row = productRows.get(item.product_id) ?? {
      productId: item.product_id,
      name: names.get(item.product_id) ?? 'Produto',
      quantity: 0,
      revenue: 0,
      orders: 0,
    };
    row.quantity += itemQuantity;
    row.revenue += itemRevenue;
    productRows.set(item.product_id, row);
    quantity += itemQuantity;
    revenue += itemRevenue;
    distinctOrders.add(item.order_id);

    const date = new Date(order.created_at).toLocaleDateString('pt-BR');
    const day = daily.get(date) ?? { date, quantity: 0, revenue: 0 };
    day.quantity += itemQuantity;
    day.revenue += itemRevenue;
    daily.set(date, day);
  });

  const orderSets = new Map<string, Set<string>>();
  items.forEach((item) => {
    if (!productIds.has(item.product_id) || !validOrders.has(item.order_id)) return;
    const set = orderSets.get(item.product_id) ?? new Set<string>();
    set.add(item.order_id);
    orderSets.set(item.product_id, set);
  });
  productRows.forEach((row) => { row.orders = orderSets.get(row.productId)?.size ?? 0; });

  const byDay = Array.from(daily.values()).sort((a, b) => {
    const [ad, am, ay] = a.date.split('/').map(Number);
    const [bd, bm, by] = b.date.split('/').map(Number);
    return new Date(ay, am - 1, ad).getTime() - new Date(by, bm - 1, bd).getTime();
  });

  return {
    totals: {
      quantity,
      revenue,
      orders: distinctOrders.size,
      averagePrice: quantity > 0 ? revenue / quantity : 0,
    },
    byDay,
    products: Array.from(productRows.values()).sort((a, b) => b.quantity - a.quantity),
  };
}