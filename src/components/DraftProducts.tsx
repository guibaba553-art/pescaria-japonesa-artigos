import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useCategories } from '@/hooks/useCategories';
import { PanelHeader } from '@/components/admin/PanelHeader';
import { FileEdit, CheckCircle2, Trash2, Package, Hash, Search, Link2 } from 'lucide-react';

interface DraftProduct {
  id: string;
  name: string;
  description: string;
  short_description: string | null;
  price: number;
  stock: number;
  sku: string | null;
  ncm: string | null;
  category: string;
  image_url: string | null;
  weight_grams: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
}

export function DraftProducts({ onChange }: { onChange?: () => void }) {
  const { categories } = useCategories();
  const [drafts, setDrafts] = useState<DraftProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<DraftProduct | null>(null);
  const [form, setForm] = useState({
    name: '',
    short_description: '',
    description: '',
    price: '',
    stock: '',
    sku: '',
    ncm: '',
    category: '',
    weight_grams: '',
    length_cm: '',
    width_cm: '',
    height_cm: '',
  });
  const [saving, setSaving] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSearch, setMergeSearch] = useState('');
  const [mergeResults, setMergeResults] = useState<Array<{ id: string; name: string; stock: number; sku: string | null; image_url: string | null; category: string }>>([]);
  const [mergeTarget, setMergeTarget] = useState<{ id: string; name: string; stock: number } | null>(null);
  const [merging, setMerging] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadDrafts();
  }, []);

  const loadDrafts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('id, name, description, short_description, price, stock, sku, ncm, category, image_url, weight_grams, length_cm, width_cm, height_cm')
      .eq('category', 'Pendente Revisão')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Erro ao carregar rascunhos', description: error.message, variant: 'destructive' });
    } else {
      setDrafts(data || []);
    }
    setLoading(false);
  };

  const openEditor = (d: DraftProduct) => {
    setEditing(d);
    setMergeMode(false);
    setMergeSearch('');
    setMergeResults([]);
    setMergeTarget(null);
    setForm({
      name: d.name,
      short_description: d.short_description || '',
      description: d.description || '',
      price: String(d.price ?? ''),
      stock: String(d.stock ?? ''),
      sku: d.sku || '',
      ncm: d.ncm || '',
      category: '',
      weight_grams: d.weight_grams ? String(d.weight_grams) : '',
      length_cm: d.length_cm ? String(d.length_cm) : '',
      width_cm: d.width_cm ? String(d.width_cm) : '',
      height_cm: d.height_cm ? String(d.height_cm) : '',
    });
  };

  // Busca produtos do catálogo (excluindo rascunhos) para mesclar
  useEffect(() => {
    if (!mergeMode || !editing) return;
    const term = mergeSearch.trim();
    const handle = setTimeout(async () => {
      let query = supabase
        .from('products')
        .select('id, name, stock, sku, image_url, category')
        .neq('category', 'Pendente Revisão')
        .neq('id', editing.id)
        .order('name', { ascending: true })
        .limit(20);

      if (term.length >= 2) {
        query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (!error) setMergeResults(data || []);
    }, 250);
    return () => clearTimeout(handle);
  }, [mergeSearch, mergeMode, editing]);

  const handleMerge = async () => {
    if (!editing || !mergeTarget) return;
    const qty = parseInt(form.stock || '0');
    if (qty <= 0) {
      toast({ title: 'Quantidade inválida', description: 'Estoque do rascunho deve ser maior que zero.', variant: 'destructive' });
      return;
    }

    setMerging(true);
    try {
      // Soma estoque ao produto existente via RPC (mantém histórico)
      const { error: rpcErr } = await supabase.rpc('apply_stock_movement', {
        p_product_id: mergeTarget.id,
        p_variation_id: null,
        p_quantity_delta: qty,
        p_movement_type: 'manual_adjust',
        p_order_id: null,
        p_reason: `Mesclado de rascunho: ${editing.name}`,
      });
      if (rpcErr) throw rpcErr;

      // Remove o rascunho
      const { error: delErr } = await supabase.from('products').delete().eq('id', editing.id);
      if (delErr) throw delErr;

      toast({
        title: 'Estoque mesclado!',
        description: `+${qty} un. somadas a "${mergeTarget.name}". Rascunho removido.`,
      });
      setEditing(null);
      await loadDrafts();
      onChange?.();
    } catch (e: any) {
      toast({ title: 'Erro ao mesclar', description: e.message || String(e), variant: 'destructive' });
    } finally {
      setMerging(false);
    }
  };

      return;
    }
    if (!form.name.trim() || !form.price || parseFloat(form.price) <= 0) {
      toast({ title: 'Nome e preço válidos são obrigatórios', variant: 'destructive' });
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('products')
      .update({
        name: form.name.trim(),
        short_description: form.short_description || null,
        description: form.description || form.name.trim(),
        price: parseFloat(form.price),
        stock: parseInt(form.stock || '0'),
        sku: form.sku || null,
        ncm: form.ncm || null,
        category: form.category,
        include_in_nfe: true,
        weight_grams: form.weight_grams ? parseInt(form.weight_grams) : null,
        length_cm: form.length_cm ? parseFloat(form.length_cm) : null,
        width_cm: form.width_cm ? parseFloat(form.width_cm) : null,
        height_cm: form.height_cm ? parseFloat(form.height_cm) : null,
      })
      .eq('id', editing.id);

    setSaving(false);

    if (error) {
      toast({ title: 'Erro ao aprovar', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Produto aprovado!', description: 'Já está visível na loja.' });
    setEditing(null);
    await loadDrafts();
    onChange?.();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este rascunho? Esta ação não pode ser desfeita.')) return;
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Rascunho excluído' });
    await loadDrafts();
    onChange?.();
  };

  return (
    <Card className="overflow-hidden border-0 shadow-sm">
      <PanelHeader
        icon={FileEdit}
        title="Rascunhos de Produtos"
        description="Produtos criados automaticamente por NF-e de entrada. Complete as informações e aprove para enviar à loja."
        kpis={[
          { label: 'Aguardando revisão', value: drafts.length, tone: drafts.length > 0 ? 'warning' : undefined },
        ]}
      />
      <CardContent className="p-4 md:p-6">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando rascunhos...</div>
        ) : drafts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground rounded-xl border border-dashed bg-muted/30">
            <Package className="w-14 h-14 mb-3 opacity-40" />
            <p className="text-sm font-medium">Nenhum rascunho pendente</p>
            <p className="text-xs mt-1">Produtos criados via importação de NF-e aparecerão aqui</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {drafts.map((d) => (
              <Card key={d.id} className="border-l-4 border-l-amber-500 transition-all hover:shadow-md">
                <div className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm leading-tight line-clamp-2 flex-1">{d.name}</p>
                    <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 shrink-0">
                      Rascunho
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Preço sugerido</p>
                      <p className="font-bold text-primary">R$ {Number(d.price).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Estoque</p>
                      <p className="font-bold">{d.stock}</p>
                    </div>
                  </div>

                  <div className="space-y-1 pt-1 border-t">
                    {d.sku && (
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
                        <Hash className="w-3 h-3" />
                        <span className="truncate">SKU: {d.sku}</span>
                      </div>
                    )}
                    {d.ncm && (
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
                        <Hash className="w-3 h-3" />
                        <span>NCM: {d.ncm}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button size="sm" className="flex-1 gap-1" onClick={() => openEditor(d)}>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Revisar e Aprovar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleDelete(d.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Revisar e aprovar produto</DialogTitle>
            <DialogDescription>
              Confirme/complete as informações. Ao aprovar, o produto sai do rascunho e fica visível na loja.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome do produto</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Preço de venda (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Estoque</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Categoria final *</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>NCM</Label>
                <Input value={form.ncm} onChange={(e) => setForm({ ...form, ncm: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>SKU / Código de barras</Label>
              <Input
                type="text"
                autoComplete="off"
                maxLength={50}
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
              />
            </div>

            {/* Peso e dimensões para frete (preenchido automaticamente se vier na NF-e) */}
            <div className="space-y-3 p-3 border-2 border-blue-500/20 rounded-lg bg-blue-500/5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide">📦 Peso e Dimensões (Frete)</p>
                <p className="text-[11px] text-muted-foreground">
                  {(editing?.weight_grams || editing?.length_cm)
                    ? 'Detectado automaticamente na NF-e — confira e ajuste se precisar.'
                    : 'NF-e não trouxe esses dados. Preencha para o cálculo de frete ficar correto.'}
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Peso (g)</Label>
                  <Input type="number" min="0" step="1" placeholder="500"
                    value={form.weight_grams}
                    onChange={(e) => setForm({ ...form, weight_grams: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Compr. (cm)</Label>
                  <Input type="number" min="0" step="0.1" placeholder="30"
                    value={form.length_cm}
                    onChange={(e) => setForm({ ...form, length_cm: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Largura (cm)</Label>
                  <Input type="number" min="0" step="0.1" placeholder="20"
                    value={form.width_cm}
                    onChange={(e) => setForm({ ...form, width_cm: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Altura (cm)</Label>
                  <Input type="number" min="0" step="0.1" placeholder="20"
                    value={form.height_cm}
                    onChange={(e) => setForm({ ...form, height_cm: e.target.value })} />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Resumo (listagem)</Label>
              <Textarea
                rows={2}
                value={form.short_description}
                onChange={(e) => setForm({ ...form, short_description: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Descrição completa</Label>
              <Textarea
                rows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleApprove} disabled={saving} className="gap-1">
              <CheckCircle2 className="w-4 h-4" />
              {saving ? 'Aprovando...' : 'Aprovar e enviar à loja'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
