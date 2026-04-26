import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Header } from '@/components/Header';
import {
  ArrowLeft, Upload, Loader2, FileText, Search, Check, X, Package, Sparkles,
  AlertTriangle, CheckCircle2, FileQuestion,
} from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { extractStockFromPdf, type ExtractedStockLine } from '@/utils/pdfStockExtractor';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ProductMin {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  category: string;
}

type RowStatus = 'matched' | 'manual' | 'draft' | 'ignored';

interface MigrationRow {
  id: string;
  raw: string;
  name: string;
  quantity: number;
  code?: string;
  matchedProductId: string | null;
  matchScore: number; // 0..1
  status: RowStatus;
  applied?: boolean;
  error?: string;
}

const DRAFT_CATEGORY = 'Rascunho - Migração';
const STOCK_MOVEMENT_TYPE = 'manual_adjust';

// ---------- Fuzzy matching (Jaccard sobre tokens normalizados) ----------
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s: string): Set<string> {
  return new Set(normalize(s).split(' ').filter((t) => t.length >= 2));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const uni = a.size + b.size - inter;
  return uni === 0 ? 0 : inter / uni;
}

function findBestMatch(
  line: ExtractedStockLine,
  products: ProductMin[],
  productTokens: Map<string, Set<string>>,
): { id: string | null; score: number } {
  // Match exato por SKU/EAN primeiro
  if (line.code) {
    const exact = products.find((p) => p.sku && p.sku === line.code);
    if (exact) return { id: exact.id, score: 1 };
  }

  const lineTok = tokens(line.name);
  if (lineTok.size === 0) return { id: null, score: 0 };

  let bestId: string | null = null;
  let bestScore = 0;
  for (const p of products) {
    const t = productTokens.get(p.id)!;
    const s = jaccard(lineTok, t);
    if (s > bestScore) {
      bestScore = s;
      bestId = p.id;
    }
  }
  return { id: bestId, score: bestScore };
}

const MATCH_THRESHOLD = 0.5;

