import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  Loader2,
  Package,
  CheckCircle2,
  Circle,
  Scan,
  User,
  Phone,
  Calendar,
  Receipt,
  Truck,
  AlertTriangle,
  Printer,
} from 'lucide-react';
import { MelhorEnvioLabelDialog } from '@/components/MelhorEnvioLabelDialog';

export interface TriagemOrderItem {
  id: string;
  quantity: number;
  price_at_purchase: number;
  product_id: string;
  variation_id?: string | null;
  products: {
    name: string;
    image_url: string | null;
    sku: string | null;
  } | null;
  product_variations?: {
    name: string;
    sku: string | null;
  } | null;
}

export interface TriagemOrder {
  id: string;
  total_amount: number;
  shipping_cost: number;
  shipping_address: string;
  shipping_cep: string;
  status: string;
  delivery_type: string;
  source: string;
  created_at: string;
  user_id: string;
  tracking_code?: string | null;
  order_items: TriagemOrderItem[];
  profile?: { full_name: string | null; phone: string | null; cpf: string | null } | null;
  nfe?: { id: string; nfe_number: string | null; danfe_url: string | null; status: string } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: TriagemOrder | null;
  mode: 'pickup' | 'pack';
  onCompleted: () => void;
}

interface ScanRow {
  itemId: string;
  scanned: number; // number of units scanned for this item
}

