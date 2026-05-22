import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Tag, Search, ChevronDown, ChevronRight, Loader2, Trash2, Save } from 'lucide-react';
import { PanelHeader } from '@/components/admin/PanelHeader';

interface Variation {
  id: string;
  product_id: string;
  name: string;
  price: number;
  stock: number;
  image_url: string | null;
  on_sale: boolean;
  sale_price: number | null;
  sale_ends_at: string | null;
  sale_limit_qty: number | null;
  sale_sold_qty: number;
}

interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  image_url: string | null;
  stock: number;
  on_sale: boolean;
  sale_price: number | null;
  sale_ends_at: string | null;
  sale_limit_qty: number | null;
  sale_sold_qty: number;
  variations: Variation[];
}

type Mode = 'percent' | 'value' | 'price';

interface Draft {
  mode: Mode;
  amount: string;
  endsAt: string;
  limitQty: string;
}

function toLocalDateTime(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildDraft(basePrice: number, salePrice: number | null, endsAt: string | null, limitQty: number | null): Draft {
  if (salePrice != null && basePrice > 0) {
    return {
      mode: 'price',
      amount: salePrice.toFixed(2),
      endsAt: toLocalDateTime(endsAt),
      limitQty: limitQty != null ? String(limitQty) : '',
    };
  }
  return { mode: 'percent', amount: '10', endsAt: '', limitQty: limitQty != null ? String(limitQty) : '' };
}

function computeFinalPrice(basePrice: number, draft: Draft): number {
  const v = parseFloat(draft.amount) || 0;
  if (draft.mode === 'percent') return Math.max(0, basePrice * (1 - v / 100));
  if (draft.mode === 'value') return Math.max(0, basePrice - v);
  return Math.max(0, v);
}

export function PromotionsManagement() {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'on_sale' | 'off'>('all');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    const { data: prods, error: e1 } = await supabase
      .from('products')
      .select('id,name,category,price,image_url,stock,on_sale,sale_price,sale_ends_at,sale_limit_qty,sale_sold_qty')
      .neq('category', 'Pendente Revisão')
      .order('name');
    if (e1) {
      toast({ title: 'Erro ao carregar produtos', description: e1.message, variant: 'destructive' });
      setLoading(false);
      return;
    }
    const { data: vars, error: e2 } = await supabase
      .from('product_variations')
      .select('id,product_id,name,price,stock,image_url,on_sale,sale_price,sale_ends_at,sale_limit_qty,sale_sold_qty');
    if (e2) {
      toast({ title: 'Erro ao carregar variações', description: e2.message, variant: 'destructive' });
    }
    const byProduct = new Map<string, Variation[]>();
    ((vars as any[]) || []).forEach((v) => {
      const arr = byProduct.get(v.product_id) || [];
      arr.push(v as Variation);
      byProduct.set(v.product_id, arr);
    });
    const merged: Product[] = ((prods as any[]) || []).map((p) => ({
      ...p,
      variations: (byProduct.get(p.id) || []).sort((a, b) => a.name.localeCompare(b.name)),
    }));
    setProducts(merged);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (filter === 'on_sale') {
        return p.on_sale || p.variations.some((v) => v.on_sale);
      }
      if (filter === 'off') {
        return !p.on_sale && !p.variations.some((v) => v.on_sale);
      }
      return true;
    });
  }, [products, search, filter]);

  const onSaleCount = products.filter(
    (p) => p.on_sale || p.variations.some((v) => v.on_sale)
  ).length;

  const getDraft = (key: string, basePrice: number, salePrice: number | null, endsAt: string | null, limitQty: number | null): Draft => {
    return drafts[key] || buildDraft(basePrice, salePrice, endsAt, limitQty);
  };

  const updateDraft = (key: string, patch: Partial<Draft>, basePrice: number, salePrice: number | null, endsAt: string | null, limitQty: number | null) => {
    const current = drafts[key] || buildDraft(basePrice, salePrice, endsAt, limitQty);
    setDrafts({ ...drafts, [key]: { ...current, ...patch } });
  };

  const apply = async (
    table: 'products' | 'product_variations',
    id: string,
    basePrice: number,
    draft: Draft
  ) => {
    const key = `${table}:${id}`;
    setSaving((s) => ({ ...s, [key]: true }));
    const final = computeFinalPrice(basePrice, draft);
    if (final >= basePrice) {
      toast({ title: 'Preço promocional inválido', description: 'O preço final deve ser menor que o preço atual.', variant: 'destructive' });
      setSaving((s) => ({ ...s, [key]: false }));
      return;
    }
    const limitParsed = draft.limitQty.trim() === '' ? null : Math.max(1, Math.floor(Number(draft.limitQty)));
    const payload: any = {
      on_sale: true,
      sale_price: Number(final.toFixed(2)),
      sale_ends_at: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
      sale_limit_qty: limitParsed,
    };
    const { error } = await supabase.from(table).update(payload).eq('id', id);
    setSaving((s) => ({ ...s, [key]: false }));
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Promoção aplicada' });
    await load();
  };

  const remove = async (table: 'products' | 'product_variations', id: string) => {
    const key = `${table}:${id}`;
    setSaving((s) => ({ ...s, [key]: true }));
    const { error } = await supabase
      .from(table)
      .update({ on_sale: false, sale_price: null, sale_ends_at: null, sale_limit_qty: null, sale_sold_qty: 0 })
      .eq('id', id);
    setSaving((s) => ({ ...s, [key]: false }));
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Promoção removida' });
    const next = { ...drafts };
    delete next[key];
    setDrafts(next);
    await load();
  };

  const renderEditor = (
    table: 'products' | 'product_variations',
    id: string,
    basePrice: number,
    salePrice: number | null,
    endsAt: string | null,
    onSale: boolean
  ) => {
    const key = `${table}:${id}`;
    const draft = getDraft(key, basePrice, salePrice, endsAt);
    const final = computeFinalPrice(basePrice, draft);
    const discountPct = basePrice > 0 ? Math.round(((basePrice - final) / basePrice) * 100) : 0;
    const expired = endsAt ? new Date(endsAt) < new Date() : false;

    return (
      <div className="space-y-3 p-3 rounded-md border bg-muted/30">
        <div className="flex flex-wrap items-center gap-2">
          {(['percent', 'value', 'price'] as Mode[]).map((m) => (
            <Button
              key={m}
              size="sm"
              variant={draft.mode === m ? 'default' : 'outline'}
              onClick={() => updateDraft(key, { mode: m }, basePrice, salePrice, endsAt)}
            >
              {m === 'percent' ? '% Desconto' : m === 'value' ? 'R$ Desconto' : 'Preço final'}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">
              {draft.mode === 'percent' ? '% de desconto' : draft.mode === 'value' ? 'Valor de desconto (R$)' : 'Preço promocional (R$)'}
            </label>
            <Input
              type="number"
              min={0}
              step={draft.mode === 'percent' ? 1 : 0.01}
              value={draft.amount}
              onChange={(e) => updateDraft(key, { amount: e.target.value }, basePrice, salePrice, endsAt)}
              className="w-32"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Termina em</label>
            <Input
              type="datetime-local"
              value={draft.endsAt}
              onChange={(e) => updateDraft(key, { endsAt: e.target.value }, basePrice, salePrice, endsAt)}
              className="w-56"
            />
          </div>
          <div className="text-sm">
            <div className="text-muted-foreground line-through">R$ {basePrice.toFixed(2)}</div>
            <div className="font-semibold text-green-600">
              R$ {final.toFixed(2)} <span className="text-xs">(-{discountPct}%)</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => apply(table, id, basePrice, draft)} disabled={saving[key]}>
            {saving[key] ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            {onSale ? 'Atualizar promoção' : 'Aplicar promoção'}
          </Button>
          {onSale && (
            <Button size="sm" variant="outline" onClick={() => remove(table, id)} disabled={saving[key]}>
              <Trash2 className="w-4 h-4 mr-1" /> Remover
            </Button>
          )}
          {onSale && endsAt && (
            <Badge variant={expired ? 'destructive' : 'secondary'}>
              {expired ? 'Expirou' : `Até ${new Date(endsAt).toLocaleString('pt-BR')}`}
            </Badge>
          )}
          {onSale && !endsAt && <Badge variant="secondary">Sem prazo</Badge>}
        </div>
      </div>
    );
  };

  return (
    <Card className="overflow-hidden border-0 shadow-sm">
      <PanelHeader
        icon={Tag}
        title="Promoções"
        description="Defina preços promocionais e o tempo de duração para produtos e variações."
        kpis={[
          { label: 'Produtos', value: products.length },
          { label: 'Em promoção', value: onSaleCount, tone: 'success' },
        ]}
      />
      <CardContent className="p-4 md:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar produto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1">
            {(['all', 'on_sale', 'off'] as const).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? 'default' : 'outline'}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'Todos' : f === 'on_sale' ? 'Em promoção' : 'Sem promoção'}
              </Button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">Nenhum produto encontrado.</div>
        ) : (
          <div className="space-y-3">
            {filtered.map((p) => {
              const hasVars = p.variations.length > 0;
              const isOpen = expanded[p.id] ?? false;
              const anyOnSale = p.on_sale || p.variations.some((v) => v.on_sale);
              return (
                <div key={p.id} className="border rounded-lg overflow-hidden">
                  <div className="flex items-center gap-3 p-3 bg-card">
                    {hasVars ? (
                      <button
                        onClick={() => setExpanded({ ...expanded, [p.id]: !isOpen })}
                        className="p-1 hover:bg-muted rounded"
                      >
                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    ) : (
                      <div className="w-6" />
                    )}
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="w-12 h-12 rounded object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded bg-muted" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.category} • R$ {Number(p.price).toFixed(2)}
                        {hasVars && ` • ${p.variations.length} variações`}
                      </div>
                    </div>
                    {anyOnSale && <Badge className="bg-green-600 hover:bg-green-600">Em promoção</Badge>}
                  </div>

                  {!hasVars && (
                    <div className="p-3 border-t">
                      {renderEditor('products', p.id, Number(p.price), p.sale_price, p.sale_ends_at, p.on_sale)}
                    </div>
                  )}

                  {hasVars && isOpen && (
                    <div className="border-t bg-muted/20 p-3 space-y-3">
                      {p.variations.map((v) => (
                        <div key={v.id} className="bg-card border rounded-md p-3">
                          <div className="flex items-center gap-3 mb-3">
                            {v.image_url ? (
                              <img src={v.image_url} alt={v.name} className="w-10 h-10 rounded object-cover" />
                            ) : (
                              <div className="w-10 h-10 rounded bg-muted" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">{v.name}</div>
                              <div className="text-xs text-muted-foreground">
                                R$ {Number(v.price).toFixed(2)} • Estoque: {v.stock}
                              </div>
                            </div>
                            {v.on_sale && <Badge className="bg-green-600 hover:bg-green-600">Promo</Badge>}
                          </div>
                          {renderEditor('product_variations', v.id, Number(v.price), v.sale_price, v.sale_ends_at, v.on_sale)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
