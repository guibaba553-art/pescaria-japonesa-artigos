import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { CartProvider, useCart } from '@/hooks/useCart';

// Mock do Supabase
const mockMaybeSingle = vi.fn().mockResolvedValue({ data: { stock: 50 }, error: null });

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: mockMaybeSingle,
        })),
      })),
    })),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Limpa localStorage entre testes
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mockMaybeSingle.mockResolvedValue({ data: { stock: 50 }, error: null });
});

describe('CartProvider — abertura ao adicionar item', () => {
  it('deve expor lastAddedKey após adicionar um item', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <CartProvider>{children}</CartProvider>
    );

    const { result } = renderHook(() => useCart(), { wrapper });

    // Inicialmente null
    expect(result.current.lastAddedKey).toBeNull();

    // Adiciona um item
    await act(async () => {
      await result.current.addItem({
        id: 'prod-1',
        name: 'Produto Teste',
        price: 10,
        image_url: null,
      }, 1);
    });

    // Deve ter sido atualizado
    expect(result.current.lastAddedKey).toBe('prod-1');
  });

  it('deve expor lastAddedKey com variationId quando adiciona variação', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <CartProvider>{children}</CartProvider>
    );

    const { result } = renderHook(() => useCart(), { wrapper });

    await act(async () => {
      await result.current.addItem({
        id: 'prod-1',
        name: 'Produto Teste',
        price: 10,
        image_url: null,
        variationId: 'var-1',
      }, 1);
    });

    expect(result.current.lastAddedKey).toBe('prod-1-var-1');
  });

  it('deve permitir limpar lastAddedKey via clearLastAdded', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <CartProvider>{children}</CartProvider>
    );

    const { result } = renderHook(() => useCart(), { wrapper });

    await act(async () => {
      await result.current.addItem({
        id: 'prod-1',
        name: 'Produto Teste',
        price: 10,
        image_url: null,
      }, 1);
    });

    expect(result.current.lastAddedKey).not.toBeNull();

    act(() => {
      result.current.clearLastAdded();
    });

    expect(result.current.lastAddedKey).toBeNull();
  });

  it('deve setar lastAddedKey também ao aumentar quantidade de item existente', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <CartProvider>{children}</CartProvider>
    );

    const { result } = renderHook(() => useCart(), { wrapper });

    // Adiciona pela primeira vez
    await act(async () => {
      await result.current.addItem({
        id: 'prod-1',
        name: 'Produto Teste',
        price: 10,
        image_url: null,
      }, 1);
    });

    expect(result.current.lastAddedKey).toBe('prod-1');
    act(() => result.current.clearLastAdded());
    expect(result.current.lastAddedKey).toBeNull();

    // Adiciona novamente o mesmo produto (aumenta quantidade)
    await act(async () => {
      await result.current.addItem({
        id: 'prod-1',
        name: 'Produto Teste',
        price: 10,
        image_url: null,
      }, 1);
    });

    // Deve setar lastAddedKey mesmo para item já existente
    expect(result.current.lastAddedKey).toBe('prod-1');
  });
});