export function TriagemScanDialog({ open, onOpenChange, order, mode, onCompleted }: Props) {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [scans, setScans] = useState<Record<string, number>>({});
  const [barcode, setBarcode] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [emittingNfe, setEmittingNfe] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setScans({});
      setBarcode('');
      // Auto-focus the scanner input after a tick
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, order?.id]);

  // Build a SKU map for fast lookup
  const skuMap = useMemo(() => {
    const map = new Map<string, TriagemOrderItem>();
    if (!order) return map;
    for (const item of order.order_items) {
      const sku = item.product_variations?.sku || item.products?.sku;
      if (sku) map.set(sku.trim().toUpperCase(), item);
    }
    return map;
  }, [order]);

  const allScanned = useMemo(() => {
    if (!order) return false;
    return order.order_items.every((it) => (scans[it.id] || 0) >= it.quantity);
  }, [order, scans]);

  const totalUnits = useMemo(
    () => (order?.order_items.reduce((s, it) => s + it.quantity, 0) || 0),
    [order],
  );
  const scannedUnits = useMemo(
    () => Object.values(scans).reduce((s, n) => s + n, 0),
    [scans],
  );

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = barcode.trim();
    if (!code) return;

    const item = skuMap.get(code.toUpperCase());
    if (!item) {
      toast({
        title: '❌ Código não encontrado',
        description: `O código "${code}" não pertence a nenhum item deste pedido.`,
        variant: 'destructive',
      });
      setBarcode('');
      inputRef.current?.focus();
      return;
    }

    const current = scans[item.id] || 0;
    if (current >= item.quantity) {
      toast({
        title: '⚠️ Item já completo',
        description: `${item.products?.name} já foi totalmente escaneado.`,
      });
      setBarcode('');
      inputRef.current?.focus();
      return;
    }

    setScans((prev) => ({ ...prev, [item.id]: current + 1 }));
    setBarcode('');
    inputRef.current?.focus();
  };

  const markItemFull = (itemId: string, qty: number) => {
    setScans((prev) => ({ ...prev, [itemId]: qty }));
  };
  const resetItem = (itemId: string) => {
    setScans((prev) => ({ ...prev, [itemId]: 0 }));
  };

  const handleConfirm = async () => {
    if (!order || !allScanned) return;
    setConfirming(true);
    try {
      const newStatus = mode === 'pickup' ? 'retirado' : 'aguardando_envio';
      const { data, error } = await supabase
        .from('orders')
        .update({ status: newStatus as any })
        .eq('id', order.id)
        .select('id, status');

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Sem permissão para atualizar o pedido.');
      }

      toast({
        title: mode === 'pickup' ? '✅ Retirada confirmada' : '✅ Pedido embalado',
        description:
          mode === 'pickup'
            ? `Pedido #${order.id.slice(0, 8)} marcado como retirado.`
            : `Pedido #${order.id.slice(0, 8)} aguardando coleta da transportadora.`,
      });
      onCompleted();
      onOpenChange(false);
    } catch (err: any) {
      console.error('[TriagemScanDialog] confirm error:', err);
      toast({
        title: 'Erro ao confirmar',
        description: err?.message || 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setConfirming(false);
    }
  };

  const emitNfe = async () => {
    if (!order) return;
    setEmittingNfe(true);
    try {
      const { data, error } = await supabase.functions.invoke('emit-nfe', {
        body: { orderId: order.id },
      });
      if (error) throw error;
      toast({
        title: '✅ NF-e enviada',
        description: 'A nota está sendo processada. Acompanhe na aba de pedidos.',
      });
      onCompleted();
    } catch (err: any) {
      console.error(err);
      toast({
        title: 'Erro ao emitir NF-e',
        description: err?.message || 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setEmittingNfe(false);
    }
  };

  const fmt = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  if (!order) return null;

  const hasNfeAuth = order.nfe?.status === 'autorizada' || order.nfe?.status === 'authorized';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {mode === 'pickup' ? (
                <Package className="w-5 h-5 text-emerald-600" />
              ) : (
                <Truck className="w-5 h-5 text-blue-600" />
              )}
              {mode === 'pickup' ? 'Triagem de Retirada' : 'Triagem de Envio (Embalagem)'}
            </DialogTitle>
            <DialogDescription>
              Pedido <span className="font-mono font-bold">#{order.id.slice(0, 8)}</span> · escaneie cada item para confirmar.
            </DialogDescription>
          </DialogHeader>

          {/* Cliente */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-sm">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="font-semibold">{order.profile?.full_name || 'Sem nome'}</span>
              {order.profile?.cpf && (
                <span className="text-xs text-muted-foreground">CPF: {order.profile.cpf}</span>
              )}
            </div>
            {order.profile?.phone && (
              <div className="flex items-center gap-2 text-xs">
                <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                <a href={`tel:${order.profile.phone}`} className="text-primary hover:underline">
                  {order.profile.phone}
                </a>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(order.created_at).toLocaleString('pt-BR')}
            </div>
            {mode === 'pack' && (
              <div className="text-xs text-muted-foreground pt-1 border-t mt-1">
                <strong>Endereço:</strong> {order.shipping_address} · CEP {order.shipping_cep}
              </div>
            )}
          </div>

          {/* Scanner input */}
          <form onSubmit={handleScanSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Scan className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Escaneie o código de barras / SKU..."
                className="pl-9 font-mono"
                autoComplete="off"
                inputMode="text"
              />
            </div>
            <Button type="submit" variant="secondary">
              Marcar
            </Button>
          </form>

          {/* Progresso */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Progresso: <strong>{scannedUnits}</strong> de <strong>{totalUnits}</strong> unidades
            </span>
            {allScanned ? (
              <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Tudo lido
              </Badge>
            ) : (
              <Badge variant="outline">
                {totalUnits - scannedUnits} restante(s)
              </Badge>
            )}
          </div>

          {/* Itens */}
          <div className="space-y-2">
            {order.order_items.map((item) => {
              const scanned = scans[item.id] || 0;
              const isDone = scanned >= item.quantity;
              const sku = item.product_variations?.sku || item.products?.sku;
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 p-3 border-2 rounded-lg transition-colors ${
                    isDone
                      ? 'border-emerald-500/50 bg-emerald-500/5'
                      : 'border-border bg-card'
                  }`}
                >
                  {item.products?.image_url ? (
                    <img
                      src={item.products.image_url}
                      alt={item.products.name}
                      className="w-14 h-14 rounded object-cover"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded bg-muted flex items-center justify-center">
                      <Package className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {item.products?.name || 'Produto'}
                      {item.product_variations?.name && (
                        <span className="text-muted-foreground font-normal">
                          {' '}· {item.product_variations.name}
                        </span>
                      )}
                    </p>
                    {sku ? (
                      <p className="text-xs text-muted-foreground font-mono">SKU: {sku}</p>
                    ) : (
                      <p className="text-xs text-amber-600 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Sem SKU cadastrado
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Lidos</div>
                      <div
                        className={`text-lg font-bold ${
                          isDone ? 'text-emerald-600' : 'text-foreground'
                        }`}
                      >
                        {scanned}/{item.quantity}
                      </div>
                    </div>
                    {isDone ? (
                      isAdmin ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => resetItem(item.id)}
                          className="text-muted-foreground hover:text-foreground"
                          title="Resetar (admin)"
                        >
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        </Button>
                      ) : (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      )
                    ) : isAdmin ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => markItemFull(item.id, item.quantity)}
                        title="Marcar manualmente como completo (admin)"
                      >
                        <Circle className="w-4 h-4" />
                      </Button>
                    ) : (
                      <Circle className="w-5 h-5 text-muted-foreground/40" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Modo embalar: ações de impressão */}
          {mode === 'pack' && (
            <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700/40 p-3 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-2">
                <Printer className="w-4 h-4" /> Documentos para imprimir
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {hasNfeAuth && order.nfe?.danfe_url ? (
                  <Button
                    asChild
                    variant="outline"
                    className="bg-background"
                  >
                    <a href={order.nfe.danfe_url} target="_blank" rel="noopener noreferrer">
                      <Receipt className="w-4 h-4 mr-2" /> Imprimir DANFE
                      {order.nfe.nfe_number && ` (Nº ${order.nfe.nfe_number})`}
                    </a>
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="bg-background"
                    onClick={emitNfe}
                    disabled={emittingNfe}
                  >
                    {emittingNfe ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Receipt className="w-4 h-4 mr-2" />
                    )}
                    Emitir NF-e
                  </Button>
                )}

                <Button
                  variant="outline"
                  className="bg-background"
                  onClick={() => setLabelDialogOpen(true)}
                >
                  <Truck className="w-4 h-4 mr-2" />
                  {order.tracking_code ? 'Reimprimir etiqueta' : 'Gerar etiqueta Melhor Envio'}
                </Button>
              </div>
              {order.tracking_code && (
                <p className="text-xs text-muted-foreground">
                  Rastreamento: <span className="font-mono">{order.tracking_code}</span>
                </p>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <div className="flex-1 text-xs text-muted-foreground self-center">
              Total do pedido: <strong>{fmt(order.total_amount)}</strong>
            </div>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!allScanned || confirming}
              className={
                mode === 'pickup'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }
            >
              {confirming ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              {mode === 'pickup'
                ? 'Confirmar retirada'
                : 'Marcar como aguardando envio'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MelhorEnvioLabelDialog
        open={labelDialogOpen}
        onOpenChange={setLabelDialogOpen}
        order={
          order
            ? {
                id: order.id,
                shipping_cep: order.shipping_cep,
                total_amount: order.total_amount,
                order_items: order.order_items.map((it) => ({
                  quantity: it.quantity,
                  product_id: it.product_id,
                })),
              }
            : null
        }
        onSuccess={() => onCompleted()}
      />
    </>
  );
}
