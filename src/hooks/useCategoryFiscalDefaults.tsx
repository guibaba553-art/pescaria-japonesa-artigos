import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CategoryFiscalDefault {
  category: string;
  ncm: string | null;
  cest: string | null;
  cfop: string | null;
  csosn: string | null;
  origem: string | null;
  unidade_comercial: string | null;
}

/**
 * Hook que carrega os padrões fiscais por categoria.
 * Usado para auto-preencher NCM/CFOP/CSOSN ao cadastrar/editar produto.
 */
export function useCategoryFiscalDefaults() {
  const [defaults, setDefaults] = useState<Record<string, CategoryFiscalDefault>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('category_fiscal_defaults')
        .select('category, ncm, cest, cfop, csosn, origem, unidade_comercial');
      if (!error && data) {
        const map: Record<string, CategoryFiscalDefault> = {};
        data.forEach((d: any) => { map[d.category] = d; });
        setDefaults(map);
      }
      setLoading(false);
    })();
  }, []);

  /** Devolve os defaults da categoria (ou null se não houver). */
  const getDefaults = (category: string | undefined | null): CategoryFiscalDefault | null => {
    if (!category) return null;
    return defaults[category] ?? null;
  };

  return { defaults, getDefaults, loading };
}
