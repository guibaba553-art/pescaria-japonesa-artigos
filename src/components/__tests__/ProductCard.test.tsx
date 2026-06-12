import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Product } from '@/types/product';

// ─── Mocks ────────────────────────────────────────────────

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ProductQuantitySelector', () => ({
  ProductQuantitySelector: () => <div data-testid="quantity-selector" />,
}));

vi.mock('@/assets/duck-easter-egg.gif', () => ({ default: 'duck.gif' }));

vi.mock('lucide-react', () => ({
  ShoppingCart: () => <span data-testid="cart-icon">🛒</span>,
  Truck: () => <span data-testid="truck-icon">🚚</span>,
}));

// ─── Import after mocks ───────────────────────────────────
const { ProductCard } = await import('../ProductCard');

describe('ProductCard — promoção expirada', () => {
  const baseProduct = {
    id: 'prod-1',
    name: 'Vara de Pesca',
    description: 'Vara resistente',
    price: 100,
    category: 'Varas',
    image_url: null,
    rating: 4.5,
    stock: 10,
    featured: false,
    on_sale: true,
    sale_price: 50,
    sale_ends_at: '2020-01-01T00:00:00.000Z',
    minimum_quantity: 1,
    created_at: '2024-01-01T00:00:00.000Z',
  } as unknown as Product;

  const defaultProps = {
    quantity: 1,
    onQuantityChange: vi.fn(),
    onIncrement: vi.fn(),
    onDecrement: vi.fn(),
    onAddToCart: vi.fn(),
  };

  it('NÃO deve exibir badge de desconto quando sale_ends_at está no passado', () => {
    render(<ProductCard product={baseProduct} {...defaultProps} />);

    // O badge de desconto mostra "−XX%" — não deve aparecer para promo expirada
    expect(screen.queryByText(/% OFF/)).toBeNull();

    // O preço tachado (preço original riscado) não deve aparecer
    expect(screen.queryByText(/R\$ 100[,.]00/)).not.toBeNull(); // preço original deve aparecer como preço normal
    expect(screen.queryByText(/R\$ 50[,.]00/)).toBeNull(); // sale_price não deve ser exibido
  });

  it('deve exibir badge de desconto quando promo está ativa (sale_ends_at no futuro)', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const activeProduct = {
      ...baseProduct,
      sale_ends_at: future,
    } as unknown as Product;

    render(<ProductCard product={activeProduct} {...defaultProps} />);

    // O badge de desconto deve aparecer
    expect(screen.getByText(/% OFF/)).toBeDefined();
  });

  it('deve exibir badge de desconto quando sale_ends_at é nulo', () => {
    const noEndProduct = {
      ...baseProduct,
      sale_ends_at: null,
    } as unknown as Product;

    render(<ProductCard product={noEndProduct} {...defaultProps} />);

    // Promo sem prazo é considerada ativa → badge deve aparecer
    expect(screen.getByText(/% OFF/)).toBeDefined();
  });
});
