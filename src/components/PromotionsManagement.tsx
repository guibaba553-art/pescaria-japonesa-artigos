import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Tag, Search, ChevronDown, ChevronRight, Loader2, Trash2, Save, ListChecks, X, LayoutDashboard, CalendarClock, CheckCircle2, AlertTriangle, TimerOff, RefreshCw, Play, Square } from 'lucide-react';
import { PanelHeader } from '@/components/admin/PanelHeader';
import { isPromoActive, isPromoScheduled, validatePromotionPeriod } from '@/utils/promoPrice';
import { promoStatus, PromoStatus, PROMO_STATUS_LABEL, PROMO_STATUS_CLASS, channelLabel, countdownLabel } from '@/utils/promoStatus';

/** Converte texto colado (dd/mm/yyyy [hh:mm], ISO, datetime-local) para o formato do input datetime-local. */
function parsePastedDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  // Já no formato do input
  const local = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (local) return `${local[1]}-${local[2]}-${local[3]}T${local[4]}:${local[5]}`;
  // dd/mm/yyyy [hh:mm[:ss]]
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ ,T]+(\d{1,2}):(\d{2}))?/);
  if (br) {
    const dd = br[1].padStart(2, '0');
    const mm = br[2].padStart(2, '0');
    let yyyy = br[3];
    if (yyyy.length === 2) yyyy = '20' + yyyy;
    const hh = (br[4] ?? '23').padStart(2, '0');
    const mi = (br[5] ?? '59').padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  }
  // Fallback: Date parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return null;
}

interface Variation {
  id: string;
  product_id: string;
  name: string;
  price: number;
  min_sale_price: number | null;
  stock: number;
  image_url: string | null;
  on_sale: boolean;
  sale_price: number | null;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  sale_limit_qty: number | null;
  sale_sold_qty: number;
  sale_channel: string | null;
  cost: number;
  freight_pct: number;
  op_cost_pct: number;
  tax_pct: number;
}

interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  min_sale_price: number | null;
  image_url: string | null;
  stock: number;
  on_sale: boolean;
  sale_price: number | null;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  sale_limit_qty: number | null;
  sale_sold_qty: number;
  sale_channel: string | null;
  cost: number;
  freight_pct: number;
  op_cost_pct: number;
  tax_pct: number;
  variations: Variation[];
}

type Mode = 'percent' | 'value' | 'price';
type Channel = 'site' | 'pdv' | 'both';

interface Draft {
  mode: Mode;
  amount: string;
  startsAt: string;
  endsAt: string;
  limitQty: string;
  channel: Channel;
}

