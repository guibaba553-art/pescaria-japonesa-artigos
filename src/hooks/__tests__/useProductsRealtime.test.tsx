import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useProductsRealtime } from '../useProductsRealtime';

// ─── Mocks com vi.hoisted (executa antes de vi.mock) ────
const { testChannel, testRemoveChannel } = vi.hoisted(() => {
  const ch = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn(),
  };
  const rm = vi.fn();
  return { testChannel: ch, testRemoveChannel: rm };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: vi.fn(() => testChannel),
    removeChannel: testRemoveChannel,
  },
}));

beforeEach(() => {
  testChannel.on.mockClear();
  testChannel.subscribe.mockClear();
  testRemoveChannel.mockClear();
});

afterEach(() => {
  // NÃO usar restoreAllMocks — ele destrói mockReturnThis nos mocks
  // compartilhados criados via vi.hoisted
});

describe('useProductsRealtime', () => {
  it('deve subscrever no canal products e product_variations', () => {
    const onChange = vi.fn();
    renderHook(() => useProductsRealtime(onChange, 'test-channel'));

    expect(testChannel.on).toHaveBeenCalledTimes(2);
    expect(testChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'products' },
      expect.any(Function),
    );
    expect(testChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'product_variations' },
      expect.any(Function),
    );
    expect(testChannel.subscribe).toHaveBeenCalled();
  });

  it('NAO deve adicionar listener de focus no window', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const onChange = vi.fn();

    renderHook(() => useProductsRealtime(onChange, 'test-channel'));

    // NENHUM listener de focus deve ser registrado no window
    const focusCalls = addEventListenerSpy.mock.calls.filter(
      ([event]) => event === 'focus',
    );
    expect(focusCalls).toHaveLength(0);

    addEventListenerSpy.mockRestore();
  });

  it('deve adicionar listener de visibilitychange no document', () => {
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
    const onChange = vi.fn();

    renderHook(() => useProductsRealtime(onChange, 'test-channel'));

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    );

    addEventListenerSpy.mockRestore();
  });

  it('deve remover listeners e canal no cleanup', () => {
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

    const onChange = vi.fn();
    const { unmount } = renderHook(() => useProductsRealtime(onChange, 'test-channel'));

    unmount();

    expect(testRemoveChannel).toHaveBeenCalled();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    );

    removeEventListenerSpy.mockRestore();
  });

  it('deve chamar onChange quando visibilityState for visible', async () => {
    const onChange = vi.fn();
    renderHook(() => useProductsRealtime(onChange, 'test-channel'));

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    });

    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(
      () => {
        expect(onChange).toHaveBeenCalled();
      },
      { timeout: 600 },
    );
  });
});
