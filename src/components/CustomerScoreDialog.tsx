import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Award, Plus, Minus, Loader2, History, X, PlusCircle } from 'lucide-react';
import { loadTiers, getTierForScore, type CustomerTier } from '@/utils/customerTiers';

interface ScoreEvent {
  id: string;
  points_delta: number;
  reason: string;
  source: string;
  order_id: string | null;
  created_at: string;
}
interface ReasonPreset {
  id: string;
  label: string;
  reason: string;
  sign: number;
  points: number;
  emoji: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customer: { id: string; full_name: string; company_name: string | null; score: number } | null;
  onChanged?: (newScore: number) => void;
  compact?: boolean;
}


export function CustomerScoreDialog({ open, onOpenChange, customer, onChanged, compact = false }: Props) {
  const [tiers, setTiers] = useState<CustomerTier[]>([]);
  const [events, setEvents] = useState<ScoreEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [delta, setDelta] = useState<number>(1);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [currentScore, setCurrentScore] = useState(0);
  const [presets, setPresets] = useState<ReasonPreset[]>([]);
  const [showNewPreset, setShowNewPreset] = useState(false);
  const [npLabel, setNpLabel] = useState('');
  const [npEmoji, setNpEmoji] = useState('');
  const [npSign, setNpSign] = useState<1 | -1>(1);
  const [npPoints, setNpPoints] = useState(1);
  const [savingPreset, setSavingPreset] = useState(false);

  useEffect(() => {
    if (!open || !customer) return;
    setCurrentScore(customer.score || 0);
    loadTiers().then(setTiers);
    loadEvents();
    loadPresets();
  }, [open, customer?.id]);

  const loadPresets = async () => {
    const { data } = await supabase
      .from('customer_score_reason_presets')
      .select('id, label, reason, sign, points, emoji')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    setPresets((data as ReasonPreset[]) || []);
  };

  const createPreset = async () => {
    if (!npLabel.trim()) {
      toast({ title: 'Informe o rótulo', variant: 'destructive' });
      return;
    }
    setSavingPreset(true);
    const { error } = await supabase.from('customer_score_reason_presets').insert({
      label: npLabel.trim(),
      reason: npLabel.trim(),
      emoji: npEmoji.trim() || null,
      sign: npSign,
      points: Math.max(1, npPoints),
      sort_order: (presets[presets.length - 1]?.['sort_order' as any] ?? presets.length * 10) + 10,
    });
    setSavingPreset(false);
    if (error) {
      toast({ title: 'Erro ao criar motivo', description: error.message, variant: 'destructive' });
      return;
    }
    setNpLabel(''); setNpEmoji(''); setNpSign(1); setNpPoints(1);
    setShowNewPreset(false);
    loadPresets();
    toast({ title: 'Motivo criado' });
  };

  const deletePreset = async (id: string) => {
    if (!confirm('Remover este motivo rápido?')) return;
    const { error } = await supabase.from('customer_score_reason_presets').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro ao remover', description: error.message, variant: 'destructive' });
      return;
    }
    loadPresets();
  };

  const loadEvents = async () => {
    if (!customer) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('customer_score_events')
      .select('id, points_delta, reason, source, order_id, created_at')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      toast({ title: 'Erro ao carregar histórico', description: error.message, variant: 'destructive' });
    } else {
      setEvents((data as ScoreEvent[]) || []);
    }
    setLoading(false);
  };

  const adjust = async (sign: 1 | -1) => {
    if (!customer) return;
    if (!reason.trim()) {
      toast({ title: 'Informe o motivo', variant: 'destructive' });
      return;
    }
    const amount = Math.abs(delta) * sign;
    if (!amount) return;
    setSaving(true);
    const { data, error } = await supabase.rpc('add_customer_score', {
      p_customer_id: customer.id,
      p_delta: amount,
      p_reason: reason.trim(),
      p_source: 'manual',
      p_order_id: null,
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao registrar pontos', description: error.message, variant: 'destructive' });
      return;
    }
    const newScore = (data as any)?.new_score ?? currentScore + amount;
    setCurrentScore(newScore);
    onChanged?.(newScore);
    setReason('');
    setDelta(1);
    toast({ title: `${amount > 0 ? '+' : ''}${amount} ponto(s)`, description: 'Pontuação atualizada' });
    loadEvents();
  };

  const tier = getTierForScore(tiers, currentScore);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="w-5 h-5" /> Pontuação do cliente
          </DialogTitle>
          <DialogDescription className="truncate">
            {customer?.company_name || customer?.full_name}
          </DialogDescription>
        </DialogHeader>

        {customer && (
          <div className="space-y-4">
            <div
              className="rounded-lg p-4 flex items-center justify-between gap-3 border-2"
              style={{ borderColor: tier?.color, background: `${tier?.color}10` }}
            >
              <div>
                <div className="text-xs text-muted-foreground">Faixa atual</div>
                <div className="text-2xl font-bold" style={{ color: tier?.color }}>
                  {tier?.name || '—'}
                </div>
                {tier?.perks && <div className="text-xs text-muted-foreground mt-1">{tier.perks}</div>}
                <div className="flex gap-2 mt-2 flex-wrap">
                  {tier?.block_purchase && (
                    <Badge variant="destructive" className="text-[10px]">Venda bloqueada</Badge>
                  )}
                  {!tier?.allow_discount && !tier?.block_purchase && (
                    <Badge variant="outline" className="text-[10px] border-orange-500/50 text-orange-600">
                      Sem descontos
                    </Badge>
                  )}
                  {tier && tier.discount_percent > 0 && (
                    <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600">
                      {tier.discount_percent}% off automático
                    </Badge>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Pontos</div>
                <div className="text-4xl font-bold tabular-nums" style={{ color: tier?.color }}>
                  {currentScore}
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-3 space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Ajuste manual</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  type="number"
                  min={1}
                  value={delta}
                  onChange={(e) => setDelta(Math.max(1, parseInt(e.target.value) || 1))}
                  className="sm:w-24"
                />
                <Input
                  placeholder="Motivo (ex.: brinde promocional)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="flex-1"
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => adjust(1)}
                    disabled={saving}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Plus className="w-4 h-4 mr-1" /> Adicionar
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => adjust(-1)}
                    disabled={saving}
                  >
                    <Minus className="w-4 h-4 mr-1" /> Descontar
                  </Button>
                </div>
              </div>

              <div className="pt-1">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Motivos rápidos
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNewPreset((v) => !v)}
                    className="text-[11px] flex items-center gap-1 text-primary hover:underline"
                  >
                    <PlusCircle className="w-3 h-3" />
                    {showNewPreset ? 'Cancelar' : 'Novo motivo'}
                  </button>
                </div>

                {showNewPreset && (
                  <div className="mb-2 p-2 rounded-md border bg-muted/30 flex flex-wrap items-end gap-2">
                    <Input
                      placeholder="😀"
                      value={npEmoji}
                      onChange={(e) => setNpEmoji(e.target.value)}
                      className="w-16 text-center"
                      maxLength={4}
                    />
                    <Input
                      placeholder="Rótulo do motivo"
                      value={npLabel}
                      onChange={(e) => setNpLabel(e.target.value)}
                      className="flex-1 min-w-[180px]"
                    />
                    <div className="flex rounded-md overflow-hidden border">
                      <button
                        type="button"
                        onClick={() => setNpSign(1)}
                        className={`px-2 py-1 text-xs ${npSign === 1 ? 'bg-emerald-600 text-white' : 'bg-background'}`}
                      >+</button>
                      <button
                        type="button"
                        onClick={() => setNpSign(-1)}
                        className={`px-2 py-1 text-xs ${npSign === -1 ? 'bg-destructive text-destructive-foreground' : 'bg-background'}`}
                      >−</button>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      value={npPoints}
                      onChange={(e) => setNpPoints(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-20"
                    />
                    <Button type="button" size="sm" onClick={createPreset} disabled={savingPreset}>
                      Salvar motivo
                    </Button>
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {presets.map((p) => (
                    <div key={p.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => {
                          setReason(p.reason);
                          setDelta(p.points);
                        }}
                        className={`text-[11px] px-2 py-1 rounded-md border transition-colors pr-5 ${
                          p.sign > 0
                            ? 'border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400'
                            : 'border-destructive/40 text-destructive hover:bg-destructive/10'
                        }`}
                        title={`${p.sign > 0 ? '+' : '-'}${p.points} sugerido`}
                      >
                        {p.emoji ? `${p.emoji} ` : ''}{p.label}
                        <span className="ml-1 opacity-60 tabular-nums">
                          ({p.sign > 0 ? '+' : '-'}{p.points})
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePreset(p.id)}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-background border opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground"
                        title="Remover motivo"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                  {presets.length === 0 && (
                    <div className="text-xs text-muted-foreground">Nenhum motivo cadastrado.</div>
                  )}
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                <History className="w-4 h-4" /> Histórico ({events.length})
              </div>
              {loading ? (
                <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando...
                </div>
              ) : events.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-6 border rounded-md">
                  Nenhum evento de pontuação ainda.
                </div>
              ) : (
                <div className="border rounded-md divide-y max-h-80 overflow-auto">
                  {events.map((e) => (
                    <div key={e.id} className="flex items-start gap-3 p-2 text-sm">
                      <div
                        className={`shrink-0 font-bold tabular-nums w-12 text-right ${
                          e.points_delta > 0 ? 'text-emerald-600' : 'text-destructive'
                        }`}
                      >
                        {e.points_delta > 0 ? `+${e.points_delta}` : e.points_delta}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{e.reason}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {new Date(e.created_at).toLocaleString('pt-BR')} · {e.source}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
