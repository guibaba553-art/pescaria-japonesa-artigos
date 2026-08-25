import { supabase } from '@/integrations/supabase/client';

export const PIX_GATEWAY_TIMEOUT_MS = 25_000;

export interface InvokeResult<T> {
  data: T | null;
  error: { message: string } | null;
}

export async function invokeWithTimeout<T = any>(
  fnName: string,
  options?: { body?: Record<string, unknown>; timeoutMs?: number },
): Promise<InvokeResult<T>> {
  const timeoutMs = options?.timeoutMs ?? PIX_GATEWAY_TIMEOUT_MS;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<InvokeResult<T>>((resolve) => {
    timer = setTimeout(
      () => resolve({ data: null, error: { message: 'timeout' } }),
      timeoutMs,
    );
  });

  try {
    const result = await Promise.race([
      supabase.functions.invoke<T>(fnName, { body: options?.body }),
      timeoutPromise,
    ]);
    return result;
  } catch (err: any) {
    return { data: null, error: { message: err?.message || String(err) } };
  } finally {
    clearTimeout(timer);
  }
}
