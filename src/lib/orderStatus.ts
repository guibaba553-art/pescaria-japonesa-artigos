import { Clock, Package, PackageCheck, Truck, CheckCircle, Store, Undo2 } from 'lucide-react';

export type OrderStatus =
  | 'aguardando_pagamento'
  | 'em_preparo'
  | 'aguardando_envio'
  | 'enviado'
  | 'entregado'
  | 'retirado'
  | 'cancelado'
  | 'devolucao_solicitada'
  | 'devolvido'
  | 'pronto_retirada';

export interface StatusConfigEntry {
  label: string;
  icon: any;
  badgeClass: string;
  accentClass: string;
}

export const statusConfig: Record<OrderStatus, StatusConfigEntry> = {
  aguardando_pagamento: {
    label: 'Aguardando Pagamento',
    icon: Clock,
    badgeClass: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30 hover:bg-orange-500/20',
    accentClass: 'border-l-orange-500',
  },
  em_preparo: {
    label: 'Em Preparo',
    icon: Package,
    badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20',
    accentClass: 'border-l-amber-500',
  },
  aguardando_envio: {
    label: 'Aguardando Envio',
    icon: PackageCheck,
    badgeClass: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/20',
    accentClass: 'border-l-indigo-500',
  },
  enviado: {
    label: 'Enviado',
    icon: Truck,
    badgeClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 hover:bg-blue-500/20',
    accentClass: 'border-l-blue-500',
  },
  entregado: {
    label: 'Entregue',
    icon: CheckCircle,
    badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20',
    accentClass: 'border-l-emerald-500',
  },
  retirado: {
    label: 'Retirado',
    icon: CheckCircle,
    badgeClass: 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 border-emerald-600/30 hover:bg-emerald-600/20',
    accentClass: 'border-l-emerald-600',
  },
  pronto_retirada: {
    label: 'Pronto para Retirar',
    icon: Store,
    badgeClass: 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30 hover:bg-green-500/20',
    accentClass: 'border-l-green-500',
  },
  cancelado: {
    label: 'Cancelado',
    icon: Clock,
    badgeClass: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30 hover:bg-red-500/20',
    accentClass: 'border-l-red-500',
  },
  devolucao_solicitada: {
    label: 'Devolução em Trânsito',
    icon: Truck,
    badgeClass: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30 hover:bg-orange-500/20',
    accentClass: 'border-l-orange-500',
  },
  devolvido: {
    label: 'Devolvido',
    icon: Undo2,
    badgeClass: 'bg-red-600/15 text-red-700 dark:text-red-400 border-red-600/40 hover:bg-red-600/20',
    accentClass: 'border-l-red-600',
  },
};

/**
 * Retorna o label legível do status considerando o tipo de entrega.
 * Anteriormente, em_preparo + pickup retornava "Pronto para Retirar".
 * Agora isso foi substituído pelo status pronto_retirada explícito.
 */
export function getStatusLabel(status: OrderStatus, deliveryType: 'delivery' | 'pickup'): string {
  if (status === 'em_preparo' && deliveryType === 'pickup') {
    return 'Em Preparo';
  }
  return statusConfig[status].label;
}

/**
 * Verifica se um pedido está com prazo de pagamento expirado.
 * Retorna true se o status é 'aguardando_pagamento' e foi criado há mais de 1 hora.
 */
export function isOrderExpired(order: { status: string; created_at: string }): boolean {
  if (order.status !== 'aguardando_pagamento') return false;
  const within1h = new Date(order.created_at).getTime() > Date.now() - 60 * 60 * 1000;
  return !within1h;
}

/**
 * Retorna o próximo status possível para um pedido.
 */
export function getNextStatus(
  currentStatus: OrderStatus,
  deliveryType: 'delivery' | 'pickup',
): OrderStatus | null {
  if (currentStatus === 'aguardando_pagamento') return 'em_preparo';
  if (currentStatus === 'em_preparo') {
    // Delivery: embalagem é feita exclusivamente pela Triagem (com leitura de SKU).
    // Pickup: precisa marcar como pronto para retirada primeiro.
    if (deliveryType === 'pickup') return 'pronto_retirada';
    return null;
  }
  if (currentStatus === 'pronto_retirada') return 'retirado';
  if (currentStatus === 'aguardando_envio') return 'enviado';
  if (currentStatus === 'enviado') return 'entregado';
  return null;
}

/**
 * Retorna o label do botão para o próximo status.
 */
export function getNextStatusLabel(
  currentStatus: OrderStatus,
  deliveryType: 'delivery' | 'pickup',
): string {
  if (currentStatus === 'aguardando_pagamento') {
    return deliveryType === 'pickup' ? 'Marcar como Em Preparo' : 'Marcar como Em Preparo';
  }
  if (currentStatus === 'em_preparo') {
    return deliveryType === 'pickup'
      ? 'Marcar como Pronto para Retirar'
      : 'Marcar como Embalado (Aguardando Envio)';
  }
  if (currentStatus === 'pronto_retirada') return 'Marcar como Retirado';
  if (currentStatus === 'aguardando_envio') return 'Marcar como Enviado';
  if (currentStatus === 'enviado') return 'Marcar como Entregue';
  return 'Finalizado';
}
