import { describe, it, expect } from 'vitest';
import {
  getStatusLabel,
  getNextStatus,
  getNextStatusLabel,
  statusConfig,
  classifyCancelledOrder,
  getCancellationReasonConfig,
  getGatewayUrl,
} from '@/lib/orderStatus';
import type { CancelledCategory } from '@/lib/orderStatus';

describe('getStatusLabel', () => {
  it('returns "Em Preparo" for em_preparo + delivery', () => {
    expect(getStatusLabel('em_preparo', 'delivery')).toBe('Em Preparo');
  });

  it('returns "Em Preparo" for em_preparo + pickup (no longer "Pronto para Retirar")', () => {
    // Previously returned "Pronto para Retirar" — now returns "Em Preparo"
    expect(getStatusLabel('em_preparo', 'pickup')).toBe('Em Preparo');
  });

  it('returns "Pronto para Retirar" for pronto_retirada + pickup', () => {
    expect(getStatusLabel('pronto_retirada', 'pickup')).toBe('Pronto para Retirar');
  });

  it('returns "Pronto para Retirar" for pronto_retirada + delivery (edge case)', () => {
    expect(getStatusLabel('pronto_retirada', 'delivery')).toBe('Pronto para Retirar');
  });

  it('returns "Aguardando Envio" for aguardando_envio', () => {
    expect(getStatusLabel('aguardando_envio', 'delivery')).toBe('Aguardando Envio');
  });

  it('returns "Aguardando Pagamento" for aguardando_pagamento', () => {
    expect(getStatusLabel('aguardando_pagamento', 'delivery')).toBe('Aguardando Pagamento');
  });

  it('returns "Retirado" for retirado', () => {
    expect(getStatusLabel('retirado', 'pickup')).toBe('Retirado');
  });
});

describe('getNextStatus', () => {
  it('returns null from aguardando_pagamento (transition only via payment verification)', () => {
    expect(getNextStatus('aguardando_pagamento', 'delivery')).toBeNull();
  });

  it('returns null from aguardando_pagamento for pickup (transition only via payment verification)', () => {
    expect(getNextStatus('aguardando_pagamento', 'pickup')).toBeNull();
  });

  it('returns null from em_preparo for pickup (requires triage)', () => {
    expect(getNextStatus('em_preparo', 'pickup')).toBeNull();
  });

  it('returns null from em_preparo for delivery (goes through Triagem)', () => {
    expect(getNextStatus('em_preparo', 'delivery')).toBeNull();
  });

  it('returns retirado from pronto_retirada for pickup', () => {
    expect(getNextStatus('pronto_retirada', 'pickup')).toBe('retirado');
  });

  it('returns retirado from pronto_retirada for delivery (edge case)', () => {
    expect(getNextStatus('pronto_retirada', 'delivery')).toBe('retirado');
  });

  it('returns enviado from aguardando_envio', () => {
    expect(getNextStatus('aguardando_envio', 'delivery')).toBe('enviado');
  });

  it('returns entregue from enviado', () => {
    expect(getNextStatus('enviado', 'delivery')).toBe('entregado');
  });

  it('returns null from entregado (no further action)', () => {
    expect(getNextStatus('entregado', 'delivery')).toBeNull();
  });

  it('returns null from retirado (no further action)', () => {
    expect(getNextStatus('retirado', 'pickup')).toBeNull();
  });
});

describe('getNextStatusLabel', () => {
  it('returns "Finalizado" from aguardando_pagamento (no manual advance)', () => {
    expect(getNextStatusLabel('aguardando_pagamento', 'pickup')).toBe('Finalizado');
  });

  it('returns "Finalizado" from aguardando_pagamento for delivery (no manual advance)', () => {
    expect(getNextStatusLabel('aguardando_pagamento', 'delivery')).toBe('Finalizado');
  });

  it('returns "Marcar como Pronto para Retirar" from em_preparo for pickup', () => {
    expect(getNextStatusLabel('em_preparo', 'pickup')).toBe('Marcar como Pronto para Retirar');
  });

  it('returns "Marcar como Embalado (Aguardando Envio)" from em_preparo for delivery', () => {
    expect(getNextStatusLabel('em_preparo', 'delivery')).toBe('Marcar como Embalado (Aguardando Envio)');
  });

  it('returns "Marcar como Retirado" from pronto_retirada', () => {
    expect(getNextStatusLabel('pronto_retirada', 'pickup')).toBe('Marcar como Retirado');
  });

  it('returns "Marcar como Enviado" from aguardando_envio', () => {
    expect(getNextStatusLabel('aguardando_envio', 'delivery')).toBe('Marcar como Enviado');
  });

  it('returns "Marcar como Entregue" from enviado', () => {
    expect(getNextStatusLabel('enviado', 'delivery')).toBe('Marcar como Entregue');
  });
});

describe('statusConfig', () => {
  it('has an entry for pronto_retirada', () => {
    expect(statusConfig.pronto_retirada).toBeDefined();
    expect(statusConfig.pronto_retirada.label).toBe('Pronto para Retirar');
    expect(statusConfig.pronto_retirada.icon).toBeDefined();
  });

  it('has entries for all required statuses', () => {
    const required: string[] = [
      'aguardando_pagamento',
      'em_preparo',
      'aguardando_envio',
      'enviado',
      'entregado',
      'retirado',
      'pronto_retirada',
      'cancelado',
      'devolucao_solicitada',
      'devolvido',
    ];
    for (const s of required) {
      expect(statusConfig[s as keyof typeof statusConfig]).toBeDefined();
    }
  });
});

