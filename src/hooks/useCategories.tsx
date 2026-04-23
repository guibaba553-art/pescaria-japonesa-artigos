import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('display_order', { ascending: true });

    if (!error && data) {
      setCategories(data as Category[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();

    const channel = supabase
      .channel('categories-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categories' },
        () => load()
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
