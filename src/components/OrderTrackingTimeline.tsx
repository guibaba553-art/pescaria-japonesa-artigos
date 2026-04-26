import { CheckCircle2, CreditCard, Package, Truck, Home, Store, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type OrderStatus =
  | 'aguardando_pagamento'
  | 'em_preparo'
  | 'enviado'
  | 'entregue'
  | 'entregado'
  | 'retirado'
  | 'cancelado';

interface OrderTrackingTimelineProps {
  status: OrderStatus;
  deliveryType?: 'delivery' | 'pickup';
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
  { key: 'pronto', label: 'Pronto', icon: Store },
  { key: 'retirado', label: 'Retirado', icon: CheckCircle2 },
];

function getCurrentIndex(status: OrderStatus, isPickup: boolean): number {
  if (status === 'aguardando_pagamento') return 0;
  if (status === 'em_preparo') return isPickup ? 2 : 1;
  if (status === 'enviado') return 2;
  if (status === 'entregue' || status === 'entregado') return 3;
  if (status === 'retirado') return 3;
  return -1;
}

export function OrderTrackingTimeline({ status, deliveryType }: OrderTrackingTimelineProps) {
  const isPickup = deliveryType === 'pickup';
  const steps = isPickup ? pickupSteps : deliverySteps;
  const currentIdx = getCurrentIndex(status, isPickup);
  const isCancelled = status === 'cancelado';

  if (isCancelled) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/5 border border-destructive/20">
        <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
          <XCircle className="w-5 h-5 text-destructive" />
        </div>
        <div>
          <p className="font-semibold text-destructive">Pedido cancelado</p>
          <p className="text-xs text-muted-foreground">Este pedido foi cancelado.</p>
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
                  (isDone || isActive) ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
