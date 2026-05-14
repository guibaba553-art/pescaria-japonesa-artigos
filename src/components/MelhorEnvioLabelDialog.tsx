import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Truck, ExternalLink, Copy, MapPin, Info } from 'lucide-react';
import { packItems } from '@/utils/packShipment';

// Endereço de origem (loja) — onde despachar / onde a transportadora coleta
const STORE_ADDRESS = 'Av. das Itaúbas, 2281 — Jardim Paraíso, Sinop/MT — CEP 78556-100';

interface DispatchInfo {
  mode: 'dropoff' | 'pickup';
  label: string;
  description: string;
  findUrl?: string;
}

function getDispatchInfo(company: string | null): DispatchInfo {
  const c = (company || '').toLowerCase();
  if (c.includes('correio')) {
    return {
      mode: 'dropoff',
      label: 'Levar até uma agência dos Correios',
      description: 'Os Correios não fazem coleta no balcão. Você precisa levar o pacote etiquetado a qualquer agência.',
      findUrl: 'https://www.correios.com.br/atendimento/encontre-uma-agencia',
    };
  }
  if (c.includes('jadlog')) {
    return {
      mode: 'dropoff',
      label: 'Levar até uma agência Jadlog (Pickup)',
      description: 'Despache em qualquer ponto Pickup/Jadlog. Coleta no endereço só com contrato direto.',
      findUrl: 'https://www.jadlog.com.br/jadlog/unidades',
    };
  }
  if (c.includes('loggi')) {
    return {
      mode: 'dropoff',
      label: 'Levar até uma agência Loggi',
      description: 'Despache em uma agência Loggi parceira ou em um ponto de coleta indicado no app.',
      findUrl: 'https://www.loggi.com/agencias/',
    };
  }
  if (c.includes('latam')) {
    return {
      mode: 'dropoff',
      label: 'Levar até um balcão Latam Cargo',
      description: 'Despache em um balcão Latam Cargo no aeroporto/terminal mais próximo.',
      findUrl: 'https://www.latamcargo.com/pt/atendimento',
    };
  }
  if (c.includes('azul')) {
    return {
      mode: 'dropoff',
      label: 'Levar até um balcão Azul Cargo',
      description: 'Despache em um balcão Azul Cargo Express.',
      findUrl: 'https://www.azulcargo.com.br/Atendimento',
    };
  }
  if (c.includes('j&t') || c.includes('jt express')) {
    return {
      mode: 'dropoff',
      label: 'Levar até um ponto J&T Express',
      description: 'Despache em um ponto J&T credenciado.',
      findUrl: 'https://www.jtexpress.com.br/pontosdeatendimento',
    };
  }
  return {
    mode: 'dropoff',
    label: 'Levar até a agência da transportadora',
    description: 'Pelo Melhor Envio o vendedor leva o pacote até a agência. Coleta no endereço requer contrato direto.',
  };
}

interface ShippingOption {
  codigo: string;
  nome: string;
  valor: number;
  prazoEntrega: number;
  company: string | null;
  servico: string | null;
}

interface OrderInfo {
  id: string;
  shipping_cep: string;
  total_amount: number;
  order_items: Array<{ quantity: number; product_id: string }>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderInfo | null;
  onSuccess?: () => void;
}

