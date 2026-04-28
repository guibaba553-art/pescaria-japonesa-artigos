/**
 * Lógica de empacotamento da loja.
 *
 * Embalagens disponíveis (CxLxA em cm):
 *   - Caixa pequena: 19 x 16 x 10
 *   - Caixa grande:  21 x 17 x 17
 *   - Envelope com plástico bolha: 19 x 25 (achatado, altura ~3cm)
 *   - Tubo enrolado em plástico bolha + papel kraft: para itens longos (>50cm)
 *
 * Estratégia:
 *   1. Itens com qualquer dimensão > 50cm vão como tubo (1 pacote por item).
 *   2. Itens finos (altura ≤ 2cm) e leves (≤ 300g) tentam ir no envelope bolha.
 *   3. Demais itens são consolidados na menor caixa que comporta o volume + maior dimensão.
 *
 * Peso da embalagem é estimado pelo volume:
 *   - Caixa de papelão: ~0.04g por cm³ de volume externo (aprox. parede dupla padrão)
 *   - Envelope bolha: ~30g fixo
 *   - Tubo (bolha + kraft): ~0.5g por cm de comprimento + 30g
 */

export interface ItemDims {
  width_cm: number | null;
  height_cm: number | null;
  length_cm: number | null;
  weight_grams: number | null;
}

export interface ShipmentItem extends ItemDims {
  id: string;
  quantity: number;
}

export interface PackedBox {
  id: string;
  width: number;
  height: number;
  length: number;
  weight: number; // kg
  insurance_value: number;
  quantity: number;
  packaging: 'caixa_pequena' | 'caixa_grande' | 'envelope_bolha' | 'tubo';
}

// Fallback quando o produto não tem dimensão cadastrada
const FALLBACK: Required<ItemDims> = {
  width_cm: 15,
  height_cm: 5,
  length_cm: 20,
  weight_grams: 300,
};

// Embalagens (dimensões internas aproximadas)
const BOXES = {
  caixa_pequena: { w: 19, h: 10, l: 16, volume: 19 * 10 * 16, maxDim: 19 },
  caixa_grande: { w: 21, h: 17, l: 17, volume: 21 * 17 * 17, maxDim: 21 },
} as const;

const ENVELOPE = { w: 19, h: 3, l: 25, volume: 19 * 3 * 25, maxDim: 25 };

function dim(d: ItemDims, key: keyof ItemDims): number {
  const v = d[key];
  if (v == null || Number(v) <= 0) return FALLBACK[key] as number;
  return Number(v);
}

function itemVolume(d: ItemDims): number {
  return dim(d, 'width_cm') * dim(d, 'height_cm') * dim(d, 'length_cm');
}

function maxDimension(d: ItemDims): number {
  return Math.max(dim(d, 'width_cm'), dim(d, 'height_cm'), dim(d, 'length_cm'));
}

function itemWeight(d: ItemDims): number {
  const w = d.weight_grams;
  return w && w > 0 ? w : FALLBACK.weight_grams!;
}

// Peso estimado da embalagem vazia (gramas), proporcional ao volume
function packagingWeight(type: PackedBox['packaging'], lengthCm = 0): number {
  switch (type) {
    case 'caixa_pequena':
      return Math.round(BOXES.caixa_pequena.volume * 0.04); // ~120g
    case 'caixa_grande':
      return Math.round(BOXES.caixa_grande.volume * 0.04); // ~243g
    case 'envelope_bolha':
      return 30;
    case 'tubo':
      return Math.round(lengthCm * 0.5 + 30);
  }
}

// Mínimos exigidos pelo Melhor Envio
function clampMin(box: { w: number; h: number; l: number }) {
  return {
    width: Math.max(11, box.w),
    height: Math.max(2, box.h),
    length: Math.max(11, box.l),
  };
}

