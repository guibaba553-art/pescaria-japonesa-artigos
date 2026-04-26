import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Truck, Package, MapPin, CheckCircle2, RefreshCw, Copy, ExternalLink } from 'lucide-react';

interface OrderTrackingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  trackingCode: string;
}

interface TrackingEvent {
  date?: string;
  status?: string;
  location?: string;
  description?: string;
}

export function OrderTrackingDialog({ open, onOpenChange, orderId, trackingCode }: OrderTrackingDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchTracking = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('melhor-envio-tracking', {
        body: { orderId },
      });

      if (fnError) throw fnError;

      if (!data?.success) {
        setError(data?.error || 'Não foi possível obter o rastreio agora.');
        setEvents([]);
        return;
      }

      // Tentar normalizar diferentes formatos de resposta
      const tracking = data.tracking;
      const trackInfo = tracking?.[trackingCode] || tracking?.[Object.keys(tracking || {})[0]] || tracking;

      const rawEvents: any[] =
        trackInfo?.tracking?.events ||
        trackInfo?.events ||
        trackInfo?.history ||
        [];

      const parsed: TrackingEvent[] = rawEvents.map((ev) => ({
        date: ev.date || ev.created_at || ev.datetime || ev.event_date,
        status: ev.status || ev.event_name || ev.title,
        location: ev.location || ev.city || ev.local,
        description: ev.description || ev.message || ev.event_description || ev.details,
      }));

      setEvents(parsed);
      setCurrentStatus(trackInfo?.status || trackInfo?.tracking?.status || null);
    } catch (e: any) {
      console.error('Erro ao buscar rastreio:', e);
      setError(e?.message || 'Erro ao consultar rastreio.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && orderId) {
      fetchTracking();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId]);

  const formatDate = (d?: string) => {
    if (!d) return '';
    try {
      return new Date(d).toLocaleString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return d;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" />
            Rastreio do Pedido
          </DialogTitle>
          <DialogDescription>
            Acompanhe a entrega em tempo real, sem sair do site.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tracking code header */}
          <div className="p-3 rounded-lg bg-muted/50 border space-y-2">
            <p className="text-xs text-muted-foreground">Código de rastreio</p>
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-sm font-mono font-semibold text-primary bg-background px-2 py-1 rounded border">
                {trackingCode}
              </code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(trackingCode);
                  toast({ title: 'Código copiado!' });
                }}
              >
                <Copy className="w-3 h-3 mr-1" /> Copiar
              </Button>
              <Button size="sm" variant="ghost" onClick={fetchTracking} disabled={loading}>
                <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </div>
            {currentStatus && (
              <Badge variant="secondary" className="text-xs">
                Status atual: {currentStatus}
              </Badge>
            )}
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Consultando transportadora...</p>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="p-4 rounded-lg bg-destructive/5 border border-destructive/20 space-y-3">
              <p className="text-sm text-destructive font-medium">{error}</p>
              <p className="text-xs text-muted-foreground">
                Você ainda pode consultar o rastreio diretamente no site da transportadora.
              </p>
              <Button size="sm" variant="outline" asChild>
                <a
                  href={`https://www.melhorrastreio.com.br/rastreio/${trackingCode}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="w-3 h-3 mr-1" /> Abrir Melhor Rastreio
                </a>
              </Button>
            </div>
          )}

          {/* Empty */}
          {!loading && !error && events.length === 0 && (
            <div className="text-center py-10 space-y-2">
              <Package className="w-10 h-10 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Ainda não há eventos registrados. Volte mais tarde.
              </p>
            </div>
          )}

          {/* Timeline of events */}
          {!loading && events.length > 0 && (
            <div className="relative pl-6">
              <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-border" />
              {events.map((ev, idx) => {
                const isFirst = idx === 0;
                return (
                  <div key={idx} className="relative pb-5 last:pb-0">
                    <div
                      className={`absolute -left-[18px] top-1 w-4 h-4 rounded-full border-2 ${
                        isFirst
                          ? 'bg-primary border-primary ring-4 ring-primary/20'
                          : 'bg-background border-muted-foreground/40'
                      }`}
                    >
                      {isFirst && (
                        <CheckCircle2 className="w-3 h-3 text-primary-foreground absolute inset-0 m-auto" />
                      )}
                    </div>
                    <div className="space-y-1">
                      {ev.status && (
                        <p className={`text-sm font-semibold ${isFirst ? 'text-primary' : 'text-foreground'}`}>
                          {ev.status}
                        </p>
                      )}
                      {ev.description && (
                        <p className="text-sm text-foreground/80">{ev.description}</p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        {ev.date && <span>{formatDate(ev.date)}</span>}
                        {ev.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {ev.location}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
