/**
 * Status unificado de uma promoção (produto ou variação).
 * Usado no painel de promoções para que promoções AGENDADAS e EXPIRADAS
 * também apareçam — não apenas as que estão ativas agora.
 */
import { PromoFields, promoBasePrice } from './promoPrice';

export type PromoStatus =
  | 'none'        // sem promoção
  | 'invalid'     // marcada como promo mas sem prazo/preço válido
  | 'scheduled'   // vai começar no futuro
  | 'active'      // valendo agora
  | 'sold_out'    // limite de peças atingido
  | 'expired';    // prazo terminou

export function promoStatus(item: PromoFields | null | undefined, now: Date = new Date()): PromoStatus {
  if (!item || !item.on_sale) return 'none';
  if (item.sale_price == null) return 'invalid';

  const base = promoBasePrice(item);
  if (base <= 0 || Number(item.sale_price) >= base) return 'invalid';

  if (!item.sale_ends_at) return 'invalid';
  const ends = new Date(item.sale_ends_at);
  if (isNaN(ends.getTime())) return 'invalid';

  if (item.sale_starts_at) {
    const starts = new Date(item.sale_starts_at);
    if (!isNaN(starts.getTime()) && starts.getTime() > now.getTime()) return 'scheduled';
  }

  if (ends.getTime() <= now.getTime()) return 'expired';

  if (item.sale_limit_qty != null && Number(item.sale_sold_qty ?? 0) >= Number(item.sale_limit_qty)) {
    return 'sold_out';
  }

  return 'active';
}

export const PROMO_STATUS_LABEL: Record<PromoStatus, string> = {
  none: 'Sem promoção',
  invalid: 'Incompleta',
  scheduled: 'Agendada',
  active: 'Ativa',
  sold_out: 'Esgotada',
  expired: 'Expirada',
};

/** Classes de badge por status (tokens semânticos + utilitários de cor de estado). */
export const PROMO_STATUS_CLASS: Record<PromoStatus, string> = {
  none: 'bg-muted text-muted-foreground',
  invalid: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  scheduled: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
  active: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  sold_out: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30',
  expired: 'bg-destructive/15 text-destructive border-destructive/30',
};

export function channelLabel(channel?: string | null): string {
  if (channel === 'site') return 'Site';
  if (channel === 'pdv') return 'PDV';
  return 'Site + PDV';
}

/** Contagem regressiva legível: "2d 4h", "3h 12min", "45min", "encerrado". */
export function countdownLabel(target: string | null | undefined, now: Date = new Date()): string {
  if (!target) return '—';
  const t = new Date(target).getTime();
  if (isNaN(t)) return '—';
  let diff = Math.floor((t - now.getTime()) / 1000);
  if (diff <= 0) return 'encerrado';
  const d = Math.floor(diff / 86400);
  diff -= d * 86400;
  const h = Math.floor(diff / 3600);
  diff -= h * 3600;
  const m = Math.floor(diff / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}
