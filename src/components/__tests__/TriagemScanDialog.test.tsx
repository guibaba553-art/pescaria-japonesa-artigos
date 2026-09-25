import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TriagemScanDialog, type TriagemOrder } from '@/components/TriagemScanDialog';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ isAdmin: false }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/MelhorEnvioLabelDialog', () => ({ MelhorEnvioLabelDialog: () => null }));

describe('TriagemScanDialog', () => {
  it('mostra o nome inteiro do produto e da variação sem truncar', () => {
    const order: TriagemOrder = {
      id: 'pedido-1', total_amount: 25, shipping_cost: 15, shipping_address: '', shipping_cep: '',
      status: 'em_preparo', delivery_type: 'delivery', source: 'site', created_at: '2026-09-25T00:00:00Z',
      user_id: 'cliente-1',
      order_items: [{
        id: 'item-1', quantity: 1, price_at_purchase: 25, product_id: 'produto-1',
        products: { name: 'ANZOL CHINU ENCAST BLACK SEM GIRADOR 100 UNI', image_url: null, sku: '123' },
        product_variations: { name: 'TAMANHO 10', sku: null },
      }],
    };

    render(<TriagemScanDialog open onOpenChange={vi.fn()} order={order} mode="pickup" onCompleted={vi.fn()} />);

    const name = screen.getByText(/ANZOL CHINU ENCAST BLACK SEM GIRADOR 100 UNI/);
    expect(name.textContent).toContain('TAMANHO 10');
    expect(name.className).not.toContain('truncate');
    expect(name.className).toContain('break-words');
  });
});