export function MelhorEnvioLabelDialog({ open, onOpenChange, order, onSuccess }: Props) {
  const { toast } = useToast();
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [options, setOptions] = useState<ShippingOption[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [result, setResult] = useState<{ trackingCode: string | null; labelUrl: string | null } | null>(null);

  useEffect(() => {
    if (open && order) {
      setResult(null);
      setSelected('');
      loadQuotes();
    }
  }, [open, order?.id]);

  const loadQuotes = async () => {
    if (!order) return;
    setLoadingQuotes(true);
    setOptions([]);
    try {
      // Buscar dimensões/peso reais dos produtos
      const productIds = [...new Set(order.order_items.map((it) => it.product_id))];
      const { data: products } = await supabase
        .from('products')
        .select('id, weight_grams, length_cm, width_cm, height_cm')
        .in('id', productIds);

      const dimsByProduct = new Map<string, {
        weight_grams: number | null;
        length_cm: number | null;
        width_cm: number | null;
        height_cm: number | null;
      }>();
      (products || []).forEach((p: any) => {
        dimsByProduct.set(p.id, {
          weight_grams: p.weight_grams,
          length_cm: p.length_cm ? Number(p.length_cm) : null,
          width_cm: p.width_cm ? Number(p.width_cm) : null,
          height_cm: p.height_cm ? Number(p.height_cm) : null,
        });
      });

      // Consolida itens em embalagens reais da loja (caixas/envelope/tubo)
      const shipmentItems = order.order_items.map((it, idx) => {
        const d = dimsByProduct.get(it.product_id);
        return {
          id: `${it.product_id}-${idx}`,
          quantity: it.quantity,
          width_cm: d?.width_cm ?? null,
          height_cm: d?.height_cm ?? null,
          length_cm: d?.length_cm ?? null,
          weight_grams: d?.weight_grams ?? null,
        };
      });
      const productsPayload = packItems(shipmentItems, order.total_amount);

      const { data, error } = await supabase.functions.invoke('calculate-shipping', {
        body: {
          cepDestino: order.shipping_cep.replace(/\D/g, ''),
          products: productsPayload,
          insurance_value: order.total_amount,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Falha ao cotar');

      const filtered = (data.options || []).filter((o: ShippingOption) => o.codigo !== 'RETIRADA');
      setOptions(filtered);
    } catch (err: any) {
      toast({
        title: 'Erro ao cotar frete',
        description: err.message || 'Não foi possível obter as opções',
        variant: 'destructive',
      });
    } finally {
      setLoadingQuotes(false);
    }
  };

  const handleGenerate = async () => {
    if (!order || !selected) return;
    const meServiceId = Number(selected);
    if (!Number.isFinite(meServiceId)) return;

    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('melhor-envio-label', {
        body: {
          action: 'full_flow',
          orderId: order.id,
          meServiceId,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setResult({
        trackingCode: data.trackingCode || null,
        labelUrl: data.labelUrl || null,
      });

      toast({
        title: 'Etiqueta gerada com sucesso! 🎉',
        description: data.trackingCode
          ? `Rastreio: ${data.trackingCode}`
          : 'Etiqueta comprada — abra o PDF para imprimir.',
      });

      onSuccess?.();
    } catch (err: any) {
      toast({
        title: 'Erro ao gerar etiqueta',
        description: err.message || 'Verifique seu saldo no Melhor Envio',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  const copyTracking = () => {
    if (!result?.trackingCode) return;
    navigator.clipboard.writeText(result.trackingCode);
    toast({ title: 'Código copiado!' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Gerar Etiqueta — Melhor Envio
          </DialogTitle>
          <DialogDescription>
            {result
              ? 'Etiqueta comprada com sucesso. Imprima o PDF e cole no pacote.'
              : 'Escolha a transportadora. O valor será debitado do seu saldo no Melhor Envio.'}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-emerald-500/10 p-4 space-y-3">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold">
                ✅ Etiqueta gerada
              </div>
              {result.trackingCode && (
                <div className="flex items-center justify-between gap-2 bg-background rounded-md p-2 border">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Código de rastreio</p>
                    <p className="font-mono font-semibold truncate">{result.trackingCode}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={copyTracking}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {result.labelUrl && (
                <Button asChild className="w-full" size="lg">
                  <a href={result.labelUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Imprimir Etiqueta (PDF)
                  </a>
                </Button>
              )}
            </div>

            {(() => {
              const opt = options.find((o) => o.codigo === selected);
              const dispatch = getDispatchInfo(opt?.company || null);
              return (
                <div className="rounded-lg border bg-amber-500/10 border-amber-500/30 p-4 space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300">
                    <MapPin className="h-4 w-4" />
                    {dispatch.label}
                  </div>
                  <p className="text-sm text-amber-900/80 dark:text-amber-200/80">
                    {dispatch.description}
                  </p>
                  <div className="flex items-start gap-2 pt-2 border-t border-amber-500/20 text-xs text-muted-foreground">
                    <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      <strong className="text-foreground">Origem (loja):</strong> {STORE_ADDRESS}
                    </span>
                  </div>
                  {dispatch.findUrl && (
                    <Button asChild variant="outline" size="sm" className="w-full mt-2">
                      <a href={dispatch.findUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        Encontrar agência mais próxima
                      </a>
                    </Button>
                  )}
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {loadingQuotes ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-sm">Cotando frete...</p>
              </div>
            ) : options.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Nenhuma opção de frete disponível para este pedido.</p>
                <Button variant="outline" size="sm" onClick={loadQuotes} className="mt-3">
                  Tentar novamente
                </Button>
              </div>
            ) : (
              <RadioGroup value={selected} onValueChange={setSelected} className="space-y-2">
                {options.map((opt) => {
                  const dispatch = getDispatchInfo(opt.company);
                  return (
                    <Label
                      key={opt.codigo}
                      htmlFor={opt.codigo}
                      className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-all hover:border-primary ${
                        selected === opt.codigo ? 'border-primary bg-primary/5' : ''
                      }`}
                    >
                      <RadioGroupItem value={opt.codigo} id={opt.codigo} className="mt-1" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold truncate">{opt.nome}</p>
                          <p className="font-bold text-primary shrink-0">R$ {opt.valor.toFixed(2)}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Entrega em até {opt.prazoEntrega} dia{opt.prazoEntrega !== 1 ? 's' : ''} úteis
                        </p>
                        <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                          <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>{dispatch.label}</span>
                        </div>
                      </div>
                    </Label>
                  );
                })}
              </RadioGroup>
            )}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={() => onOpenChange(false)}>Fechar</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={generating}>
                Cancelar
              </Button>
              <Button onClick={handleGenerate} disabled={!selected || generating}>
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Comprando etiqueta...
                  </>
                ) : (
                  <>
                    <Truck className="h-4 w-4 mr-2" />
                    Comprar e Gerar Etiqueta
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
