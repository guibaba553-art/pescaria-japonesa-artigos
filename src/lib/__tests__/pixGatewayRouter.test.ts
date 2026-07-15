import { describe, it, expect } from 'vitest';
import { selectPixGateway, BREAK_EVEN } from '../pixGatewayRouter';

describe('pixGatewayRouter', () => {
  describe('selectPixGateway — roteamento por valor', () => {
    // Break-even: ~R$ 201,01

    it('pedidos muito pequenos → Mercado Pago (mais barato)', () => {
      expect(selectPixGateway(10)).toBe('mercadopago');
      expect(selectPixGateway(50)).toBe('mercadopago');
      expect(selectPixGateway(100)).toBe('mercadopago');
    });

    it('pedidos médios abaixo do break-even → Mercado Pago', () => {
      expect(selectPixGateway(150)).toBe('mercadopago');
      expect(selectPixGateway(200)).toBe('mercadopago');
    });

    it('pedido no break-even → Asaas (valor exato ou acima)', () => {
      // 200.99 → ainda abaixo do break-even (201.01)
      expect(selectPixGateway(200.99)).toBe('mercadopago');
      // 201.01 → exatamente no break-even, opta por Asaas
      expect(selectPixGateway(BREAK_EVEN)).toBe('asaas');
    });

    it('pedidos grandes → Asaas (taxa fixa R$ 1,99 compensa)', () => {
      expect(selectPixGateway(300)).toBe('asaas');
      expect(selectPixGateway(500)).toBe('asaas');
      expect(selectPixGateway(1000)).toBe('asaas');
      expect(selectPixGateway(5000)).toBe('asaas');
    });

    it('pedido com valor zero ou negativo → Mercado Pago (safety fallback)', () => {
      expect(selectPixGateway(0)).toBe('mercadopago');
      expect(selectPixGateway(-1)).toBe('mercadopago');
    });

    it('aceita threshold customizado', () => {
      // Com threshold de R$ 500, R$ 300 → Mercado Pago
      expect(selectPixGateway(300, 500)).toBe('mercadopago');
      // Mesmo pedido com threshold padrão → Asaas
      expect(selectPixGateway(300)).toBe('asaas');
    });

    it('com threshold customizado zerado, tudo vai para Asaas', () => {
      expect(selectPixGateway(10, 0)).toBe('asaas');
    });
  });

  describe('BREAK_EVEN constante', () => {
    it('deve ser aproximadamente R$ 201', () => {
      expect(BREAK_EVEN).toBeCloseTo(201.01, 1);
    });

    it('deve ser positivo', () => {
      expect(BREAK_EVEN).toBeGreaterThan(0);
    });
  });
});
