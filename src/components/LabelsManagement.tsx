import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Printer, Search, Tag, RefreshCw, CheckCheck, ScanLine, Sparkles } from 'lucide-react';
import { generateLabelsPdf, type LabelItem } from '@/utils/labelPdfGenerator';
import { generateUniqueBarcode } from '@/utils/barcodeGenerator';
import { LabelAssignBarcodeDialog } from './LabelAssignBarcodeDialog';

interface PendingRow {
  id: string;
  product_id: string;
  variation_id: string | null;
  pending_qty: number;
  product_name: string;
  product_sku: string | null;
  variation_name: string | null;
  variation_sku: string | null;
}

/**
 * Gestão de etiquetagem de produtos.
 *
 * Mostra todos os itens (produto OU variação) cujo `pending_qty > 0`.
 * Cada linha sem código tem 2 ações: ler código de fábrica (popup) ou
 * gerar um código interno. Apenas itens COM código podem ir para impressão.
 */
export function LabelsManagement() {
  const { toast } = useToast();
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [storeName, setStoreName] = useState<string>('JAPAS PESCA E CONVENIÊNCIA');
  const [generating, setGenerating] = useState(false);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [scanDialog, setScanDialog] = useState<PendingRow | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('product_label_pending')
        .select(
          `id, product_id, variation_id, pending_qty,
           products:product_id(name, sku),
           product_variations:variation_id(name, sku)`
        )
        .gt('pending_qty', 0)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const mapped: PendingRow[] = (data || []).map((r: any) => ({
        id: r.id,
        product_id: r.product_id,
        variation_id: r.variation_id,
        pending_qty: r.pending_qty,
        product_name: r.products?.name || '—',
        product_sku: r.products?.sku || null,
        variation_name: r.product_variations?.name || null,
        variation_sku: r.product_variations?.sku || null,
      }));
      setRows(mapped);
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar etiquetas',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Carrega razão social pra usar como cabeçalho da etiqueta
  const loadStoreName = async () => {
    const { data } = await supabase
      .from('company_fiscal_data')
      .select('nome_fantasia, razao_social')
      .limit(1)
      .maybeSingle();
    if (data) {
      setStoreName((data.nome_fantasia || data.razao_social || storeName).toUpperCase());
    }
  };

  useEffect(() => {
    load();
    loadStoreName();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const codeFor = (r: PendingRow): string =>
    (r.variation_sku || r.product_sku || '').trim();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.product_name, r.variation_name, r.product_sku, r.variation_sku]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q))
    );
  }, [rows, search]);

  // Apenas itens COM código podem ser impressos
  const printableRows = useMemo(() => rows.filter((r) => !!codeFor(r)), [rows]);
  const printableTotal = useMemo(
    () => printableRows.reduce((acc, r) => acc + r.pending_qty, 0),
    [printableRows]
  );

  const totalLabels = useMemo(
    () => rows.reduce((acc, r) => acc + r.pending_qty, 0),
    [rows]
  );

  const withoutCode = useMemo(() => rows.filter((r) => !codeFor(r)).length, [rows]);

  const selectedRows = useMemo(
    () => filtered.filter((r) => selected[r.id] && !!codeFor(r)),
    [filtered, selected]
  );

  const selectedTotal = useMemo(
    () => selectedRows.reduce((acc, r) => acc + r.pending_qty, 0),
    [selectedRows]
  );

  const toggleAll = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    if (checked) filtered.forEach((r) => {
      if (codeFor(r)) next[r.id] = true;
    });
    setSelected(next);
  };

  const handlePrint = async (rowsToPrint: PendingRow[], markPrinted: boolean) => {
    // Garante que só itens COM código vão para o PDF e marcação
    const validRows = rowsToPrint.filter((r) => !!codeFor(r));

    const items: LabelItem[] = validRows.map((r) => ({
      code: codeFor(r),
      description: r.variation_name
        ? `${r.product_name} - ${r.variation_name}`
        : r.product_name,
      quantity: r.pending_qty,
    }));

    if (items.length === 0) {
      toast({
        title: 'Sem itens válidos',
        description: 'Selecione produtos com código de barras cadastrado.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setGenerating(true);
      await generateLabelsPdf(items, { storeName });

      if (markPrinted) {
        // Marca apenas os itens efetivamente impressos (com código)
        for (const r of validRows) {
          await supabase.rpc('mark_labels_printed', {
            p_product_id: r.product_id,
            p_variation_id: r.variation_id,
            p_qty: r.pending_qty,
          });
        }
        toast({
          title: 'Etiquetas geradas',
          description: `${validRows.length} item(ns) removido(s) da fila.`,
        });
        setSelected({});
        await load();
      } else {
        toast({
          title: 'PDF gerado',
          description: 'Os itens permanecem na fila até você marcar como etiquetados.',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao gerar etiquetas',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleMarkOnly = async (rowsToMark: PendingRow[]) => {
    const validRows = rowsToMark.filter((r) => !!codeFor(r));
    if (validRows.length === 0) {
      toast({
        title: 'Nenhum item válido',
        description: 'Itens sem código não podem ser marcados como etiquetados.',
        variant: 'destructive',
      });
      return;
    }
    try {
      for (const r of validRows) {
        await supabase.rpc('mark_labels_printed', {
          p_product_id: r.product_id,
          p_variation_id: r.variation_id,
          p_qty: r.pending_qty,
        });
      }
      toast({ title: 'Marcado como etiquetado' });
      setSelected({});
      await load();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  // Gera código interno EAN-13 (prefixo 200) para o item.
  // Mantém na fila pendente — ele PRECISA ser impresso ainda.
  const handleGenerateCode = async (r: PendingRow) => {
    try {
      setGeneratingFor(r.id);
      const code = await generateUniqueBarcode();

      if (r.variation_id) {
        const { error } = await supabase
          .from('product_variations')
          .update({ sku: code })
          .eq('id', r.variation_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('products')
          .update({ sku: code })
          .eq('id', r.product_id);
        if (error) throw error;
      }

      toast({
        title: 'Código gerado',
        description: `Código ${code} atribuído. Continua pendente para impressão.`,
      });
      await load();
    } catch (err: any) {
      toast({
        title: 'Erro ao gerar código',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setGeneratingFor(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Tag className="w-5 h-5" />
                Etiquetagem de Produtos
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Itens marcados como <strong>não etiquetados</strong>. Produtos sem código de barras
                de fábrica precisam de leitura ou geração antes de imprimir a etiqueta.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-sm">
                {totalLabels} pendente{totalLabels === 1 ? '' : 's'}
              </Badge>
              {withoutCode > 0 && (
                <Badge variant="destructive" className="text-sm">
                  {withoutCode} sem código
                </Badge>
              )}
              <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Filtro */}
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
            <Button
              onClick={() => handlePrint(printableRows, true)}
              disabled={generating || printableRows.length === 0}
              title={
                printableRows.length === 0
                  ? 'Nenhum item com código pronto para imprimir'
                  : ''
              }
            >
              {generating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Printer className="w-4 h-4 mr-2" />
              )}
              Imprimir TODAS com código ({printableTotal})
            </Button>
          </div>

          {/* Ações com seleção */}
          {selectedRows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 p-3 bg-muted rounded-md">
              <span className="text-sm font-medium">
                {selectedRows.length} item(ns) — {selectedTotal} etiqueta(s)
              </span>
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handlePrint(selectedRows, false)}
                  disabled={generating}
                >
                  <Printer className="w-4 h-4 mr-1" />
                  Só gerar PDF
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleMarkOnly(selectedRows)}
                >
                  <CheckCheck className="w-4 h-4 mr-1" />
                  Marcar como etiquetado
                </Button>
                <Button
                  size="sm"
                  onClick={() => handlePrint(selectedRows, true)}
                  disabled={generating}
                >
                  {generating ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Printer className="w-4 h-4 mr-1" />
                  )}
                  Imprimir e marcar
                </Button>
              </div>
            </div>
          )}

          {/* Tabela */}
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Tag className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>Nenhum produto pendente de etiqueta. 🎉</p>
            </div>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 w-10">
                      <Checkbox
                        checked={
                          printableRows.length > 0 &&
                          filtered.filter((r) => !!codeFor(r)).every((r) => selected[r.id])
                        }
                        onCheckedChange={(c) => toggleAll(!!c)}
                      />
                    </th>
                    <th className="text-left p-2">Produto</th>
                    <th className="text-left p-2">Código</th>
                    <th className="text-right p-2">Qtd.</th>
                    <th className="text-right p-2 w-[260px]">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const code = codeFor(r);
                    const hasCode = !!code;
                    const isInternal = code.startsWith('200');
                    return (
                      <tr key={r.id} className="border-t hover:bg-muted/30">
                        <td className="p-2">
                          <Checkbox
                            checked={!!selected[r.id]}
                            disabled={!hasCode}
                            onCheckedChange={(c) =>
                              setSelected((prev) => ({ ...prev, [r.id]: !!c }))
                            }
                          />
                        </td>
                        <td className="p-2">
                          <div className="font-medium">{r.product_name}</div>
                          {r.variation_name && (
                            <div className="text-xs text-muted-foreground">
                              Variação: {r.variation_name}
                            </div>
                          )}
                        </td>
                        <td className="p-2 font-mono text-xs">
                          {hasCode ? (
                            <span className={isInternal ? 'text-amber-600' : ''}>
                              {code}
                              {isInternal && (
                                <span className="ml-1 text-[10px] uppercase opacity-70">
                                  (interno)
                                </span>
                              )}
                            </span>
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              sem código
                            </Badge>
                          )}
                        </td>
                        <td className="p-2 text-right font-bold">{r.pending_qty}</td>
                        <td className="p-2 text-right">
                          {hasCode ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={generating}
                              onClick={() => handlePrint([r], true)}
                            >
                              <Printer className="w-3.5 h-3.5 mr-1" />
                              Imprimir
                            </Button>
                          ) : (
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setScanDialog(r)}
                              >
                                <ScanLine className="w-3.5 h-3.5 mr-1" />
                                Ler código
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleGenerateCode(r)}
                                disabled={generatingFor === r.id}
                              >
                                {generatingFor === r.id ? (
                                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                                ) : (
                                  <Sparkles className="w-3.5 h-3.5 mr-1" />
                                )}
                                Gerar código
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {scanDialog && (
        <LabelAssignBarcodeDialog
          open={!!scanDialog}
          onOpenChange={(open) => !open && setScanDialog(null)}
          productId={scanDialog.product_id}
          variationId={scanDialog.variation_id}
          productName={
            scanDialog.variation_name
              ? `${scanDialog.product_name} - ${scanDialog.variation_name}`
              : scanDialog.product_name
          }
          onSaved={load}
        />
      )}
    </>
  );
}
