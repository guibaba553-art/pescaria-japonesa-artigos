export type DashboardAnnotationChannel = 'pdv' | 'site' | 'all' | 'traffic';

export interface DashboardDayAnnotation {
  id?: string;
  channel: DashboardAnnotationChannel;
  note_date: string;
  note: string;
  created_by?: string;
}

function displayDateToIso(date: string): string {
  const [day, month, year] = date.split('/');
  if (!day || !month || !year) return date;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export function annotationKey(channel: DashboardAnnotationChannel, date: string): string {
  return `${channel}:${date.includes('/') ? displayDateToIso(date) : date}`;
}

export function attachChartAnnotations<T extends { date: string }>(
  rows: T[],
  annotations: DashboardDayAnnotation[],
  channel: DashboardAnnotationChannel,
): Array<T & { annotation?: string }> {
  const notes = new Map(
    annotations
      .filter((item) => item.channel === channel)
      .map((item) => [annotationKey(channel, item.note_date), item.note]),
  );
  return rows.map((row) => ({
    ...row,
    annotation: notes.get(annotationKey(channel, row.date)),
  }));
}

export function chartDateToIso(date: string): string {
  return date.includes('/') ? displayDateToIso(date) : date;
}