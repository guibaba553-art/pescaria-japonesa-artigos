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
import { Loader2, Truck, ExternalLink, Copy } from 'lucide-react';

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
        .select('id')
        .in('id', productIds);

      // Usa dimensões padrão por item (ME exige > 11cm largura/comprimento)
      const productsPayload = order.order_items.map((it, idx) => ({
        id: String(idx + 1),
        width: 15,
        height: 5,
        length: 20,
        weight: 0.3,
        insurance_value: 0,
        quantity: it.quantity,
      }));

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
                {options.map((opt) => (
                  <Label
                    key={opt.codigo}
                    htmlFor={opt.codigo}
                    className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-all hover:border-primary ${
                      selected === opt.codigo ? 'border-primary bg-primary/5' : ''
                    }`}
                  >
                    <RadioGroupItem value={opt.codigo} id={opt.codigo} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{opt.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        Entrega em até {opt.prazoEntrega} dia{opt.prazoEntrega !== 1 ? 's' : ''} úteis
                      </p>
                    </div>
                    <p className="font-bold text-primary shrink-0">R$ {opt.valor.toFixed(2)}</p>
                  </Label>
                ))}
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
