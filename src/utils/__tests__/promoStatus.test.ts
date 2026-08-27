import { describe, it, expect } from 'vitest';
import { promoStatus, countdownLabel, channelLabel } from '../promoStatus';

const NOW = new Date('2026-01-10T12:00:00Z');
const PAST = '2026-01-01T00:00:00Z';
const FUTURE = '2026-02-01T00:00:00Z';

describe('promoStatus', () => {
  it('retorna none quando não está em promoção', () => {
    expect(promoStatus({ on_sale: false, price: 10 }, NOW)).toBe('none');
  });

  it('retorna invalid quando falta prazo final', () => {
    expect(promoStatus({ on_sale: true, price: 10, sale_price: 8 }, NOW)).toBe('invalid');
  });

  it('retorna scheduled quando começa no futuro', () => {
    expect(
      promoStatus({ on_sale: true, price: 10, sale_price: 8, sale_starts_at: FUTURE, sale_ends_at: '2026-03-01T00:00:00Z' }, NOW),
    ).toBe('scheduled');
  });

  it('retorna expired quando o prazo terminou', () => {
    expect(promoStatus({ on_sale: true, price: 10, sale_price: 8, sale_ends_at: PAST }, NOW)).toBe('expired');
  });

  it('retorna sold_out quando o limite foi atingido', () => {
    expect(
      promoStatus({ on_sale: true, price: 10, sale_price: 8, sale_ends_at: FUTURE, sale_limit_qty: 5, sale_sold_qty: 5 }, NOW),
    ).toBe('sold_out');
  });

  it('retorna active quando está valendo', () => {
    expect(promoStatus({ on_sale: true, price: 10, sale_price: 8, sale_ends_at: FUTURE }, NOW)).toBe('active');
  });
});

describe('countdownLabel', () => {
  it('formata dias e horas', () => {
    expect(countdownLabel('2026-01-12T16:00:00Z', NOW)).toBe('2d 4h');
  });
  it('formata minutos', () => {
    expect(countdownLabel('2026-01-10T12:45:00Z', NOW)).toBe('45min');
  });
  it('encerrado no passado', () => {
    expect(countdownLabel(PAST, NOW)).toBe('encerrado');
  });
});

describe('channelLabel', () => {
  it('mapeia canais', () => {
    expect(channelLabel('site')).toBe('Site');
    expect(channelLabel('pdv')).toBe('PDV');
    expect(channelLabel('both')).toBe('Site + PDV');
    expect(channelLabel(null)).toBe('Site + PDV');
  });
});
