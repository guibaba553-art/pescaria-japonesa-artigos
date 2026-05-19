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
}

export function CustomerScoreDialog({ open, onOpenChange, customer, onChanged }: Props) {
  const [tiers, setTiers] = useState<CustomerTier[]>([]);
  const [events, setEvents] = useState<ScoreEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [delta, setDelta] = useState<number>(1);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [currentScore, setCurrentScore] = useState(0);

  useEffect(() => {
    if (!open || !customer) return;
    setCurrentScore(customer.score || 0);
    loadTiers().then(setTiers);
    loadEvents();
  }, [open, customer?.id]);

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
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  Motivos rápidos
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: '🏬➡️🌐 Veio à loja e comprou no site (na loja)', value: 'Veio à loja, foi atendido e comprou no site dentro da loja (custo de atendimento + desconto do site)', sign: -1, pts: 2 },
                    { label: '⭐ Cliente fiel / recorrente', value: 'Cliente fiel / compra recorrente', sign: 1, pts: 1 },
                    { label: '🎁 Brinde / cortesia', value: 'Brinde / cortesia promocional', sign: 1, pts: 1 },
                    { label: '🤝 Indicou novo cliente', value: 'Indicou novo cliente', sign: 1, pts: 2 },
                    { label: '💬 Elogio / avaliação positiva', value: 'Elogio público / avaliação positiva', sign: 1, pts: 1 },
                    { label: '😡 Cliente mal educado', value: 'Cliente mal educado / desrespeitoso', sign: -1, pts: 2 },
                    { label: '🙄 Cliente chato / problemático', value: 'Cliente chato / problemático', sign: -1, pts: 1 },
                    { label: '📵 Não retira pedido / sumiu', value: 'Não retirou o pedido / não respondeu', sign: -1, pts: 2 },
                    { label: '↩️ Devolução sem ser defeito', value: 'Devolução sem ser por defeito do produto', sign: -1, pts: 1 },
                    { label: '⚠️ Reclamação indevida', value: 'Reclamação indevida / má-fé', sign: -1, pts: 3 },
                    { label: '💸 Calote / não pagou', value: 'Calote / cheque devolvido / não pagou', sign: -1, pts: 5 },
                  ].map((r) => (
                    <button
                      key={r.label}
                      type="button"
                      onClick={() => {
                        setReason(r.value);
                        setDelta(r.pts);
                      }}
                      className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                        r.sign > 0
                          ? 'border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400'
                          : 'border-destructive/40 text-destructive hover:bg-destructive/10'
                      }`}
                      title={`${r.sign > 0 ? '+' : '-'}${r.pts} sugerido`}
                    >
                      {r.label}
                      <span className="ml-1 opacity-60 tabular-nums">
                        ({r.sign > 0 ? '+' : '-'}{r.pts})
                      </span>
                    </button>
                  ))}
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
