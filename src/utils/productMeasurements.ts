export type MeasurementNumberMode = 'int' | 'float';

function toTrimmedString(value: unknown) {
  return String(value ?? '').trim();
}

export function parseOptionalMeasurementInput(value: unknown, mode: MeasurementNumberMode): number | null {
  const raw = toTrimmedString(value);

  if (!raw) return null;

  const normalized = raw.replace(',', '.');
  const parsed = mode === 'int' ? parseInt(normalized, 10) : parseFloat(normalized);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function resolveOptionalMeasurementUpdate(
  value: unknown,
  currentValue: number | null | undefined,
  mode: MeasurementNumberMode,
): number | null {
  const parsed = parseOptionalMeasurementInput(value, mode);

  if (parsed !== null) {
    return parsed;
  }

  const raw = toTrimmedString(value);
  if (raw === '') {
    return currentValue ?? null;
  }

  return currentValue ?? null;
}