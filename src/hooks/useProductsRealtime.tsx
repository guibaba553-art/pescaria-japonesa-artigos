import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Subscribe to realtime changes on products and product_variations
 * and call `onChange` (debounced) whenever stock/price/etc changes.
 * Also refetches when the tab regains focus/visibility.
 */
export function useProductsRealtime(onChange: () => void, channelName = 'products-stock') {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onChangeRef.current(), 400);
    };

    const channel = supabase
      .channel(`${channelName}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_variations' }, schedule)
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === 'visible') schedule();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', schedule);

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', schedule);
    };
  }, [channelName]);
}
