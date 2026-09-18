import { describe, expect, it } from 'vitest';
import { annotationKey, attachChartAnnotations } from '@/utils/dashboardAnnotations';

describe('dashboardAnnotations', () => {
  it('mantém anotações separadas por canal e data', () => {
    expect(annotationKey('site', '18/09/2026')).toBe('site:2026-09-18');
    expect(annotationKey('pdv', '18/09/2026')).toBe('pdv:2026-09-18');
  });

  it('anexa somente a anotação do canal pedido', () => {
    const rows = [{ date: '18/09/2026', site: 100, pdv: 50 }];
    const annotations = [
      { channel: 'site' as const, note_date: '2026-09-18', note: 'Campanha publicada' },
      { channel: 'pdv' as const, note_date: '2026-09-18', note: 'Loja fechou cedo' },
    ];
    expect(attachChartAnnotations(rows, annotations, 'site')[0].annotation).toBe('Campanha publicada');
    expect(attachChartAnnotations(rows, annotations, 'pdv')[0].annotation).toBe('Loja fechou cedo');
  });
});
