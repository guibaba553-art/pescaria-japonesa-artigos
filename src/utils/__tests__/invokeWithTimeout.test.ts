import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

import { invokeWithTimeout } from '@/utils/invokeWithTimeout';
import { supabase } from '@/integrations/supabase/client';

describe('invokeWithTimeout', () => {
  it('retorna o resultado quando o invoke responde antes do timeout', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({ data: { ok: true }, error: null });

    const r = await invokeWithTimeout('my-fn', { body: { a: 1 }, timeoutMs: 100 });

    expect(r).toEqual({ data: { ok: true }, error: null });
    expect(supabase.functions.invoke).toHaveBeenCalledWith('my-fn', { body: { a: 1 } });
  });

  it('propaga erro do invoke', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({ data: null, error: { message: 'boom' } });

    const r = await invokeWithTimeout('my-fn', { timeoutMs: 100 });

    expect(r.data).toBeNull();
    expect(r.error?.message).toBe('boom');
  });

  it('propaga exception do invoke como erro', async () => {
    (supabase.functions.invoke as any).mockRejectedValue(new Error('network down'));

    const r = await invokeWithTimeout('my-fn', { timeoutMs: 100 });

    expect(r.data).toBeNull();
    expect(r.error?.message).toBe('network down');
  });

  it('resolve erro de timeout quando o invoke demora demais', async () => {
    vi.useFakeTimers();
    (supabase.functions.invoke as any).mockReturnValue(new Promise(() => {}));

    const promise = invokeWithTimeout('my-fn', { timeoutMs: 50 });
    const expectation = expect(promise).resolves.toEqual({
      data: null,
      error: { message: 'timeout' },
    });
    await vi.advanceTimersByTimeAsync(60);
    await expectation;

    vi.useRealTimers();
  });

  it('usa o timeout padrão quando não informado', async () => {
    vi.useFakeTimers();
    (supabase.functions.invoke as any).mockReturnValue(new Promise(() => {}));

    const promise = invokeWithTimeout('my-fn');
    const expectation = expect(promise).resolves.toEqual({
      data: null,
      error: { message: 'timeout' },
    });
    await vi.advanceTimersByTimeAsync(25_001);
    await expectation;

    vi.useRealTimers();
  });

  it('invoca sem body quando options não é passado', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({ data: null, error: null });

    await invokeWithTimeout('my-fn', { timeoutMs: 100 });

    expect(supabase.functions.invoke).toHaveBeenCalledWith('my-fn', { body: undefined });
  });
});
