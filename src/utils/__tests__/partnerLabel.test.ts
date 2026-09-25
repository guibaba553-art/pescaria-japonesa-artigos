import { describe, it, expect } from 'vitest';
import { buildPartnerLabelData, isPartnerShippingOrder } from '../partnerLabel';

const order = {
  id: 'bad376d8-4f2c-4bc1-ba4e-47f3ad4faf4d',
  created_at: '2026-09-25T13:04:00Z',
  delivery_type: 'delivery',
  shipping_service_id: null,
  shipping_cost: 15,
  total_amount: 25,
  shipping_recipient_name: 'João Silva',
  shipping_recipient_phone: '66999990000',
  shipping_street: 'Rua das Flores',
  shipping_number: '348',
  shipping_complement: 'Casa',
  shipping_neighborhood: 'Centro',
  shipping_city: 'Nova Bandeirantes',
  shipping_uf: 'MT',
  shipping_cep: '78565000',
  shipping_address: '',
  order_items: [{ quantity: 2 }, { quantity: 1 }],
};

describe('partnerLabel', () => {
  it('identifica pedido da transportadora parceira', () => {
    expect(isPartnerShippingOrder(order)).toBe(true);
    expect(isPartnerShippingOrder({ ...order, shipping_service_id: 1 })).toBe(false);
    expect(isPartnerShippingOrder({ ...order, delivery_type: 'pickup' })).toBe(false);
  });

  it('monta os dados da etiqueta', () => {
    const d = buildPartnerLabelData(order);
    expect(d.orderCode).toBe('BAD376D8');
    expect(d.recipient.name).toBe('João Silva');
    expect(d.recipient.line1).toBe('Rua das Flores, 348 — Casa');
    expect(d.recipient.line2).toBe('Centro — Nova Bandeirantes/MT');
    expect(d.recipient.cep).toBe('78565-000');
    expect(d.recipient.phone).toBe('(66) 99999-0000');
    expect(d.freight).toBe(15);
    expect(d.itemCount).toBe(3);
  });
});
