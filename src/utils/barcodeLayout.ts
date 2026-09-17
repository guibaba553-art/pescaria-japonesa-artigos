/**
 * Cálculos puros de layout de código de barras para impressão de etiquetas.
 *
 * Objetivo: garantir barras largas o suficiente (módulo mínimo) e quiet zone,
 * evitando que o código estoure a etiqueta ou fique ilegível em leitores laser
 * de linha única.
 */

/** Módulos consumidos por um Code39 (inclui os asteriscos e os gaps entre caracteres). */
export function code39ModuleCount(value: string): number {
  const chars = value.length + 2; // *VALOR*
  return chars * 16 - 1; // 13 módulos por caractere + 3 de gap, menos o gap final
}

/** Módulos consumidos por um Code128 (modo C quando o valor é numérico de tamanho par). */
export function code128ModuleCount(value: string): number {
  const numericEven = /^\d+$/.test(value) && value.length % 2 === 0;
  const dataSymbols = numericEven ? value.length / 2 : value.length;
  // start + dados + checksum = 11 módulos cada; stop = 13
  return (1 + dataSymbols + 1) * 11 + 13;
}

export interface BarcodeBoxInput {
  moduleCount: number;
  maxWidthMm: number;
  /** Quiet zone total (soma dos dois lados) em módulos. Padrão 20 (10 por lado). */
  quietZoneModules?: number;
  /** Largura mínima de módulo considerada legível por leitores laser comuns. */
  minModuleMm?: number;
}

export interface BarcodeBox {
  /** Largura final do desenho (código + quiet zones) em mm. */
  widthMm: number;
  /** Largura de cada módulo em mm. */
  moduleMm: number;
  /** Recuo horizontal para centralizar dentro de maxWidthMm. */
  offsetMm: number;
  /** false quando o módulo ficou abaixo do mínimo legível. */
  readable: boolean;
}

export function fitBarcodeBox({
  moduleCount,
  maxWidthMm,
  quietZoneModules = 20,
  minModuleMm = 0.25,
}: BarcodeBoxInput): BarcodeBox {
  const totalModules = moduleCount + quietZoneModules;
  const moduleMm = maxWidthMm / totalModules;
  const widthMm = moduleMm * totalModules;
  return {
    widthMm,
    moduleMm,
    offsetMm: Math.max(0, (maxWidthMm - widthMm) / 2),
    readable: moduleMm >= minModuleMm,
  };
}