// ---------- Componente principal ----------
export default function StockMigration() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isAdmin, loading: authLoading } = useAuth();

  const [products, setProducts] = useState<ProductMin[]>([]);
  const [productTokens, setProductTokens] = useState<Map<string, Set<string>>>(new Map());
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<MigrationRow[]>([]);
  const [fileName, setFileName] = useState<string>('');

  const [applying, setApplying] = useState(false);
  const [appliedSummary, setAppliedSummary] = useState<{ ok: number; err: number } | null>(null);

  // Diálogo de busca manual
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerRowId, setPickerRowId] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');

  useEffect(() => {
    if (!authLoading && !isAdmin) navigate('/auth');
  }, [authLoading, isAdmin, navigate]);

  // Carrega catálogo (só id + nome + sku) para matching local
  useEffect(() => {
    (async () => {
      setLoadingProducts(true);
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku, stock, category')
        .order('name')
        .limit(5000);
      if (error) {
        toast({ title: 'Erro ao carregar produtos', description: error.message, variant: 'destructive' });
      } else {
        const list = (data || []) as ProductMin[];
        setProducts(list);
        const tokMap = new Map<string, Set<string>>();
        for (const p of list) tokMap.set(p.id, tokens(p.name));
        setProductTokens(tokMap);
      }
      setLoadingProducts(false);
    })();
  }, [toast]);

  const productById = useMemo(() => {
    const m = new Map<string, ProductMin>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParsing(true);
    setAppliedSummary(null);
    try {
      const extracted = await extractStockFromPdf(file);
      if (extracted.length === 0) {
        toast({
          title: 'Nada encontrado',
          description: 'Não consegui detectar linhas de produto+quantidade nesse PDF.',
          variant: 'destructive',
        });
        setRows([]);
        return;
      }
      const newRows: MigrationRow[] = extracted.map((line, i) => {
        const m = findBestMatch(line, products, productTokens);
        const matched = m.id && m.score >= MATCH_THRESHOLD;
        return {
          id: `r${i}`,
          raw: line.raw,
          name: line.name,
          quantity: line.quantity,
          code: line.code,
          matchedProductId: matched ? m.id : null,
          matchScore: m.score,
          status: matched ? 'matched' : 'draft',
        };
      });
      setRows(newRows);
      toast({
        title: 'PDF processado',
        description: `${newRows.length} linhas detectadas`,
      });
    } catch (err: any) {
      toast({ title: 'Erro ao ler PDF', description: err.message, variant: 'destructive' });
    } finally {
      setParsing(false);
      e.target.value = '';
    }
  }

  function setRowStatus(id: string, status: RowStatus) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  }
  function setRowQuantity(id: string, q: number) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, quantity: q } : r)));
  }
  function openPicker(rowId: string) {
    const r = rows.find((x) => x.id === rowId);
    setPickerRowId(rowId);
    setPickerQuery(r?.name ?? '');
    setPickerOpen(true);
  }
  function pickProduct(productId: string) {
    if (!pickerRowId) return;
    setRows((prev) =>
      prev.map((r) =>
        r.id === pickerRowId
          ? { ...r, matchedProductId: productId, status: 'manual', matchScore: 1 }
          : r,
      ),
    );
    setPickerOpen(false);
    setPickerRowId(null);
  }

  const pickerResults = useMemo(() => {
    const q = normalize(pickerQuery);
    if (q.length < 2) return [];
    return products
      .map((p) => ({ p, score: jaccard(tokens(pickerQuery), productTokens.get(p.id)!) }))
      .filter((x) => x.score > 0 || normalize(x.p.name).includes(q) || (x.p.sku ?? '').includes(pickerQuery))
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);
  }, [pickerQuery, products, productTokens]);

  const stats = useMemo(() => {
    const matched = rows.filter((r) => r.status === 'matched').length;
    const manual = rows.filter((r) => r.status === 'manual').length;
    const draft = rows.filter((r) => r.status === 'draft').length;
    const ignored = rows.filter((r) => r.status === 'ignored').length;
    return { matched, manual, draft, ignored, total: rows.length };
  }, [rows]);

  async function applyAll() {
    if (rows.length === 0) return;
    setApplying(true);
    let ok = 0;
    let err = 0;
    const next = [...rows];

    for (let i = 0; i < next.length; i++) {
      const r = next[i];
      if (r.status === 'ignored') continue;

      try {
        let productId = r.matchedProductId;
        let createdDraftId: string | null = null;

        // Cria rascunho se necessário
        if (r.status === 'draft' || !productId) {
          const { data: created, error: createErr } = await supabase
            .from('products')
            .insert({
              name: r.name,
              description: `Migrado do estoque antigo. Linha original: "${r.raw}"`,
              price: 0,
              category: DRAFT_CATEGORY,
              stock: 0, // o estoque entra via apply_stock_movement
              sku: r.code ?? null,
              created_by: user?.id ?? null,
            })
            .select('id')
            .single();
          if (createErr) throw createErr;
          productId = created.id;
          createdDraftId = created.id;
        }

        // Aplica movimentação de ajuste
        const { error: rpcErr } = await supabase.rpc('apply_stock_movement', {
          p_product_id: productId!,
          p_variation_id: null,
          p_quantity_delta: r.quantity,
          p_movement_type: STOCK_MOVEMENT_TYPE,
          p_order_id: null,
          p_reason: `Migração de estoque (PDF: ${fileName})`,
        });
        if (rpcErr) throw rpcErr;

        next[i] = { ...r, applied: true, error: undefined };
        ok++;
      } catch (e: any) {
        if (createdDraftId) {
          await supabase.from('products').delete().eq('id', createdDraftId);
        }
        next[i] = { ...r, applied: false, error: e.message };
        err++;
      }
      setRows([...next]);
    }
    setApplying(false);
    setAppliedSummary({ ok, err });
    toast({
      title: 'Migração concluída',
      description: `${ok} aplicados · ${err} com erro`,
      variant: err > 0 ? 'destructive' : 'default',
    });
  }

  const allDone = appliedSummary !== null;

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      <div className="bg-foreground text-background pt-20 lg:pt-32 pb-8">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary mb-3">
                <Sparkles className="w-3.5 h-3.5" />
                <span className="text-[11px] font-bold uppercase tracking-wider">Migração</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-display font-black tracking-tight">
                Migração de Estoque
              </h1>
              <p className="text-sm text-background/60 mt-1">
                Importe o estoque do sistema antigo a partir de um PDF.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => navigate('/admin')}
              className="rounded-full bg-transparent border-background/20 text-background hover:bg-background hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6 -mt-4 space-y-6">
        {/* Passo 1: Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" /> 1. Enviar PDF do estoque
            </CardTitle>
            <CardDescription>
              Aceita PDFs digitais (texto selecionável). O arquivo é processado totalmente no seu navegador.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept="application/pdf"
                onChange={handleFile}
                disabled={parsing || loadingProducts}
              />
              {parsing && <Loader2 className="w-4 h-4 animate-spin" />}
              {loadingProducts && <span className="text-xs text-muted-foreground">Carregando catálogo...</span>}
            </div>
            {fileName && (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <FileText className="w-3 h-3" /> {fileName}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Passo 2: Revisão */}
        {rows.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="w-5 h-5" /> 2. Revisar vínculos
              </CardTitle>
              <CardDescription>
                Confira a sugestão de vínculo para cada linha. O que não bater vira rascunho.
              </CardDescription>
              <div className="flex flex-wrap gap-2 pt-2">
                <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  {stats.matched} vinculados
                </Badge>
                <Badge variant="secondary" className="bg-blue-500/15 text-blue-700 dark:text-blue-400">
                  {stats.manual} manuais
                </Badge>
                <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-400">
                  <FileQuestion className="w-3 h-3 mr-1" />
                  {stats.draft} rascunhos
                </Badge>
                <Badge variant="outline">
                  {stats.ignored} ignorados
                </Badge>
                <Badge variant="outline">{stats.total} total</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[260px]">Linha do PDF</TableHead>
                      <TableHead className="w-24">Qtd</TableHead>
                      <TableHead className="min-w-[260px]">Vínculo</TableHead>
                      <TableHead className="w-40 text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const linked = r.matchedProductId ? productById.get(r.matchedProductId) : null;
                      return (
                        <TableRow key={r.id} className={r.status === 'ignored' ? 'opacity-50' : ''}>
                          <TableCell>
                            <div className="font-medium text-sm">{r.name}</div>
                            <div className="text-[10px] text-muted-foreground truncate max-w-[280px]">
                              {r.raw}
                              {r.code && <span className="ml-1">· EAN {r.code}</span>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              value={r.quantity}
                              onChange={(e) => setRowQuantity(r.id, parseInt(e.target.value || '0', 10))}
                              className="h-8 w-20"
                              disabled={r.applied}
                            />
                          </TableCell>
                          <TableCell>
                            {r.status === 'draft' && !linked ? (
                              <div className="flex items-center gap-1.5">
                                <Badge variant="outline" className="bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-400">
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                  Será criado como rascunho
                                </Badge>
                              </div>
                            ) : linked ? (
                              <div>
                                <div className="text-sm font-medium flex items-center gap-2">
                                  <Package className="w-3 h-3 text-muted-foreground" />
                                  {linked.name}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  Estoque atual: {linked.stock}
                                  {r.matchScore < 1 && (
                                    <span className="ml-2">
                                      · match {Math.round(r.matchScore * 100)}%
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                            {r.applied && (
                              <Badge variant="secondary" className="mt-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                                <Check className="w-3 h-3 mr-1" /> Aplicado
                              </Badge>
                            )}
                            {r.error && (
                              <div className="text-[10px] text-destructive mt-1">{r.error}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2"
                                onClick={() => openPicker(r.id)}
                                disabled={r.applied}
                                title="Buscar e vincular outro produto"
                              >
                                <Search className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant={r.status === 'ignored' ? 'default' : 'ghost'}
                                className="h-7 px-2"
                                onClick={() =>
                                  setRowStatus(r.id, r.status === 'ignored' ? (r.matchedProductId ? 'matched' : 'draft') : 'ignored')
                                }
                                disabled={r.applied}
                                title="Ignorar esta linha"
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
                <p className="text-xs text-muted-foreground">
                  Itens marcados como <strong>rascunho</strong> serão criados na categoria{' '}
                  <code className="bg-muted px-1 rounded">{DRAFT_CATEGORY}</code> com preço 0
                  para você completar depois em <em>Catálogo</em>.
                </p>
                <Button
                  size="lg"
                  onClick={applyAll}
                  disabled={applying || allDone}
                  className="rounded-full"
                >
                  {applying ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Aplicando...
                    </>
                  ) : allDone ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" /> Concluído
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 mr-2" /> Aplicar migração
                    </>
                  )}
                </Button>
              </div>

              {appliedSummary && (
                <div className="mt-3 p-3 rounded-lg border bg-muted/30 text-sm">
                  <strong>{appliedSummary.ok}</strong> aplicados ·{' '}
                  <strong className={appliedSummary.err > 0 ? 'text-destructive' : ''}>
                    {appliedSummary.err}
                  </strong>{' '}
                  com erro.
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Diálogo: buscar produto manualmente */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Vincular a um produto</DialogTitle>
            <DialogDescription>Busque por nome ou SKU.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Buscar</Label>
              <Input
                autoFocus
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder="Nome do produto ou SKU..."
              />
            </div>
            <ScrollArea className="h-[360px] border rounded-md">
              {pickerResults.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Digite ao menos 2 caracteres
                </div>
              ) : (
                <div className="divide-y">
                  {pickerResults.map(({ p, score }) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => pickProduct(p.id)}
                      className="w-full text-left p-3 hover:bg-muted/50 transition"
                    >
                      <div className="font-medium text-sm">{p.name}</div>
                      <div className="text-[10px] text-muted-foreground flex gap-3">
                        <span>SKU: {p.sku || '—'}</span>
                        <span>Estoque: {p.stock}</span>
                        <span>{p.category}</span>
                        {score > 0 && <span>· {Math.round(score * 100)}%</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