export function packItems(items: ShipmentItem[], insuranceValue = 0): PackedBox[] {
  const packages: PackedBox[] = [];
  let pkgIdx = 0;
  const nextId = () => String(++pkgIdx);

  // Expande quantidades em unidades individuais para o algoritmo
  const units: { item: ShipmentItem }[] = [];
  for (const it of items) {
    for (let i = 0; i < it.quantity; i++) units.push({ item: it });
  }

  // 1) Itens muito longos (>100cm / 1m) → consolidados em UM ÚNICO tubo.
  //    Comprimento do tubo = MAIOR altura entre os itens longos (não soma).
  //    Peso = soma dos pesos dos itens longos + peso do tubo.
  //    Itens entre 50cm e 100cm que não cabem na caixa grande serão divididos
  //    em 2 pacotes (caixa grande) na etapa 4.
  const longUnits: typeof units = [];
  const remaining: typeof units = [];
  for (const u of units) {
    if (maxDimension(u.item) > 100) longUnits.push(u);
    else remaining.push(u);
  }

  if (longUnits.length > 0) {
    const maxLen = Math.max(...longUnits.map((u) => maxDimension(u.item)));
    const totalWeight = longUnits.reduce((sum, u) => sum + itemWeight(u.item), 0);
    const len = Math.ceil(maxLen + 5); // folga
    const insurance = insuranceValue * (longUnits.length / Math.max(1, units.length));
    packages.push({
      id: nextId(),
      ...clampMin({ w: 12, h: 12, l: len }),
      weight: (totalWeight + packagingWeight('tubo', len)) / 1000,
      insurance_value: insurance,
      quantity: 1,
      packaging: 'tubo',
    });
  }

  if (remaining.length === 0) return packages;

  // 2) Separa unidades "envelopáveis" (finas e leves)
  const envelopable: typeof remaining = [];
  const boxables: typeof remaining = [];
  for (const u of remaining) {
    const h = dim(u.item, 'height_cm');
    const w = itemWeight(u.item);
    const fitsEnvelope =
      h <= 2 &&
      w <= 300 &&
      maxDimension(u.item) <= 25 &&
      dim(u.item, 'width_cm') <= 19;
    if (fitsEnvelope) envelopable.push(u);
    else boxables.push(u);
  }

  // 3) Empacota envelopáveis: junta até preencher volume do envelope (450cm³) ou 500g
  let envItems: typeof envelopable = [];
  let envVol = 0;
  let envWeight = 0;
  const flushEnvelope = () => {
    if (envItems.length === 0) return;
    const insurancePerPkg = insuranceValue * (envItems.length / units.length);
    packages.push({
      id: nextId(),
      ...clampMin({ w: ENVELOPE.w, h: ENVELOPE.h, l: ENVELOPE.l }),
      weight: (envWeight + packagingWeight('envelope_bolha')) / 1000,
      insurance_value: insurancePerPkg,
      quantity: 1,
      packaging: 'envelope_bolha',
    });
    envItems = [];
    envVol = 0;
    envWeight = 0;
  };
  for (const u of envelopable) {
    const v = itemVolume(u.item);
    const w = itemWeight(u.item);
    if (envVol + v > ENVELOPE.volume * 0.85 || envWeight + w > 500) flushEnvelope();
    envItems.push(u);
    envVol += v;
    envWeight += w;
  }
  flushEnvelope();

  // 4) Empacota boxables: tenta caixa pequena, senão grande. Soma volumes com fator de
  //    aproveitamento ~70% (perda por encaixe) e respeita maior dimensão.
  const PACK_EFFICIENCY = 0.7;
  let boxItems: typeof boxables = [];
  let boxVol = 0;
  let boxWeight = 0;
  let boxMaxDim = 0;

  const chooseAndFlush = (force = false) => {
    if (boxItems.length === 0) return;
    // Decide menor caixa que comporta
    const fitsSmall =
      boxVol <= BOXES.caixa_pequena.volume * PACK_EFFICIENCY &&
      boxMaxDim <= BOXES.caixa_pequena.maxDim;
    const chosen = fitsSmall ? 'caixa_pequena' : 'caixa_grande';
    const dims = BOXES[chosen];
    const insurancePerPkg = insuranceValue * (boxItems.length / units.length);
    packages.push({
      id: nextId(),
      ...clampMin({ w: dims.w, h: dims.h, l: dims.l }),
      weight: (boxWeight + packagingWeight(chosen)) / 1000,
      insurance_value: insurancePerPkg,
      quantity: 1,
      packaging: chosen,
    });
    boxItems = [];
    boxVol = 0;
    boxWeight = 0;
    boxMaxDim = 0;
    return force;
  };

  for (const u of boxables) {
    const v = itemVolume(u.item);
    const w = itemWeight(u.item);
    const md = maxDimension(u.item);

    // Caso especial: item sozinho não cabe na caixa grande (50–100cm).
    // Divide em 2 pacotes "caixa grande" — fechamos o pack atual e emitimos
    // 2 caixas grandes para esse item (peso/seguro divididos pela metade).
    if (md > BOXES.caixa_grande.maxDim) {
      chooseAndFlush();
      const insurancePerPkg = (insuranceValue * (1 / units.length)) / 2;
      const halfWeight = (w / 2 + packagingWeight('caixa_grande')) / 1000;
      for (let k = 0; k < 2; k++) {
        packages.push({
          id: nextId(),
          ...clampMin({ w: BOXES.caixa_grande.w, h: BOXES.caixa_grande.h, l: BOXES.caixa_grande.l }),
          weight: halfWeight,
          insurance_value: insurancePerPkg,
          quantity: 1,
          packaging: 'caixa_grande',
        });
      }
      continue;
    }

    // Se exceder caixa grande consolidando, fecha o atual e abre novo
    const wouldOverflow =
      boxVol + v > BOXES.caixa_grande.volume * PACK_EFFICIENCY ||
      boxWeight + w > 25000 || // 25kg limite Correios
      Math.max(boxMaxDim, md) > BOXES.caixa_grande.maxDim;
    if (wouldOverflow) chooseAndFlush();
    boxItems.push(u);
    boxVol += v;
    boxWeight += w;
    boxMaxDim = Math.max(boxMaxDim, md);
  }
  chooseAndFlush();

  return packages;
}
