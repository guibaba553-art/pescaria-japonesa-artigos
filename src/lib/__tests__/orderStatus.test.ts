import { describe, it, expect } from 'vitest';
import {
  getStatusLabel,
  getNextStatus,
  getNextStatusLabel,
  statusConfig,
} from '@/lib/orderStatus';

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
  it('returns em_preparo from aguardando_pagamento for delivery', () => {
    expect(getNextStatus('aguardando_pagamento', 'delivery')).toBe('em_preparo');
  });

  it('returns em_preparo from aguardando_pagamento for pickup', () => {
    expect(getNextStatus('aguardando_pagamento', 'pickup')).toBe('em_preparo');
  });

  it('returns pronto_retirada from em_preparo for pickup', () => {
    expect(getNextStatus('em_preparo', 'pickup')).toBe('pronto_retirada');
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
  it('returns "Marcar como Em Preparo" from aguardando_pagamento for pickup', () => {
    expect(getNextStatusLabel('aguardando_pagamento', 'pickup')).toBe('Marcar como Em Preparo');
  });

  it('returns "Marcar como Em Preparo" from aguardando_pagamento for delivery', () => {
    expect(getNextStatusLabel('aguardando_pagamento', 'delivery')).toBe('Marcar como Em Preparo');
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
