import { describe, it, expect } from 'vitest';
import { classifyDeliveryCity, PARTNER_SHIPPING_OPTION, PARTNER_CITIES } from '../partnerDelivery';

describe('classifyDeliveryCity', () => {
  it('reconhece cidades atendidas ignorando acentos e caixa', () => {
    expect(classifyDeliveryCity('Itaúba', 'MT')).toBe('partner');
    expect(classifyDeliveryCity('matupá', 'mt')).toBe('partner');
    expect(classifyDeliveryCity('Guarantã do Norte', 'MT')).toBe('partner');
    expect(classifyDeliveryCity('Nova Canaã do Norte', 'MT')).toBe('partner');
    expect(classifyDeliveryCity('Santa Carmem', 'MT')).toBe('partner');
    expect(classifyDeliveryCity('Colíder', 'MT')).toBe('partner');
    expect(classifyDeliveryCity('Vera', 'MT')).toBe('partner');
    expect(classifyDeliveryCity('Nova Bandeirantes', 'MT')).toBe('partner');
  });

  it('Sinop vai para retirada na loja', () => {
    expect(classifyDeliveryCity('Sinop', 'MT')).toBe('pickup');
  });

  it('outras cidades ou estados não são atendidas', () => {
    expect(classifyDeliveryCity('Cuiabá', 'MT')).toBe('unsupported');
    expect(classifyDeliveryCity('Santa Helena', 'PR')).toBe('unsupported');
    expect(classifyDeliveryCity('', '')).toBe('unsupported');
  });

  it('frete fixo de R$ 15', () => {
    expect(PARTNER_SHIPPING_OPTION.valor).toBe(15);
    expect(PARTNER_CITIES.length).toBe(20);
  });
});
