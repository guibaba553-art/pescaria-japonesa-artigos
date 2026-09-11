import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Loader2, Package, Search, ShoppingCart, Tag, TrendingUp, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { aggregateProductSales, type SalesChannel } from '@/utils/productSalesAnalysis';
import { fetchAllPaged } from '@/utils/fetchAllPaged';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ProductRow {
  id: string;
  name: string;
  category?: string | null;
  subcategory?: string | null;
}

interface CategoryRow {
  id: string;
  name: string;
  parent_id: string | null;
  is_primary: boolean;
}

interface ProductCategoryLink {
  product_id: string;
  category_id: string;
}

const formatBRL = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function ProductSalesAnalysis({ rangeStart, rangeEnd }: { rangeStart?: Date; rangeEnd?: Date }) {
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'product' | 'group'>('product');
  const [channel, setChannel] = useState<SalesChannel>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [links, setLinks] = useState<ProductCategoryLink[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    if (!rangeStart || !rangeEnd) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const start = new Date(rangeStart);
      start.setHours(0, 0, 0, 0);
      const end = new Date(rangeEnd);
      end.setHours(23, 59, 59, 999);

      const [productsResult, categoriesResult, linksRows, orderRows] = await Promise.all([
        supabase.rpc('get_products_admin'),
        supabase.from('categories').select('id, name, parent_id, is_primary').order('display_order'),
        fetchAllPaged<ProductCategoryLink>(async (from, to) =>
          await supabase.from('product_categories').select('product_id, category_id').range(from, to),
        ),
        fetchAllPaged<any>(async (from, to) =>
          await supabase
            .from('orders')
            .select('id, created_at, status, source')
            .gte('created_at', start.toISOString())
            .lte('created_at', end.toISOString())
            .order('created_at', { ascending: false })
            .range(from, to),
        ),
      ]);

      const orderIds = orderRows.map((order) => order.id);
      const itemRows: any[] = [];
      for (let i = 0; i < orderIds.length; i += 200) {
        const chunk = orderIds.slice(i, i + 200);
        const rows = await fetchAllPaged<any>(async (from, to) =>
          await supabase
            .from('order_items')
            .select('order_id, product_id, quantity, price_at_purchase')
            .in('order_id', chunk)
            .range(from, to),
        );
        itemRows.push(...rows);
      }

      if (!cancelled) {
        setProducts(((productsResult.data ?? []) as ProductRow[]).sort((a, b) => a.name.localeCompare(b.name)));
        setCategories(((categoriesResult.data ?? []) as CategoryRow[]).sort((a, b) => a.name.localeCompare(b.name)));
        setLinks(linksRows);
        setOrders(orderRows);
        setItems(itemRows);
        setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [rangeStart?.getTime(), rangeEnd?.getTime()]);

  useEffect(() => {
    setSelectedIds([]);
    setSearch('');
  }, [mode]);

  const toggleSelection = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const selectedProductIds = useMemo(() => {
    if (selectedIds.length === 0) return new Set<string>();
    if (mode === 'product') return new Set(selectedIds);

    const ids = new Set<string>();
    selectedIds.forEach((selectedId) => {
      const categoryIds = new Set([selectedId]);
      let changed = true;
      while (changed) {
        changed = false;
        categories.forEach((category) => {
          if (category.parent_id && categoryIds.has(category.parent_id) && !categoryIds.has(category.id)) {
            categoryIds.add(category.id);
            changed = true;
          }
        });
      }
      const names = new Set(categories.filter((category) => categoryIds.has(category.id)).map((category) => category.name));
      links.filter((link) => categoryIds.has(link.category_id)).forEach((link) => ids.add(link.product_id));
      products.forEach((product) => {
        if ((product.category && names.has(product.category)) || (product.subcategory && names.has(product.subcategory))) {
          ids.add(product.id);
        }
      });
    });
    return ids;
  }, [categories, links, mode, products, selectedIds]);

  const analysis = useMemo(() => aggregateProductSales({
    orders,
    items,
    products,
    productIds: selectedProductIds,
    channel,
  }), [channel, items, orders, products, selectedProductIds]);

  // Grupos = mesma árvore de "Gerenciar Categorias": categoria principal e seus subgrupos.
  const categoryOptions = useMemo(() => {
    const byParent = new Map<string | null, CategoryRow[]>();
    categories.forEach((category) => {
      const key = category.parent_id ?? null;
      byParent.set(key, [...(byParent.get(key) ?? []), category]);
    });
    const directIds = new Map<string, Set<string>>();
    categories.forEach((category) => {
      const ids = new Set(links.filter((link) => link.category_id === category.id).map((link) => link.product_id));
      products.forEach((product) => {
        if (product.category === category.name || product.subcategory === category.name) ids.add(product.id);
      });
      directIds.set(category.id, ids);
    });
    const countOf = (id: string): number => {
      const ids = new Set(directIds.get(id) ?? []);
      (byParent.get(id) ?? []).forEach((child) => (directIds.get(child.id) ?? []).forEach((pid) => ids.add(pid)));
      const stack = [...(byParent.get(id) ?? [])];
      while (stack.length) {
        const current = stack.pop()!;
        (directIds.get(current.id) ?? []).forEach((pid) => ids.add(pid));
        stack.push(...(byParent.get(current.id) ?? []));
      }
      return ids.size;
    };
    const list: { id: string; name: string; path: string; depth: number; count: number }[] = [];
    const walk = (parent: string | null, trail: string[], depth: number) => {
      (byParent.get(parent) ?? []).forEach((category) => {
        const path = [...trail, category.name];
        list.push({ id: category.id, name: category.name, path: path.join(' › '), depth, count: countOf(category.id) });
        walk(category.id, path, depth + 1);
      });
    };
    walk(null, [], 0);
    return list;
  }, [categories, links, products]);

  const options: { id: string; name: string; path: string; depth: number; count?: number }[] =
    mode === 'product'
      ? products.map((product) => ({ id: product.id, name: product.name, path: product.name, depth: 0 }))
      : categoryOptions;
  const visibleOptions = options
    .filter((option) => !search || normalize(option.path).includes(normalize(search)))
    .slice(0, 120);
  const selectedName = options.find((option) => option.id === selectedId)?.path;

  if (loading) {
    return <div className="flex min-h-[320px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold"><Package className="h-6 w-6 text-primary" /> Análise de Produtos</h2>
          <p className="text-sm text-muted-foreground">Veja quanto um produto ou grupo vendeu no período selecionado.</p>
        </div>
        <Select value={channel} onValueChange={(value) => setChannel(value as SalesChannel)}>
          <SelectTrigger className="w-full md:w-44" aria-label="Origem das vendas"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os canais</SelectItem>
            <SelectItem value="pdv">Somente PDV</SelectItem>
            <SelectItem value="site">Somente Site</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">O que deseja analisar?</CardTitle>
          <CardDescription>Escolha um item específico ou um grupo inteiro, incluindo seus subgrupos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={mode} onValueChange={(value) => setMode(value as 'product' | 'group')}>
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="product">Produto</TabsTrigger>
              <TabsTrigger value="group">Grupo</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative max-w-2xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={mode === 'product' ? 'Pesquisar produto...' : 'Pesquisar grupo...'} className="pl-9" />
          </div>
          {(search || mode === 'group') && (
            <div className={mode === 'group' ? 'max-h-72 space-y-1 overflow-y-auto pr-1' : 'grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3'}>
              {visibleOptions.map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  variant={selectedId === option.id ? 'default' : 'ghost'}
                  className={mode === 'group' ? 'h-auto w-full justify-between whitespace-normal py-2 text-left' : 'h-auto justify-start whitespace-normal border py-2 text-left'}
                  style={mode === 'group' ? { paddingLeft: 12 + option.depth * 18 } : undefined}
                  onClick={() => { setSelectedId(option.id); setSearch(''); }}
                >
                  <span>{search && mode === 'group' ? option.path : option.name}</span>
                  {mode === 'group' && <span className="ml-3 shrink-0 text-xs text-muted-foreground">{option.count ?? 0} prod.</span>}
                </Button>
              ))}
              {visibleOptions.length === 0 && <p className="py-4 text-sm text-muted-foreground">Nenhum resultado encontrado.</p>}
            </div>
          )}
          {selectedName && (
            <button
              type="button"
              onClick={() => { setSelectedId(''); setSearch(''); }}
              title="Remover seleção e pesquisar outro"
              className="group inline-flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Tag className="h-4 w-4" /> {selectedName}
              <X className="h-4 w-4 opacity-60 transition-opacity group-hover:opacity-100" />
            </button>
          )}
        </CardContent>
      </Card>

      {!selectedId ? (
        <div className="border-y py-14 text-center text-sm text-muted-foreground">Pesquise e selecione um produto ou grupo para iniciar a análise.</div>
      ) : selectedProductIds.size === 0 ? (
        <div className="border-y py-14 text-center text-sm text-muted-foreground">O grupo {selectedName} ainda não tem nenhum produto cadastrado nele.</div>
      ) : analysis.totals.quantity === 0 ? (
        <div className="border-y py-14 text-center text-sm text-muted-foreground">Nenhuma venda encontrada para {selectedName} neste período e canal.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Quantidade vendida', value: `${analysis.totals.quantity.toLocaleString('pt-BR')} un`, icon: Package },
              { label: 'Receita', value: formatBRL(analysis.totals.revenue), icon: TrendingUp },
              { label: 'Vendas', value: analysis.totals.orders.toLocaleString('pt-BR'), icon: ShoppingCart },
              { label: 'Preço médio', value: formatBRL(analysis.totals.averagePrice), icon: BarChart3 },
            ].map(({ label, value, icon: Icon }) => (
              <Card key={label}><CardContent className="p-4"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-primary" /></div><p className="text-xl font-bold tabular-nums">{value}</p></CardContent></Card>
            ))}
          </div>

          <Card>
            <CardHeader><CardTitle>Quantidade vendida por dia</CardTitle><CardDescription>Evolução de {selectedName} no período selecionado.</CardDescription></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analysis.byDay}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis allowDecimals={false} />
                  <Tooltip formatter={(value: number, name: string) => name === 'Quantidade' ? `${value} un` : formatBRL(Number(value))} />
                  <Bar dataKey="quantity" name="Quantidade" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{mode === 'group' ? 'Produtos do grupo' : 'Detalhamento'}</CardTitle><CardDescription>Ordenado pela maior quantidade vendida.</CardDescription></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="py-2">Produto</th><th className="py-2 text-right">Quantidade</th><th className="py-2 text-right">Vendas</th><th className="py-2 text-right">Receita</th><th className="py-2 text-right">Participação</th></tr></thead>
                <tbody>{analysis.products.map((row) => <tr key={row.productId} className="border-b border-border/60"><td className="py-3 pr-4 font-medium">{row.name}</td><td className="py-3 text-right tabular-nums">{row.quantity.toLocaleString('pt-BR')} un</td><td className="py-3 text-right tabular-nums">{row.orders}</td><td className="py-3 text-right tabular-nums">{formatBRL(row.revenue)}</td><td className="py-3 text-right tabular-nums">{((row.quantity / analysis.totals.quantity) * 100).toFixed(1)}%</td></tr>)}</tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}