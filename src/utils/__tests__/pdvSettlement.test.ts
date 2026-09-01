import { describe, it, expect } from 'vitest';
import { getSettlementDate, getSettlementSchedule } from '@/utils/pdvSettlement';

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('liquidação de débito (Stone)', () => {
  it('venda na quinta liquida na sexta', () => {
    expect(ymd(getSettlementDate(new Date(2026, 7, 27), 'debit'))).toBe('2026-08-28');
  });

  it('venda na sexta liquida na segunda (pula o fim de semana)', () => {
    expect(ymd(getSettlementDate(new Date(2026, 7, 28), 'debit'))).toBe('2026-08-31');
  });

  it('venda no sábado liquida na segunda', () => {
    expect(ymd(getSettlementDate(new Date(2026, 7, 29), 'debit'))).toBe('2026-08-31');
  });

  it('agenda de débito usa a mesma data útil', () => {
    const [p] = getSettlementSchedule(new Date(2026, 7, 29), 'debit', 100, 1);
    expect(ymd(p.date)).toBe('2026-08-31');
    expect(p.amount).toBe(100);
  });
});
