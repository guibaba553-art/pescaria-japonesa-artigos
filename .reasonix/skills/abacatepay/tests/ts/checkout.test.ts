import { createCheckout, listCheckouts, getCheckout } from '../examples/ts/checkout';

// Mock the AbacatePay SDK
jest.mock('@abacatepay/sdk', () => ({
  default: jest.fn(() => ({
    checkout: {
      create: jest.fn(),
      list: jest.fn(),
      get: jest.fn(),
    },
  })),
}));

const AbacatePay = require('@abacatepay/sdk');

describe('Checkout Functions', () => {
  let mockAbacate: any;

  beforeEach(() => {
    mockAbacate = {
      checkout: {
        create: jest.fn(),
        list: jest.fn(),
        get: jest.fn(),
      },
    };
    (AbacatePay.default as jest.Mock).mockReturnValue(mockAbacate);
  });

  test('createCheckout should call abacate.checkout.create', async () => {
    const mockResponse = { id: '123', url: 'http://example.com' };
    mockAbacate.checkout.create.mockResolvedValue(mockResponse);

    const result = await createCheckout();

    expect(mockAbacate.checkout.create).toHaveBeenCalledWith({
      items: [{ id: 'prod_456', quantity: 2 }],
      customer: {
        name: 'Victor Albuquerque',
        email: 'contact@albuquerquesz.com',
        cellphone: '+5511999999999',
        taxId: '12345678900',
      },
      externalId: 'pedido-123',
      returnUrl: 'https://links.albuquerquesz.com.br',
      completionUrl: 'https://me.albuquerquesz.com.br',
    });
    expect(result).toEqual(mockResponse);
  });

  test('listCheckouts should call abacate.checkout.list', async () => {
    const mockResponse = { data: [] };
    mockAbacate.checkout.list.mockResolvedValue(mockResponse);

    const result = await listCheckouts();

    expect(mockAbacate.checkout.list).toHaveBeenCalled();
    expect(result).toEqual(mockResponse);
  });

  test('getCheckout should call abacate.checkout.get', async () => {
    const mockResponse = { id: '123', url: 'http://example.com' };
    mockAbacate.checkout.get.mockResolvedValue(mockResponse);

    const result = await getCheckout('123');

    expect(mockAbacate.checkout.get).toHaveBeenCalledWith({ id: '123' });
    expect(result).toEqual(mockResponse);
  });
});