import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

let categoriesCache: Category[] | null = null;
let categoriesPromise: Promise<Category[]> | null = null;

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  display_order: number;
  parent_id: string | null;
  is_primary: boolean;
}

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(() => !categoriesCache);

  const load = async (force = false) => {
    if (!force && categoriesCache) {
      setCategories(categoriesCache);
      setLoading(false);
      return;
    }

    setLoading(true);

    if (!force && categoriesPromise) {
      const sharedData = await categoriesPromise;
      setCategories(sharedData);
      setLoading(false);
      return;
    }

    categoriesPromise = supabase
      .from('categories')
      .select('*')
      .order('display_order', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) {
          categoriesCache = data as Category[];
        }
        return categoriesCache ?? [];
      })
      .finally(() => {
        categoriesPromise = null;
      });

    const nextCategories = await categoriesPromise;
    setCategories(nextCategories);
    setLoading(false);
  };

  useEffect(() => {
    load();

    const channel = supabase
      .channel('categories-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categories' },
        () => {
          categoriesCache = null;
          load(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Helpers
  const primaries = categories.filter((c) => c.is_primary);
  const subcategories = categories.filter((c) => !c.is_primary);
  const getSubcategoriesOf = (primaryId: string) =>
    categories.filter((c) => c.parent_id === primaryId);
  const getPrimaryByName = (name: string) =>
    categories.find((c) => c.is_primary && c.name === name);

  return {
    categories,
    primaries,
    subcategories,
    getSubcategoriesOf,
    getPrimaryByName,
    loading,
    reload: load,
  };
}
