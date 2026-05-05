import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, Printer, Search, RefreshCw, Wand2 } from 'lucide-react';
import { generateLabelsPdf, type LabelItem } from '@/utils/labelPdfGenerator';
import { generateUniqueBarcode } from '@/utils/barcodeGenerator';

interface Row {
  id: string; // unique id (product or product:variation)
  product_id: string;
  variation_id: string | null;
  name: string; // display name
  sku: string | null;
  stock: number;
}

interface Props {
  storeName: string;
}

/**
 * Lista TODOS os produtos/variações (independente de pendência).
 * Permite selecionar e definir a quantidade de etiquetas a imprimir.
 */
export function AllProductsLabels({ storeName }: Props) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [qty, setQty] = useState<Record<string, number>>({});
  const [generating, setGenerating] = useState(false);
  const [generatingCodeFor, setGeneratingCodeFor] = useState<string | null>(null);
  const [stockEdit, setStockEdit] = useState<Record<string, string>>({});
  const [savingStockFor, setSavingStockFor] = useState<string | null>(null);

  const handleSaveStock = async (row: Row) => {
    const raw = stockEdit[row.id];
    if (raw === undefined) return;
    const newStock = parseInt(raw, 10);
    if (isNaN(newStock) || newStock < 0) {
      toast({ title: 'Valor inválido', description: 'Informe um número válido.', variant: 'destructive' });
      return;
    }
    if (newStock === row.stock) {
      setStockEdit((prev) => { const n = { ...prev }; delete n[row.id]; return n; });
      return;
    }
    try {
      setSavingStockFor(row.id);

      // Buscar estoque atual fresco do banco (evita delta errado se a tela estiver desatualizada)
      let currentStock = row.stock;
      if (row.variation_id) {
        const { data, error } = await supabase
          .from('product_variations')
          .select('stock')
          .eq('id', row.variation_id)
          .single();
        if (error) throw error;
        currentStock = Number(data?.stock || 0);
      } else {
        const { data, error } = await supabase
          .from('products')
          .select('stock')
          .eq('id', row.product_id)
          .single();
        if (error) throw error;
        currentStock = Number(data?.stock || 0);
      }

      const delta = newStock - currentStock;
      if (delta === 0) {
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, stock: newStock } : r)));
        setStockEdit((prev) => { const n = { ...prev }; delete n[row.id]; return n; });
        toast({ title: 'Estoque já estava em ' + newStock });
        return;
      }

      const { data: rpcData, error } = await supabase.rpc('apply_stock_movement', {
        p_product_id: row.product_id,
        p_variation_id: row.variation_id,
        p_quantity_delta: delta,
        p_movement_type: 'manual_adjust',
        p_order_id: null,
        p_reason: 'Ajuste manual via Etiquetas',
      });
      if (error) throw error;

      const result = rpcData as any;
      const finalStock = Number(result?.stock_after ?? newStock);

      // Confirmar lendo do banco
      let confirmed = finalStock;
      if (row.variation_id) {
        const { data } = await supabase
          .from('product_variations').select('stock').eq('id', row.variation_id).single();
        if (data) confirmed = Number(data.stock);
      } else {
        const { data } = await supabase
          .from('products').select('stock').eq('id', row.product_id).single();
        if (data) confirmed = Number(data.stock);
      }

      if (confirmed !== newStock) {
        toast({
          title: 'Atenção: estoque divergente',
          description: `Solicitado ${newStock}, salvo ${confirmed}. Verifique movimentações concorrentes.`,
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Estoque atualizado', description: `${row.name}: ${confirmed}` });
      }

      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, stock: confirmed } : r)));
      setStockEdit((prev) => { const n = { ...prev }; delete n[row.id]; return n; });
    } catch (err: any) {
      toast({ title: 'Erro ao atualizar estoque', description: err.message, variant: 'destructive' });
    } finally {
      setSavingStockFor(null);
    }
  };

  const handleGenerateCode = async (row: Row) => {
    try {
      setGeneratingCodeFor(row.id);
      const code = await generateUniqueBarcode();
      if (row.variation_id) {
        const { error } = await supabase
          .from('product_variations')
          .update({ sku: code })
          .eq('id', row.variation_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('products')
          .update({ sku: code })
          .eq('id', row.product_id);
        if (error) throw error;
      }
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, sku: code } : r)));
      toast({ title: 'Código gerado', description: code });
    } catch (err: any) {
      toast({ title: 'Erro ao gerar código', description: err.message, variant: 'destructive' });
    } finally {
      setGeneratingCodeFor(null);
    }
  };

  const load = async () => {
    setLoading(true);
    const fetchWithRetry = async <T,>(fn: () => Promise<T>, retries = 3): Promise<T> => {
      let lastErr: any;
      for (let i = 0; i <= retries; i++) {
        try {
          return await fn();
        } catch (err: any) {
          lastErr = err;
          const msg = String(err?.message || err || '');
          // Só retentar em falhas de rede/transientes
          if (i < retries && /fetch|network|timeout|TypeError/i.test(msg)) {
            await new Promise((r) => setTimeout(r, 600 * (i + 1)));
          } else if (i >= retries) {
            break;
          } else {
            await new Promise((r) => setTimeout(r, 600 * (i + 1)));
          }
        }
      }
      throw lastErr;
    };

    // Carrega independentemente: se um falhar, ainda mostramos o outro
    const loadProducts = async () => {
      const res: any = await fetchWithRetry(async () =>
        await supabase
          .from('products')
          .select('id, name, sku, stock')
          .order('name', { ascending: true })
          .limit(2000)
      );
      if (res.error) throw res.error;
      return res.data || [];
    };
    const loadVariations = async () => {
      const res: any = await fetchWithRetry(async () =>
        await supabase
          .from('product_variations')
          .select('id, product_id, name, sku, stock, products:product_id(name)')
          .order('name', { ascending: true })
          .limit(2000)
      );
      if (res.error) throw res.error;
      return res.data || [];
    };

    try {
      const [prodsSettled, varsSettled] = await Promise.allSettled([
        loadProducts(),
        loadVariations(),
      ]);

      if (prodsSettled.status === 'rejected' && varsSettled.status === 'rejected') {
        throw prodsSettled.reason;
      }
      if (prodsSettled.status === 'rejected') {
        toast({
          title: 'Falha parcial',
          description: 'Não foi possível carregar produtos simples. Mostrando apenas variações.',
          variant: 'destructive',
        });
      }
      if (varsSettled.status === 'rejected') {
        toast({
          title: 'Falha parcial',
          description: 'Não foi possível carregar variações. Mostrando apenas produtos simples.',
          variant: 'destructive',
        });
      }

      const prods = prodsSettled.status === 'fulfilled' ? prodsSettled.value : [];
      const vars = varsSettled.status === 'fulfilled' ? varsSettled.value : [];

      const variationProductIds = new Set((vars || []).map((v: any) => v.product_id));

      const productRows: Row[] = (prods || [])
        .filter((p: any) => !variationProductIds.has(p.id)) // se tem variação, mostra só as variações
        .map((p: any) => ({
          id: `p:${p.id}`,
          product_id: p.id,
          variation_id: null,
          name: p.name,
          sku: p.sku,
          stock: Number(p.stock || 0),
        }));

      const varRows: Row[] = (vars || []).map((v: any) => ({
        id: `v:${v.id}`,
        product_id: v.product_id,
        variation_id: v.id,
        name: `${v.products?.name || ''} - ${v.name}`,
        sku: v.sku,
        stock: Number(v.stock || 0),
      }));

      const all = [...productRows, ...varRows].sort((a, b) =>
        a.name.localeCompare(b.name, 'pt-BR')
      );
      setRows(all);
    } catch (err: any) {
      toast({ title: 'Erro ao carregar produtos', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.name, r.sku].filter(Boolean).some((v) => v!.toLowerCase().includes(q))
    );
  }, [rows, search]);

  const selectedRows = useMemo(
    () => filtered.filter((r) => selected[r.id] && !!r.sku),
    [filtered, selected]
  );

  const totalLabels = useMemo(
    () => selectedRows.reduce((acc, r) => acc + (qty[r.id] || 1), 0),
    [selectedRows, qty]
  );

  const toggleAll = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    if (checked) filtered.forEach((r) => { if (r.sku) next[r.id] = true; });
    setSelected(next);
  };

  const handlePrint = async () => {
    if (selectedRows.length === 0) {
      toast({ title: 'Selecione produtos', description: 'Marque ao menos um item com código.', variant: 'destructive' });
      return;
    }
    const items: LabelItem[] = selectedRows.map((r) => ({
      code: r.sku!,
      description: r.name,
      quantity: Math.max(1, qty[r.id] || 1),
    }));
    try {
      setGenerating(true);
      await generateLabelsPdf(items, { storeName });
      toast({ title: 'PDF gerado', description: `${items.reduce((a, i) => a + i.quantity, 0)} etiqueta(s).` });
    } catch (err: any) {
      toast({ title: 'Erro ao gerar PDF', description: err.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou código..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
        <Button onClick={handlePrint} disabled={generating || selectedRows.length === 0}>
          {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
          Imprimir selecionados ({totalLabels})
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
        </div>
      ) : (
        <div className="border rounded-md overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="p-2 w-10">
                  <Checkbox
                    checked={
                      filtered.filter((r) => !!r.sku).length > 0 &&
                      filtered.filter((r) => !!r.sku).every((r) => selected[r.id])
                    }
                    onCheckedChange={(c) => toggleAll(!!c)}
                  />
                </th>
                <th className="text-left p-2">Produto</th>
                <th className="text-left p-2">Código</th>
                <th className="text-right p-2">Estoque</th>
                <th className="text-right p-2 w-32">Qtd. etiquetas</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="p-2">
                    <Checkbox
                      checked={!!selected[r.id]}
                      disabled={!r.sku}
                      onCheckedChange={(c) =>
                        setSelected((prev) => ({ ...prev, [r.id]: !!c }))
                      }
                    />
                  </td>
                  <td className="p-2 font-medium">{r.name}</td>
                  <td className="p-2 font-mono text-xs">
                    {r.sku || (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2"
                        disabled={generatingCodeFor === r.id}
                        onClick={() => handleGenerateCode(r)}
                      >
                        {generatingCodeFor === r.id ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                          <Wand2 className="w-3 h-3 mr-1" />
                        )}
                        Gerar código
                      </Button>
                    )}
                  </td>
                  <td className="p-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Input
                        type="number"
                        min={0}
                        value={stockEdit[r.id] ?? String(r.stock)}
                        onChange={(e) =>
                          setStockEdit((prev) => ({ ...prev, [r.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveStock(r);
                        }}
                        className="h-8 w-20 text-right"
                      />
                      {stockEdit[r.id] !== undefined && stockEdit[r.id] !== String(r.stock) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2"
                          disabled={savingStockFor === r.id}
                          onClick={() => handleSaveStock(r)}
                        >
                          {savingStockFor === r.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            'OK'
                          )}
                        </Button>
                      )}
                    </div>
                  </td>
                  <td className="p-2 text-right">
                    <Input
                      type="number"
                      min={1}
                      max={500}
                      value={qty[r.id] ?? 1}
                      disabled={!r.sku || !selected[r.id]}
                      onChange={(e) =>
                        setQty((prev) => ({ ...prev, [r.id]: Math.max(1, parseInt(e.target.value) || 1) }))
                      }
                      className="h-8 w-20 ml-auto text-right"
                    />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    Nenhum produto encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