function toLocalDateTime(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildDraft(basePrice: number, salePrice: number | null, startsAt: string | null, endsAt: string | null, limitQty: number | null, channel: Channel = 'both'): Draft {
  if (salePrice != null && basePrice > 0) {
    return {
      mode: 'price',
      amount: salePrice.toFixed(2),
      startsAt: toLocalDateTime(startsAt),
      endsAt: toLocalDateTime(endsAt),
      limitQty: limitQty != null ? String(limitQty) : '',
      channel,
    };
  }
  return { mode: 'percent', amount: '10', startsAt: '', endsAt: '', limitQty: limitQty != null ? String(limitQty) : '', channel };
}


function computeFinalPrice(basePrice: number, draft: Draft): number {
  const v = parseFloat(draft.amount) || 0;
  if (draft.mode === 'percent') return Math.max(0, basePrice * (1 - v / 100));
  if (draft.mode === 'value') return Math.max(0, basePrice - v);
  return Math.max(0, v);
}

function StatusBadge({ status, className = '' }: { status: PromoStatus; className?: string }) {
  if (status === 'none') return null;
  return (
    <Badge variant="outline" className={`${PROMO_STATUS_CLASS[status]} ${className}`}>
      {PROMO_STATUS_LABEL[status]}
    </Badge>
  );
}

/** Melhor status entre o produto e suas variações (prioriza ativa > agendada > outros). */
const STATUS_RANK: Record<PromoStatus, number> = { active: 5, scheduled: 4, sold_out: 3, invalid: 2, expired: 1, none: 0 };

function basePriceOf(item: { min_sale_price: number | null; price: number }): number {
  return Number(Number(item.min_sale_price) > 0 ? item.min_sale_price : item.price);
}

interface PromoRow {
  key: string;
  table: 'products' | 'product_variations';
  id: string;
  name: string;
  sub: string | null;
  image: string | null;
  category: string;
  status: PromoStatus;
  basePrice: number;
  salePrice: number;
  discountPct: number;
  channel: string | null;
  startsAt: string | null;
  endsAt: string | null;
  limitQty: number | null;
  soldQty: number;
  stock: number;
  margin: number;
}

export function PromotionsManagement() {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'scheduled' | 'expired' | 'off'>('all');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [, setTick] = useState(0);

  // Atualiza contagens regressivas / status sem recarregar do banco
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const load = async () => {
    setLoading(true);
    const { data: prods, error: e1 } = await supabase
      .rpc('get_products_admin');
    if (e1) {
      toast({ title: 'Erro ao carregar produtos', description: e1.message, variant: 'destructive' });
      setLoading(false);
      return;
    }
    const filteredProds = ((prods as any[]) || [])
      .filter((p) => p.category !== 'Pendente Revisão')
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const { data: vars, error: e2 } = await supabase
      .rpc('get_product_variations_admin');
    if (e2) {
      toast({ title: 'Erro ao carregar variações', description: e2.message, variant: 'destructive' });
    }
    const byProduct = new Map<string, Variation[]>();
    ((vars as any[]) || []).forEach((v) => {
      const arr = byProduct.get(v.product_id) || [];
      arr.push(v as Variation);
      byProduct.set(v.product_id, arr);
    });
    const merged: Product[] = filteredProds.map((p) => ({
      ...p,
      variations: (byProduct.get(p.id) || []).sort((a, b) => a.name.localeCompare(b.name)),
    }));
    setProducts(merged);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  /** Status agregado de um produto (considerando variações). */
  const productStatus = (p: Product): PromoStatus => {
    const all: PromoStatus[] = [promoStatus(p), ...p.variations.map((v) => promoStatus(v))];
    return all.reduce((best, s) => (STATUS_RANK[s] > STATUS_RANK[best] ? s : best), 'none' as PromoStatus);
  };

  const matchesFilter = (s: PromoStatus, f: typeof filter) => {
    if (f === 'all') return true;
    if (f === 'off') return s === 'none';
    if (f === 'expired') return s === 'expired' || s === 'sold_out' || s === 'invalid';
    return s === f;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return matchesFilter(productStatus(p), filter);
    });
  }, [products, search, filter]);

  /** Todas as linhas com alguma promoção cadastrada (ativa, agendada, expirada ou incompleta). */
  const promoRows = useMemo<PromoRow[]>(() => {
    const rows: PromoRow[] = [];
    const push = (
      table: 'products' | 'product_variations',
      p: Product,
      v: Variation | null,
    ) => {
      const item: any = v ?? p;
      const status = promoStatus(item);
      if (status === 'none') return;
      const basePrice = basePriceOf(item);
      const salePrice = Number(item.sale_price ?? 0);
      const cost = Number(v ? (v.cost ?? p.cost ?? 0) : p.cost ?? 0);
      const fPct = Number((v ? v.freight_pct ?? p.freight_pct : p.freight_pct) || 0) / 100;
      const oPct = Number((v ? v.op_cost_pct ?? p.op_cost_pct : p.op_cost_pct) || 0) / 100;
      const tPct = Number((v ? v.tax_pct ?? p.tax_pct : p.tax_pct) || 0) / 100;
      const totalCost = cost + cost * fPct + cost * oPct + salePrice * tPct;
      rows.push({
        key: `${table}:${item.id}`,
        table,
        id: item.id,
        name: p.name,
        sub: v ? v.name : null,
        image: (v?.image_url || p.image_url) ?? null,
        category: p.category,
        status,
        basePrice,
        salePrice,
        discountPct: basePrice > 0 ? Math.round((1 - salePrice / basePrice) * 100) : 0,
        channel: item.sale_channel,
        startsAt: item.sale_starts_at,
        endsAt: item.sale_ends_at,
        limitQty: item.sale_limit_qty,
        soldQty: Number(item.sale_sold_qty ?? 0),
        stock: Number(item.stock ?? 0),
        margin: salePrice - totalCost,
      });
    };
    products.forEach((p) => {
      push('products', p, null);
      p.variations.forEach((v) => push('product_variations', p, v));
    });
    return rows;
  }, [products]);

  const counts = useMemo(() => {
    const c = { active: 0, scheduled: 0, expired: 0, invalid: 0, sold_out: 0 };
    promoRows.forEach((r) => {
      if (r.status in c) (c as any)[r.status]++;
    });
    return c;
  }, [promoRows]);

  const onSaleCount = counts.active;


  const getDraft = (key: string, basePrice: number, salePrice: number | null, startsAt: string | null, endsAt: string | null, limitQty: number | null, channel: Channel = 'both'): Draft => {
    return drafts[key] || buildDraft(basePrice, salePrice, startsAt, endsAt, limitQty, channel);
  };

  const updateDraft = (key: string, patch: Partial<Draft>, basePrice: number, salePrice: number | null, startsAt: string | null, endsAt: string | null, limitQty: number | null, channel: Channel = 'both') => {
    const current = drafts[key] || buildDraft(basePrice, salePrice, startsAt, endsAt, limitQty, channel);
    setDrafts({ ...drafts, [key]: { ...current, ...patch } });
  };


  const apply = async (
    table: 'products' | 'product_variations',
    id: string,
    basePrice: number,
    draft: Draft
  ) => {
    const key = `${table}:${id}`;
    const periodError = validatePromotionPeriod(draft.startsAt, draft.endsAt);
    if (periodError) {
      toast({ title: 'Prazo inválido', description: periodError, variant: 'destructive' });
      return;
    }
    const final = computeFinalPrice(basePrice, draft);
    if (final >= basePrice) {
      toast({ title: 'Preço promocional inválido', description: 'O preço final deve ser menor que o preço atual.', variant: 'destructive' });
      setSaving((s) => ({ ...s, [key]: false }));
      return;
    }
    setSaving((s) => ({ ...s, [key]: true }));
    const limitParsed = draft.limitQty.trim() === '' ? null : Math.max(1, Math.floor(Number(draft.limitQty)));
    const payload: any = {
      on_sale: true,
      sale_price: Number(final.toFixed(2)),
      sale_starts_at: draft.startsAt ? new Date(draft.startsAt).toISOString() : null,
      sale_ends_at: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
      sale_limit_qty: limitParsed,
      sale_channel: draft.channel,
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
      .update({ on_sale: false, sale_price: null, sale_starts_at: null, sale_ends_at: null, sale_limit_qty: null, sale_sold_qty: 0 })
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
  const applyBulkToVariations = async (product: Product) => {
    const key = `bulk:${product.id}`;
    const draft: Draft = drafts[key] || { mode: 'percent', amount: '10', startsAt: '', endsAt: '', limitQty: '', channel: 'both' };
    if (product.variations.length === 0) return;
    const periodError = validatePromotionPeriod(draft.startsAt, draft.endsAt);
    if (periodError) {
      toast({ title: 'Prazo inválido', description: periodError, variant: 'destructive' });
      return;
    }
    setSaving((s) => ({ ...s, [key]: true }));
    const limitParsed = draft.limitQty.trim() === '' ? null : Math.max(1, Math.floor(Number(draft.limitQty)));
    const endsAtIso = draft.endsAt ? new Date(draft.endsAt).toISOString() : null;
    const startsAtIso = draft.startsAt ? new Date(draft.startsAt).toISOString() : null;
    let ok = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (const v of product.variations) {
      const basePrice = Number(Number(v.min_sale_price) > 0 ? v.min_sale_price : v.price);
      const final = computeFinalPrice(basePrice, draft);
      if (basePrice <= 0 || final >= basePrice || final <= 0) {
        skipped++;
        continue;
      }
      const { error } = await supabase
        .from('product_variations')
        .update({
          on_sale: true,
          sale_price: Number(final.toFixed(2)),
          sale_starts_at: startsAtIso,
          sale_ends_at: endsAtIso,
          sale_limit_qty: limitParsed,
          sale_channel: draft.channel,
        })
        .eq('id', v.id);
      if (error) errors.push(`${v.name}: ${error.message}`);
      else ok++;
    }
    setSaving((s) => ({ ...s, [key]: false }));
    if (errors.length > 0) {
      toast({ title: 'Alguns erros ocorreram', description: errors.slice(0, 3).join('\n'), variant: 'destructive' });
    }
    toast({
      title: `Promoção aplicada em ${ok} variação(ões)`,
      description: skipped > 0 ? `${skipped} ignoradas (preço inválido).` : undefined,
    });
    await load();
  };

  const removeBulkFromVariations = async (product: Product) => {
    const key = `bulk:${product.id}`;
    const ids = product.variations.filter((v) => v.on_sale).map((v) => v.id);
    if (ids.length === 0) {
      toast({ title: 'Nenhuma variação em promoção' });
      return;
    }
    setSaving((s) => ({ ...s, [key]: true }));
    const { error } = await supabase
      .from('product_variations')
      .update({ on_sale: false, sale_price: null, sale_starts_at: null, sale_ends_at: null, sale_limit_qty: null, sale_sold_qty: 0 })
      .in('id', ids);
    setSaving((s) => ({ ...s, [key]: false }));
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: `Promoção removida de ${ids.length} variação(ões)` });
    await load();
  };

  const renderBulkEditor = (product: Product) => {
    const key = `bulk:${product.id}`;
    const draft: Draft = drafts[key] || { mode: 'percent' as Mode, amount: '10', startsAt: '', endsAt: '', limitQty: '', channel: 'both' };
    const setBulk = (patch: Partial<Draft>) => setDrafts({ ...drafts, [key]: { ...draft, ...patch } });
    const onSaleCount = product.variations.filter((v) => v.on_sale).length;
    return (
      <div className="rounded-md border-2 border-primary/40 bg-primary/5 p-3 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="font-semibold text-sm">Aplicar em todas as variações</div>
            <div className="text-xs text-muted-foreground">
              {product.variations.length} variações • {onSaleCount} em promoção
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['percent', 'value', 'price'] as Mode[]).map((m) => (
            <Button
              key={m}
              size="sm"
              variant={draft.mode === m ? 'default' : 'outline'}
              onClick={() => setBulk({ mode: m })}
            >
              {m === 'percent' ? '% Desconto' : m === 'value' ? 'R$ Desconto' : 'Preço final'}
            </Button>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Aplicar promoção em</label>
          <div className="flex flex-wrap gap-2">
            {(['site', 'pdv', 'both'] as Channel[]).map((c) => (
              <Button
                key={c}
                size="sm"
                variant={draft.channel === c ? 'default' : 'outline'}
                onClick={() => setBulk({ channel: c })}
              >
                {c === 'site' ? 'Site' : c === 'pdv' ? 'PDV' : 'Ambos'}
              </Button>
            ))}
          </div>
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
              onChange={(e) => setBulk({ amount: e.target.value })}
              className="w-32"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Inicia em (opcional)</label>
            <Input
              type="datetime-local"
              value={draft.startsAt}
              onChange={(e) => setBulk({ startsAt: e.target.value })}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text');
                const parsed = parsePastedDate(text);
                if (parsed) { e.preventDefault(); setBulk({ startsAt: parsed }); }
              }}
              className="w-56"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Termina em</label>
            <Input
              type="datetime-local"
              value={draft.endsAt}
              onChange={(e) => setBulk({ endsAt: e.target.value })}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text');
                const parsed = parsePastedDate(text);
                if (parsed) {
                  e.preventDefault();
                  setBulk({ endsAt: parsed });
                }
              }}
              className="w-56"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Limite de peças (opcional, por variação)</label>
            <Input
              type="number"
              min={1}
              step={1}
              placeholder="Ex: 10"
              value={draft.limitQty}
              onChange={(e) => setBulk({ limitQty: e.target.value })}
              className="w-32"
            />
          </div>
        </div>
        {draft.mode === 'price' && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            ⚠️ "Preço final" aplica o mesmo valor absoluto em todas as variações. Variações cujo preço base seja menor ou igual serão ignoradas.
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => applyBulkToVariations(product)} disabled={saving[key]}>
            {saving[key] ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Aplicar em todas
          </Button>
          {onSaleCount > 0 && (
            <Button size="sm" variant="outline" onClick={() => removeBulkFromVariations(product)} disabled={saving[key]}>
              <Trash2 className="w-4 h-4 mr-1" /> Remover de todas
            </Button>
          )}
        </div>
      </div>
    );
  };

  const renderEditor = (
    table: 'products' | 'product_variations',

    id: string,
    basePrice: number,
    salePrice: number | null,
    startsAt: string | null,
    endsAt: string | null,
    onSale: boolean,
    limitQty: number | null,
    soldQty: number,
    cost: number,
    freightPct: number,
    opCostPct: number,
    taxPct: number,
    saleChannel: string | null = 'both'
  ) => {
    const key = `${table}:${id}`;
    const initialChannel: Channel = (saleChannel === 'site' || saleChannel === 'pdv' || saleChannel === 'both') ? saleChannel : 'both';
    const draft = getDraft(key, basePrice, salePrice, startsAt, endsAt, limitQty, initialChannel);
    const final = computeFinalPrice(basePrice, draft);
    const discountPct = basePrice > 0 ? Math.round(((basePrice - final) / basePrice) * 100) : 0;
    const expired = endsAt ? new Date(endsAt) < new Date() : false;
    const scheduled = startsAt ? new Date(startsAt) > new Date() : false;
    const soldOut = limitQty != null && soldQty >= limitQty;
    const isActuallyActive = onSale && !expired && !soldOut && !scheduled;
    const fPct = Number(freightPct || 0) / 100;
    const oPct = Number(opCostPct || 0) / 100;
    const tPct = Number(taxPct || 0) / 100;
    const totalCost = Number(cost || 0) + Number(cost || 0) * fPct + Number(cost || 0) * oPct + final * tPct;
    const marginAbs = final - totalCost;
    const marginPct = final > 0 ? (marginAbs / final) * 100 : 0;
    const lossWarn = marginAbs < 0;

    return (
      <div className="space-y-3 p-3 rounded-md border bg-muted/30">
        <div className="flex flex-wrap items-center gap-2">
          {(['percent', 'value', 'price'] as Mode[]).map((m) => (
            <Button
              key={m}
              size="sm"
              variant={draft.mode === m ? 'default' : 'outline'}
              onClick={() => updateDraft(key, { mode: m }, basePrice, salePrice, startsAt, endsAt, limitQty, initialChannel)}
            >
              {m === 'percent' ? '% Desconto' : m === 'value' ? 'R$ Desconto' : 'Preço final'}
            </Button>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Aplicar promoção em</label>
          <div className="flex flex-wrap gap-2">
            {(['site', 'pdv', 'both'] as Channel[]).map((c) => (
              <Button
                key={c}
                size="sm"
                variant={draft.channel === c ? 'default' : 'outline'}
                onClick={() => updateDraft(key, { channel: c }, basePrice, salePrice, startsAt, endsAt, limitQty, initialChannel)}
              >
                {c === 'site' ? 'Site' : c === 'pdv' ? 'PDV' : 'Ambos'}
              </Button>
            ))}
          </div>
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
              onChange={(e) => updateDraft(key, { amount: e.target.value }, basePrice, salePrice, startsAt, endsAt, limitQty, initialChannel)}
              className="w-32"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Inicia em (opcional)</label>
            <Input
              type="datetime-local"
              value={draft.startsAt}
              onChange={(e) => updateDraft(key, { startsAt: e.target.value }, basePrice, salePrice, startsAt, endsAt, limitQty, initialChannel)}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text');
                const parsed = parsePastedDate(text);
                if (parsed) {
                  e.preventDefault();
                  updateDraft(key, { startsAt: parsed }, basePrice, salePrice, startsAt, endsAt, limitQty, initialChannel);
                }
              }}
              className="w-56"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Termina em</label>
            <Input
              type="datetime-local"
              value={draft.endsAt}
              onChange={(e) => updateDraft(key, { endsAt: e.target.value }, basePrice, salePrice, startsAt, endsAt, limitQty, initialChannel)}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text');
                const parsed = parsePastedDate(text);
                if (parsed) {
                  e.preventDefault();
                  updateDraft(key, { endsAt: parsed }, basePrice, salePrice, startsAt, endsAt, limitQty, initialChannel);
                }
              }}
              className="w-56"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Limite de peças (opcional)</label>
            <Input
              type="number"
              min={1}
              step={1}
              placeholder="Ex: 10"
              value={draft.limitQty}
              onChange={(e) => updateDraft(key, { limitQty: e.target.value }, basePrice, salePrice, startsAt, endsAt, limitQty, initialChannel)}
              className="w-32"
            />
          </div>

          <div className="text-sm">
            <div className="text-muted-foreground line-through">R$ {basePrice.toFixed(2)}</div>
            <div className="font-semibold text-green-600">
              R$ {final.toFixed(2)} <span className="text-xs">(-{discountPct}%)</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="rounded-md border bg-background px-3 py-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground text-xs">
              Custo total (custo + frete + operacionais + imposto)
            </span>
            <span className="font-bold">R$ {totalCost.toFixed(2)}</span>
          </div>
          <div className={`rounded-md border px-3 py-2 flex items-center justify-between text-sm ${lossWarn ? 'bg-destructive/10 border-destructive/40' : 'bg-background'}`}>
            <span className="text-muted-foreground text-xs">
              {lossWarn ? '⚠️ Margem (prejuízo)' : 'Margem na promoção'}
            </span>
            <span className={`font-bold ${lossWarn ? 'text-destructive' : 'text-green-600'}`}>
              R$ {marginAbs.toFixed(2)} ({marginPct.toFixed(1)}%)
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Button size="sm" onClick={() => apply(table, id, basePrice, draft)} disabled={saving[key]}>
            {saving[key] ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            {isActuallyActive ? 'Atualizar promoção' : onSale ? 'Promoção expirada — aplicar nova' : 'Aplicar promoção'}
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
          {onSale && limitQty != null && (
            <Badge variant={soldOut ? 'destructive' : 'secondary'}>
              {soldOut ? `Esgotado (${soldQty}/${limitQty})` : `${soldQty}/${limitQty} vendidos`}
            </Badge>
          )}
          {onSale && limitQty == null && <Badge variant="secondary">Sem limite</Badge>}
        </div>
      </div>
    );
  };

  // ═══════════════ MODO EM LOTE ═══════════════
  type SelKey = string; // "products:<id>" | "product_variations:<id>"
  const [selected, setSelected] = useState<Set<SelKey>>(new Set());
  const [batchSearch, setBatchSearch] = useState('');
  const [batchFilter, setBatchFilter] = useState<'all' | 'active' | 'scheduled' | 'expired' | 'off'>('all');
  const [batchDraft, setBatchDraft] = useState<Draft>({ mode: 'percent', amount: '10', startsAt: '', endsAt: '', limitQty: '', channel: 'both' });
  const [batchSaving, setBatchSaving] = useState(false);

  const toggleSel = (key: SelKey) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  };

  const batchFiltered = useMemo(() => {
    const q = batchSearch.trim().toLowerCase();
    return products.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return matchesFilter(productStatus(p), batchFilter);
    });
  }, [products, batchSearch, batchFilter]);




  const selectAllVisible = () => {
    const n = new Set(selected);
    batchFiltered.forEach((p) => {
      if (p.variations.length === 0) n.add(`products:${p.id}`);
      else p.variations.forEach((v) => n.add(`product_variations:${v.id}`));
    });
    setSelected(n);
  };
  const clearSelection = () => setSelected(new Set());

  const applyBatch = async () => {
    if (selected.size === 0) {
      toast({ title: 'Selecione ao menos um item' });
      return;
    }
    const periodError = validatePromotionPeriod(batchDraft.startsAt, batchDraft.endsAt);
    if (periodError) {
      toast({ title: 'Prazo inválido', description: periodError, variant: 'destructive' });
      return;
    }
    setBatchSaving(true);
    const limitParsed = batchDraft.limitQty.trim() === '' ? null : Math.max(1, Math.floor(Number(batchDraft.limitQty)));
    const endsAtIso = batchDraft.endsAt ? new Date(batchDraft.endsAt).toISOString() : null;
    const startsAtIso = batchDraft.startsAt ? new Date(batchDraft.startsAt).toISOString() : null;
    let ok = 0, skipped = 0;
    const errors: string[] = [];

    // Indexar preços base
    const priceOf = (table: 'products' | 'product_variations', id: string): number => {
      if (table === 'products') {
        const p = products.find((x) => x.id === id);
        return p ? Number(Number(p.min_sale_price) > 0 ? p.min_sale_price : p.price) : 0;
      }
      for (const p of products) {
        const v = p.variations.find((x) => x.id === id);
        if (v) return Number(Number(v.min_sale_price) > 0 ? v.min_sale_price : v.price);
      }
      return 0;
    };

    // Agrupar por tabela e por preço final (para poder usar .in())
    const byTable: Record<'products' | 'product_variations', Map<number, string[]>> = {
      products: new Map(),
      product_variations: new Map(),
    };

    for (const key of selected) {
      const [table, id] = key.split(':') as ['products' | 'product_variations', string];
      const basePrice = priceOf(table, id);
      const final = computeFinalPrice(basePrice, batchDraft);
      if (basePrice <= 0 || final <= 0 || final >= basePrice) { skipped++; continue; }
      const rounded = Number(final.toFixed(2));
      const arr = byTable[table].get(rounded) || [];
      arr.push(id);
      byTable[table].set(rounded, arr);
    }

    for (const table of ['products', 'product_variations'] as const) {
      for (const [finalPrice, ids] of byTable[table].entries()) {
        const { error } = await supabase.from(table).update({
          on_sale: true,
          sale_price: finalPrice,
          sale_starts_at: startsAtIso,
          sale_ends_at: endsAtIso,
          sale_limit_qty: limitParsed,
          sale_channel: batchDraft.channel,
        }).in('id', ids);
        if (error) errors.push(`${table}: ${error.message}`);
        else ok += ids.length;
      }
    }

    setBatchSaving(false);
    if (errors.length > 0) {
      toast({ title: 'Alguns erros ocorreram', description: errors.slice(0, 3).join('\n'), variant: 'destructive' });
    }
    toast({
      title: `Promoção aplicada em ${ok} item(ns)`,
      description: skipped > 0 ? `${skipped} ignorados (preço inválido).` : undefined,
    });
    clearSelection();
    await load();
  };

  const removeBatch = async () => {
    if (selected.size === 0) return;
    setBatchSaving(true);
    const clear = { on_sale: false, sale_price: null, sale_starts_at: null, sale_ends_at: null, sale_limit_qty: null, sale_sold_qty: 0 };
    const prodIds: string[] = [];
    const varIds: string[] = [];
    for (const key of selected) {
      const [t, id] = key.split(':');
      if (t === 'products') prodIds.push(id); else varIds.push(id);
    }
    if (prodIds.length) await supabase.from('products').update(clear).in('id', prodIds);
    if (varIds.length) await supabase.from('product_variations').update(clear).in('id', varIds);
    setBatchSaving(false);
    toast({ title: `Promoção removida de ${prodIds.length + varIds.length} item(ns)` });
    clearSelection();
    await load();
  };

  const selectedItems = useMemo(() => {
    const out: {
      key: SelKey;
      name: string;
      sub: string;
      image?: string | null;
      price: number;
      totalCost: number;
      profit: number;
      finalPrice: number;
    }[] = [];
    const calc = (price: number, cost: number, freightPct: number, opCostPct: number, taxPct: number) => {
      const finalPrice = computeFinalPrice(price, batchDraft);
      const c = Number(cost || 0);
      const totalCost =
        c + c * (Number(freightPct || 0) / 100) + c * (Number(opCostPct || 0) / 100) + finalPrice * (Number(taxPct || 0) / 100);
      return { totalCost, profit: finalPrice - totalCost, finalPrice };
    };
    for (const key of selected) {
      const [table, id] = key.split(':') as ['products' | 'product_variations', string];
      if (table === 'products') {
        const p = products.find((x) => x.id === id);
        if (p) {
          const price = Number(Number(p.min_sale_price) > 0 ? p.min_sale_price : p.price);
          out.push({
            key,
            name: p.name,
            sub: p.category || 'Produto',
            image: p.image_url,
            price,
            ...calc(price, Number(p.cost || 0), Number(p.freight_pct || 0), Number(p.op_cost_pct || 0), Number(p.tax_pct || 0)),
          });
        }
      } else {
        for (const p of products) {
          const v = p.variations.find((x) => x.id === id);
          if (v) {
            const price = Number(Number(v.min_sale_price) > 0 ? v.min_sale_price : v.price);
            out.push({
              key,
              name: `${p.name}`,
              sub: v.name,
              image: v.image_url || p.image_url,
              price,
              ...calc(
                price,
                Number(v.cost ?? p.cost ?? 0),
                Number(v.freight_pct ?? p.freight_pct ?? 0),
                Number(v.op_cost_pct ?? p.op_cost_pct ?? 0),
                Number(v.tax_pct ?? p.tax_pct ?? 0),
              ),
            });
            break;
          }
        }
      }
    }
    return out;
  }, [selected, products, batchDraft]);


  const renderBatchTab = () => (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar produto..." value={batchSearch} onChange={(e) => setBatchSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-1">
          {(['all', 'active', 'scheduled', 'expired', 'off'] as const).map((f) => (
            <Button key={f} size="sm" variant={batchFilter === f ? 'default' : 'outline'} onClick={() => setBatchFilter(f)}>
              {f === 'all' ? 'Todos' : f === 'active' ? 'Ativas' : f === 'scheduled' ? 'Agendadas' : f === 'expired' ? 'Encerradas' : 'Sem promoção'}
            </Button>
          ))}
        </div>
        <div className="flex gap-1 sm:ml-auto">
          <Button size="sm" variant="outline" onClick={selectAllVisible}>Selecionar visíveis</Button>
          {selected.size > 0 && (
            <Button size="sm" variant="outline" onClick={clearSelection}><X className="w-4 h-4 mr-1" />Limpar ({selected.size})</Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
        </div>
      ) : (
        <div className="border rounded-lg divide-y max-h-[520px] overflow-y-auto">
          {batchFiltered.map((p) => {
            const hasVars = p.variations.length > 0;
            if (!hasVars) {
              const key = `products:${p.id}`;
              const checked = selected.has(key);
              return (
                <label key={p.id} className="flex items-center gap-3 p-2.5 hover:bg-muted/40 cursor-pointer">
                  <Checkbox checked={checked} onCheckedChange={() => toggleSel(key)} />
                  {p.image_url ? <img src={p.image_url} alt="" className="w-9 h-9 rounded object-cover" /> : <div className="w-9 h-9 rounded bg-muted" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground">{p.category} • R$ {Number(Number(p.min_sale_price) > 0 ? p.min_sale_price : p.price).toFixed(2)}</div>
                  </div>
                  <StatusBadge status={promoStatus(p)} className="text-[10px]" />
                </label>
              );
            }
            const varKeys = p.variations.map((v) => `product_variations:${v.id}`);
            const allChecked = varKeys.every((k) => selected.has(k));
            const someChecked = !allChecked && varKeys.some((k) => selected.has(k));
            const toggleAll = () => {
              setSelected((prev) => {
                const n = new Set(prev);
                if (allChecked) varKeys.forEach((k) => n.delete(k));
                else varKeys.forEach((k) => n.add(k));
                return n;
              });
            };
            return (
              <div key={p.id}>
                <label className="flex items-center gap-3 p-2.5 bg-muted/20 hover:bg-muted/40 cursor-pointer">
                  <Checkbox checked={allChecked ? true : someChecked ? 'indeterminate' : false} onCheckedChange={toggleAll} />
                  {p.image_url ? <img src={p.image_url} alt="" className="w-9 h-9 rounded object-cover" /> : <div className="w-9 h-9 rounded bg-muted" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground">{p.category} • {p.variations.length} variações</div>
                  </div>
                </label>
                {p.variations.map((v) => {
                  const key = `product_variations:${v.id}`;
                  const checked = selected.has(key);
                  return (
                    <label key={v.id} className="flex items-center gap-3 p-2 pl-10 hover:bg-muted/40 cursor-pointer">
                      <Checkbox checked={checked} onCheckedChange={() => toggleSel(key)} />
                      {v.image_url ? <img src={v.image_url} alt="" className="w-7 h-7 rounded object-cover" /> : <div className="w-7 h-7 rounded bg-muted" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{v.name}</div>
                        <div className="text-[11px] text-muted-foreground">R$ {Number(Number(v.min_sale_price) > 0 ? v.min_sale_price : v.price).toFixed(2)} • Estoque: {v.stock}</div>
                      </div>
                      <StatusBadge status={promoStatus(v)} className="text-[10px]" />
                    </label>
                  );
                })}
              </div>
            );
          })}
          {batchFiltered.length === 0 && (
            <div className="text-center py-10 text-muted-foreground text-sm">Nenhum produto encontrado.</div>
          )}
        </div>
      )}


      {/* Painel de itens selecionados */}
      {selected.size > 0 && (
        <div className="rounded-lg border bg-card">
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
            <div className="text-sm font-semibold flex items-center gap-2">
              <ListChecks className="w-4 h-4" /> Itens selecionados ({selected.size})
            </div>
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              <X className="w-4 h-4 mr-1" /> Limpar tudo
            </Button>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y">
            {selectedItems.map((it) => (
              <div key={it.key} className="flex items-center gap-3 p-2">
                {it.image ? <img src={it.image} alt="" className="w-8 h-8 rounded object-cover" /> : <div className="w-8 h-8 rounded bg-muted" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{it.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{it.sub} • R$ {it.price.toFixed(2)}</div>
                  <div className="text-[11px] flex flex-wrap gap-x-3 gap-y-0.5">
                    <span className="text-muted-foreground">Promo: R$ {it.finalPrice.toFixed(2)}</span>
                    <span className="text-muted-foreground">Custo: R$ {it.totalCost.toFixed(2)}</span>
                    <span className={it.profit < 0 ? 'text-destructive font-medium' : 'text-emerald-600 dark:text-emerald-400 font-medium'}>
                      Lucro: R$ {it.profit.toFixed(2)}
                    </span>
                  </div>
                </div>

                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleSel(it.key)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}



      {/* Painel sticky de configuração */}
      <div className="sticky bottom-0 z-10 rounded-lg border-2 border-primary/40 bg-primary/5 backdrop-blur p-4 space-y-3 shadow-lg">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="font-semibold text-sm flex items-center gap-2">
            <ListChecks className="w-4 h-4" />
            {selected.size} item(ns) selecionado(s)
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['percent', 'value', 'price'] as Mode[]).map((m) => (
            <Button key={m} size="sm" variant={batchDraft.mode === m ? 'default' : 'outline'} onClick={() => setBatchDraft({ ...batchDraft, mode: m })}>
              {m === 'percent' ? '% Desconto' : m === 'value' ? 'R$ Desconto' : 'Preço final'}
            </Button>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Aplicar promoção em</label>
          <div className="flex flex-wrap gap-2">
            {(['site', 'pdv', 'both'] as Channel[]).map((c) => (
              <Button key={c} size="sm" variant={batchDraft.channel === c ? 'default' : 'outline'} onClick={() => setBatchDraft({ ...batchDraft, channel: c })}>
                {c === 'site' ? 'Site' : c === 'pdv' ? 'PDV' : 'Ambos'}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">
              {batchDraft.mode === 'percent' ? '% de desconto' : batchDraft.mode === 'value' ? 'Valor de desconto (R$)' : 'Preço promocional (R$)'}
            </label>
            <Input type="number" min={0} step={batchDraft.mode === 'percent' ? 1 : 0.01}
              value={batchDraft.amount} onChange={(e) => setBatchDraft({ ...batchDraft, amount: e.target.value })} className="w-32" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Inicia em (opcional)</label>
            <Input type="datetime-local" value={batchDraft.startsAt}
              onChange={(e) => setBatchDraft({ ...batchDraft, startsAt: e.target.value })}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text');
                const parsed = parsePastedDate(text);
                if (parsed) { e.preventDefault(); setBatchDraft({ ...batchDraft, startsAt: parsed }); }
              }} className="w-56" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Termina em</label>
            <Input type="datetime-local" value={batchDraft.endsAt}
              onChange={(e) => setBatchDraft({ ...batchDraft, endsAt: e.target.value })}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text');
                const parsed = parsePastedDate(text);
                if (parsed) { e.preventDefault(); setBatchDraft({ ...batchDraft, endsAt: parsed }); }
              }} className="w-56" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Limite por item (opcional)</label>
            <Input type="number" min={1} step={1} placeholder="Ex: 10"
              value={batchDraft.limitQty} onChange={(e) => setBatchDraft({ ...batchDraft, limitQty: e.target.value })} className="w-32" />
          </div>
        </div>
        {batchDraft.mode === 'price' && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            ⚠️ "Preço final" aplica o mesmo valor absoluto em todos os itens. Itens com preço base menor ou igual serão ignorados.
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={applyBatch} disabled={batchSaving || selected.size === 0}>
            {batchSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Aplicar em {selected.size} item(ns)
          </Button>
          <Button size="sm" variant="outline" onClick={removeBatch} disabled={batchSaving || selected.size === 0}>
            <Trash2 className="w-4 h-4 mr-1" /> Remover promoção
          </Button>
        </div>
      </div>
    </div>
  );

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
        <Tabs defaultValue="batch" className="space-y-4">
          <TabsList>
            <TabsTrigger value="batch" className="gap-2"><ListChecks className="w-4 h-4" /> Em lote</TabsTrigger>
            <TabsTrigger value="individual" className="gap-2"><Tag className="w-4 h-4" /> Individual</TabsTrigger>
          </TabsList>

          <TabsContent value="batch">{renderBatchTab()}</TabsContent>

          <TabsContent value="individual" className="space-y-4">
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
                  const anyOnSale = isPromoActive(p) || p.variations.some((v) => isPromoActive(v));
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
                            {p.category} • R$ {Number(Number(p.min_sale_price) > 0 ? p.min_sale_price : p.price).toFixed(2)}
                            {Number(p.min_sale_price) > 0 && (
                              <span className="ml-1 text-[10px] uppercase tracking-wide text-primary">(preço site)</span>
                            )}
                            {hasVars && ` • ${p.variations.length} variações`}
                          </div>
                        </div>
                        {anyOnSale && <Badge className="bg-green-600 hover:bg-green-600">Em promoção</Badge>}
                      </div>

                      {!hasVars && (
                        <div className="p-3 border-t">
                          {renderEditor('products', p.id, Number(Number(p.min_sale_price) > 0 ? p.min_sale_price : p.price), p.sale_price, p.sale_starts_at, p.sale_ends_at, p.on_sale, p.sale_limit_qty, p.sale_sold_qty, Number(p.cost || 0), Number(p.freight_pct || 0), Number(p.op_cost_pct || 0), Number(p.tax_pct || 0), p.sale_channel)}
                        </div>
                      )}

                      {hasVars && isOpen && (
                        <div className="border-t bg-muted/20 p-3 space-y-3">
                          {renderBulkEditor(p)}
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
                                    R$ {Number(Number(v.min_sale_price) > 0 ? v.min_sale_price : v.price).toFixed(2)}
                                    {Number(v.min_sale_price) > 0 && (
                                      <span className="ml-1 text-[10px] uppercase tracking-wide text-primary">(site)</span>
                                    )}
                                    {' '}• Estoque: {v.stock}
                                  </div>
                                </div>
                                {isPromoActive(v) && <Badge className="bg-green-600 hover:bg-green-600">Promo</Badge>}
                              </div>
                              {renderEditor('product_variations', v.id, Number(Number(v.min_sale_price) > 0 ? v.min_sale_price : v.price), v.sale_price, v.sale_starts_at, v.sale_ends_at, v.on_sale, v.sale_limit_qty, v.sale_sold_qty, Number(v.cost ?? p.cost ?? 0), Number(v.freight_pct ?? p.freight_pct ?? 0), Number(v.op_cost_pct ?? p.op_cost_pct ?? 0), Number(v.tax_pct ?? p.tax_pct ?? 0), v.sale_channel)}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
