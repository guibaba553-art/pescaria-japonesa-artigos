import { CheckCircle2, CreditCard, Package, Truck, Home, Store, XCircle, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type OrderStatus =
  | 'aguardando_pagamento'
  | 'em_preparo'
  | 'enviado'
  | 'entregue'
  | 'entregado'
  | 'retirado'
  | 'pronto_retirada'
  | 'cancelado'
  | 'reembolsado';

interface OrderTrackingTimelineProps {
  status: OrderStatus;
  deliveryType?: 'delivery' | 'pickup';
  cancellationReason?: string;
  isExpired?: boolean;
  refundAmount?: number;
  refundDate?: string;
  refundReason?: string;
  onViewReceipt?: () => void;
  onDownloadPdf?: () => void;
}

interface Step {
  key: string;
  label: string;
  icon: typeof Package;
}

const deliverySteps: Step[] = [
  { key: 'pago', label: 'Pagamento', icon: CreditCard },
  { key: 'preparo', label: 'Em preparo', icon: Package },
  { key: 'enviado', label: 'Enviado', icon: Truck },
  { key: 'entregue', label: 'Entregue', icon: Home },
];

const pickupSteps: Step[] = [
  { key: 'pago', label: 'Pagamento', icon: CreditCard },
  { key: 'preparo', label: 'Em preparo', icon: Package },
  { key: 'pronto', label: 'Pronto para retirada', icon: Store },
  { key: 'retirado', label: 'Retirado', icon: CheckCircle2 },
];

function getCurrentIndex(status: OrderStatus, isPickup: boolean): number {
  if (status === 'aguardando_pagamento') return 0;
  if (status === 'em_preparo') return isPickup ? 1 : 1;
  if (status === 'pronto_retirada') return 2;
  if (status === 'enviado') return 2;
  if (status === 'entregue' || status === 'entregado') return 3;
  if (status === 'retirado') return 3;
  return -1;
}

export function OrderTrackingTimeline({ status, deliveryType, cancellationReason, isExpired, refundAmount, refundDate, refundReason, onViewReceipt, onDownloadPdf }: OrderTrackingTimelineProps) {
  const isPickup = deliveryType === 'pickup';
  const steps = isPickup ? pickupSteps : deliverySteps;
  const currentIdx = getCurrentIndex(status, isPickup);
  const isRefunded = status === 'reembolsado';

  if (isRefunded) {
    return (
      <div className="flex flex-col gap-3 p-4 rounded-xl border bg-emerald-500/5 border-emerald-500/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <Undo2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="font-semibold text-emerald-700 dark:text-emerald-400">
              Pedido Reembolsado
            </p>
            {refundAmount !== undefined && (
              <p className="text-sm text-muted-foreground">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(refundAmount)} estornado{refundDate ? ` em ${new Date(refundDate).toLocaleDateString('pt-BR')}` : ''}
              </p>
            )}
            {refundReason && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-1" title={refundReason}>
                Motivo: {refundReason}
              </p>
            )}
          </div>
        </div>
        {(onViewReceipt || onDownloadPdf) && (
          <div className="flex items-center gap-2">
            {onViewReceipt && (
              <Button size="sm" variant="outline" onClick={onViewReceipt}>
                Ver comprovante
              </Button>
            )}
            {onDownloadPdf && (
              <Button size="sm" variant="outline" onClick={onDownloadPdf}>
                Baixar PDF
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  const isCancelled = status === 'cancelado' || isExpired;

  if (isCancelled) {
    let title: string;
    let description: string;
    const isExpiredCase = isExpired || cancellationReason === 'prazo_expirado';

    if (isExpiredCase) {
      title = 'Prazo de pagamento expirado';
      description = 'O prazo para pagamento deste pedido expirou.';
    } else if (cancellationReason && cancellationReason !== 'cancelado_admin') {
      title = 'Pedido cancelado';
      description = cancellationReason;
    } else {
      title = 'Pedido cancelado';
      description = 'Este pedido foi cancelado.';
    }

    return (
      <div
        className={cn(
          'flex items-center gap-3 p-4 rounded-xl border',
          isExpiredCase
            ? 'bg-muted border-muted-foreground/20'
            : 'bg-destructive/5 border-destructive/20'
        )}
      >
        <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
          <XCircle className="w-5 h-5 text-destructive" />
        </div>
        <div>
          <p className="font-semibold text-destructive">
            {title}
          </p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full py-2">
      <div className="flex items-center justify-between relative">
        {/* Background line */}
        <div className="absolute top-5 left-5 right-5 h-1 bg-muted rounded-full -z-0" />
        {/* Progress line */}
        <div
          className="absolute top-5 left-5 h-1 bg-primary rounded-full transition-all duration-500 -z-0"
          style={{
            width:
              currentIdx <= 0
                ? '0%'
                : currentIdx >= steps.length - 1
                ? 'calc(100% - 2.5rem)'
                : `calc(${(currentIdx / (steps.length - 1)) * 100}% - ${currentIdx * 0.5}rem)`,
          }}
        />

        {steps.map((step, idx) => {
          const isDone = idx < currentIdx;
          const isActive = idx === currentIdx;
          const Icon = step.icon;
          const label =
            idx === 0 && status === 'aguardando_pagamento'
              ? 'Aguardando Pagamento'
              : step.label;
          return (
            <div
              key={step.key}
              className="flex flex-col items-center gap-2 relative z-10 flex-1"
            >
              <div
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 border-2',
                  isDone && 'bg-primary border-primary text-primary-foreground',
                  isActive &&
                    'bg-primary border-primary text-primary-foreground ring-4 ring-primary/20 scale-110',
                  !isDone && !isActive && 'bg-background border-muted text-muted-foreground'
                )}
              >
                {isDone ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-4 h-4" />}
              </div>
              <span
                className={cn(
                  'text-[10px] sm:text-xs font-medium text-center leading-tight',
                  isActive && 'text-primary font-semibold',
                  isDone && !isActive && 'text-foreground',
                  !isDone && !isActive && 'text-muted-foreground'
                )}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
