// Entrega pela transportadora parceira: frete fixo para cidades atendidas (MT).

export const PARTNER_CITIES = [
  'Itaúba', 'Santa Helena', 'Guarita', 'Terra Nova do Norte', 'Peixoto de Azevedo',
  'Matupá', 'Guarantã do Norte', 'Novo Mundo', 'Nova Canaã do Norte', 'Carlinda',
  'Alta Floresta', 'Colíder', 'Nova Monte Verde', 'Paranaíta', 'Nova Bandeirantes',
  'Vera', 'Santa Carmem', 'Feliz Natal', 'União do Sul',
];

// Nomes aceitos (normalizados) → inclui formas curtas usadas no dia a dia
const ALIASES: Record<string, string> = {
  'terra nova': 'terra nova do norte',
  'nova canaa': 'nova canaa do norte',
  'guaranta': 'guaranta do norte',
};

export const normalizeCity = (s: string) =>
  (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const PARTNER_SET = new Set(PARTNER_CITIES.map(normalizeCity));

export type DeliveryCoverage = 'partner' | 'pickup' | 'unsupported';

export function classifyDeliveryCity(city: string, state: string): DeliveryCoverage {
  if ((state || '').toUpperCase() !== 'MT') return 'unsupported';
  let n = normalizeCity(city);
  n = ALIASES[n] ?? n;
  if (n === 'sinop') return 'pickup';
  return PARTNER_SET.has(n) ? 'partner' : 'unsupported';
}

export const PARTNER_SHIPPING_OPTION = {
  codigo: 'PARCEIRA',
  nome: 'Transportadora parceira',
  valor: 15,
  prazoEntrega: 0,
  company: 'Transportadora parceira',
  servico: 'Entrega regional',
};

export const PARTNER_CITIES_LABEL = PARTNER_CITIES.join(', ');

export async function lookupCepCity(cep: string): Promise<{ city: string; state: string } | null> {
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const d = await r.json();
    if (d?.erro) return null;
    return { city: d.localidade || '', state: d.uf || '' };
  } catch {
    return null;
  }
}
