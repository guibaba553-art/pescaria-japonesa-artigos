import { supabase } from '@/integrations/supabase/client';

export interface CustomerTier {
  id: string;
  name: string;
  min_score: number;
  max_score: number | null;
  discount_percent: number;
  block_purchase: boolean;
  allow_discount: boolean;
  perks: string | null;
  color: string;
  sort_order: number;
}

let tiersCache: CustomerTier[] | null = null;
let tiersPromise: Promise<CustomerTier[]> | null = null;

export async function loadTiers(force = false): Promise<CustomerTier[]> {
  if (!force && tiersCache) return tiersCache;
  if (!force && tiersPromise) return tiersPromise;
  tiersPromise = (async () => {
    const { data, error } = await supabase
      .from('customer_tiers')
      .select('*')
      .order('sort_order');
    if (error) {
      console.error('Erro ao carregar tiers:', error);
      return [];
    }
    tiersCache = (data as CustomerTier[]) || [];
    return tiersCache;
  })();
  const r = await tiersPromise;
  tiersPromise = null;
  return r;
}

export function getTierForScore(tiers: CustomerTier[], score: number): CustomerTier | null {
  const s = Number.isFinite(score) ? score : 0;
  return (
    tiers.find(
      (t) => s >= t.min_score && (t.max_score === null || s <= t.max_score),
    ) || null
  );
}

export async function getCustomerTier(score: number): Promise<CustomerTier | null> {
  const tiers = await loadTiers();
  return getTierForScore(tiers, score);
}

export function clearTiersCache() {
  tiersCache = null;
}
