import { MapPin, Store, Truck } from 'lucide-react';
import { PARTNER_CITIES } from '@/lib/partnerDelivery';

interface DeliveryCoverageNoticeProps {
  city: string;
  state?: string;
  /** Mostra a dica de retirada na loja (checkout) */
  showPickupHint?: boolean;
}

/**
 * Aviso amigável exibido quando o CEP informado está fora das cidades
 * atendidas pela transportadora parceira.
 */
export function DeliveryCoverageNotice({ city, state, showPickupHint = true }: DeliveryCoverageNoticeProps) {
  return (
    <div className="rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/50 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-full bg-amber-100 dark:bg-amber-900/50 p-2">
          <Truck className="w-5 h-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-sm text-amber-900 dark:text-amber-200">
            Ainda não entregamos em {city}{state ? `/${state}` : ''}
          </p>
          <p className="text-xs text-amber-800/80 dark:text-amber-300/80 leading-relaxed">
            No momento entregamos apenas nas cidades abaixo, pela nossa transportadora parceira, com frete fixo de <strong>R$ 15,00</strong>:
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 pl-11">
        {PARTNER_CITIES.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1 rounded-full bg-background border border-amber-200 dark:border-amber-800 px-2 py-0.5 text-[11px] font-medium text-foreground"
          >
            <MapPin className="w-3 h-3 text-amber-500" />
            {c}
          </span>
        ))}
      </div>

      {showPickupHint && (
        <div className="flex items-center gap-2 pl-11 text-xs text-muted-foreground">
          <Store className="w-3.5 h-3.5 shrink-0" />
          <span>Você também pode <strong>retirar na loja</strong> em Sinop/MT, sem custo.</span>
        </div>
      )}
    </div>
  );
}