const baseOrder = {
  status: 'cancelado',
  total_amount: 100,
  refunded_amount: 0,
  payment_gateway: null as string | null,
  payment_id: null as string | null,
  asaas_payment_id: null as string | null,
};

describe('classifyCancelledOrder', () => {
  it('returns no_payment when no gateway or payment_id', () => {
    const result = classifyCancelledOrder(baseOrder);
    expect(result).toBe('no_payment');
  });

  it('returns no_payment when payment_gateway exists but no payment_id', () => {
    const result = classifyCancelledOrder({ ...baseOrder, payment_gateway: 'mercadopago' });
    expect(result).toBe('no_payment');
  });

  it('returns needs_refund when has payment and refunded_amount < total', () => {
    const result = classifyCancelledOrder({
      ...baseOrder,
      payment_gateway: 'asaas',
      payment_id: 'pay_123',
      refunded_amount: 0,
    });
    expect(result).toBe('needs_refund');
  });

  it('returns needs_refund when has asaas_payment_id without payment_id', () => {
    const result = classifyCancelledOrder({
      ...baseOrder,
      payment_gateway: 'asaas',
      asaas_payment_id: 'pay_123',
      refunded_amount: 0,
    });
    expect(result).toBe('needs_refund');
  });

  it('returns needs_refund when partially refunded', () => {
    const result = classifyCancelledOrder({
      ...baseOrder,
      payment_gateway: 'asaas',
      payment_id: 'pay_123',
      refunded_amount: 30,
    });
    expect(result).toBe('needs_refund');
  });

  it('returns refunded when refunded_amount >= total within epsilon', () => {
    const result = classifyCancelledOrder({
      ...baseOrder,
      payment_gateway: 'asaas',
      payment_id: 'pay_123',
      refunded_amount: 99.999,
    });
    expect(result).toBe('refunded');
  });

  it('returns refunded when status is reembolsado regardless of payment', () => {
    const result = classifyCancelledOrder({
      ...baseOrder,
      status: 'reembolsado',
      total_amount: 0,
    });
    expect(result).toBe('refunded');
  });

  it('returns refunded when status is cancelado but refunded_amount >= total', () => {
    const result = classifyCancelledOrder({
      ...baseOrder,
      payment_gateway: 'mercadopago',
      payment_id: 'pay_456',
      refunded_amount: 100,
    });
    expect(result).toBe('refunded');
  });
});

describe('getCancellationReasonConfig', () => {
  it('returns prazo_expirado config', () => {
    const cfg = getCancellationReasonConfig('prazo_expirado');
    expect(cfg.label).toBe('PIX não pago no prazo');
    expect(cfg.icon).toBe('Clock');
    expect(cfg.color).toBe('gray');
  });

  it('returns cancelado_pelo_cliente config', () => {
    const cfg = getCancellationReasonConfig('cancelado_pelo_cliente');
    expect(cfg.label).toBe('Cliente desistiu');
    expect(cfg.icon).toBe('UserX');
    expect(cfg.color).toBe('gray');
  });

  it('returns cancelado_admin config', () => {
    const cfg = getCancellationReasonConfig('cancelado_admin');
    expect(cfg.label).toBe('Cancelado pela loja');
    expect(cfg.icon).toBe('Store');
    expect(cfg.color).toBe('blue');
  });

  it('returns estorno_total config', () => {
    const cfg = getCancellationReasonConfig('estorno_total');
    expect(cfg.label).toBe('Estornado integralmente');
    expect(cfg.icon).toBe('CheckCircle');
    expect(cfg.color).toBe('green');
  });

  it('returns default config for unknown reason', () => {
    const cfg = getCancellationReasonConfig('motivo_qualquer');
    expect(cfg.label).toBe('Cancelado');
    expect(cfg.icon).toBe('Clock');
    expect(cfg.color).toBe('gray');
  });

  it('returns default config for null', () => {
    const cfg = getCancellationReasonConfig(null);
    expect(cfg.label).toBe('Cancelado');
    expect(cfg.icon).toBe('Clock');
    expect(cfg.color).toBe('gray');
  });
});

describe('getGatewayUrl', () => {
  it('returns Asaas URL from import.meta.env, ignores window.__ASAAS_ENV__', () => {
    (window as any).__ASAAS_ENV__ = 'sandbox';
    const url = getGatewayUrl('asaas', 'pay_123');
    expect(url).toBe('https://www.asaas.com/cobrancas/pay_123');
  });

  it('returns Asaas payment/show URL when invoiceNumber is provided', () => {
    const url = getGatewayUrl('asaas', 'pay_123', '865862562');
    expect(url).toBe('https://www.asaas.com/payment/show/865862562');
  });

  it('returns Mercado Pago URL', () => {
    const url = getGatewayUrl('mercadopago', 'mp_456');
    expect(url).toBe('https://www.mercadopago.com.br/activities/mp_456');
  });

  it('returns null when gateway is null', () => {
    const url = getGatewayUrl(null, 'pay_123');
    expect(url).toBeNull();
  });

  it('returns null when paymentId is null', () => {
    const url = getGatewayUrl('asaas', null);
    expect(url).toBeNull();
  });

  it('returns null for unknown gateway', () => {
    const url = getGatewayUrl('pagseguro', 'ps_789');
    expect(url).toBeNull();
  });
});
