import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Sanitiza uma string de entrada decimal, permitindo apenas dígitos,
 * um ponto decimal e no máximo `maxDecimals` casas após o ponto.
 * Remove caracteres não numéricos, sinais negativos e pontos extras.
 */
export function sanitizeDecimalInput(value: string, maxDecimals: number = 2): string {
  // Se já existe um ponto decimal, vírgulas são separadores de milhar → remover.
  // Se não existe ponto, a primeira vírgula vira ponto (separador decimal brasileiro).
  if (value.includes('.')) {
    value = value.replace(/,/g, '');
  } else {
    value = value.replace(',', '.');
    value = value.replace(/,/g, '');
  }

  // Remove qualquer caractere que não seja dígito ou ponto
  let sanitized = value.replace(/[^\d.]/g, '');

  // Mantém apenas o primeiro ponto decimal
  const firstDotIndex = sanitized.indexOf('.');
  if (firstDotIndex !== -1) {
    const beforeDot = sanitized.substring(0, firstDotIndex);
    const afterDot = sanitized.substring(firstDotIndex + 1).replace(/\./g, '');
    // Limita as casas decimais
    const trimmedAfterDot = afterDot.substring(0, maxDecimals);
    // Se maxDecimals for 0, remove o ponto também; caso contrário mantém
    sanitized = maxDecimals === 0
      ? beforeDot
      : beforeDot + '.' + trimmedAfterDot;
  }

  return sanitized;
}
