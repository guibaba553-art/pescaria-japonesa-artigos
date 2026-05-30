import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ProductVariation } from '@/types/product';
import { parseOptionalMeasurementInput } from '@/utils/productMeasurements';

/**
 * Hook centralizado para gerenciar variações de produtos
 * Corrigido para evitar loops infinitos de carregamento
 */
export function useProductVariations(productId?: string) {
  const [variations, setVariations] = useState<ProductVariation[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  /**
   * Carrega variações do banco de dados
   * useCallback para evitar loops infinitos
   */
  const loadVariations = useCallback(async (id?: string) => {
    const targetId = id || productId;
    if (!targetId) {
      setVariations([]);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('product_variations')
        .select('*')
        .eq('product_id', targetId)
        .order('name', { ascending: true });
      
      if (error) {
        console.error('❌ Erro ao carregar variações:', error);
        toast({
          title: 'Erro',
          description: 'Não foi possível carregar as variações',
          variant: 'destructive'
        });
        setVariations([]);
        return;
      }
      
      setVariations(data || []);
      console.log(`✅ ${data?.length || 0} variações carregadas`);
    } catch (error) {
      console.error('❌ Erro inesperado ao carregar variações:', error);
      setVariations([]);
    } finally {
      setLoading(false);
    }
  }, [productId, toast]);

  /**
   * Salva variações no banco de dados PRESERVANDO IDs existentes.
   *
   * IMPORTANTE: NUNCA fazer DELETE + INSERT em massa aqui. Cada variação
   * tem um UUID referenciado por:
   *  - purchase_list_items.variation_id
   *  - order_items.variation_id
   *  - itens salvos no carrinho do site (localStorage)
   *  - product_label_pending.variation_id
   *  - dismissed_stock_alerts.variation_id
   * Se a gente apaga e recria, todos esses ponteiros viram órfãos.
   *
   * Estratégia (diff):
   *  1. Variações com `id` existente → UPDATE (mantém o mesmo UUID)
   *  2. Variações sem `id` (novas no form) → INSERT
   *  3. IDs que existiam no banco e sumiram do form → DELETE
   */
  const saveVariations = useCallback(async (
    targetProductId: string,
    variationsToSave: ProductVariation[]
  ): Promise<{ success: boolean; error?: string }> => {
    console.log('=== SALVANDO VARIAÇÕES (modo diff, preserva IDs) ===');
    console.log('Produto:', targetProductId);
    console.log('Variações no form:', variationsToSave.length);

    const buildPayload = (v: ProductVariation) => ({
      product_id: targetProductId,
      name: v.name.trim(),
      price: Number(v.price),
      price_pdv: v.price_pdv != null && !isNaN(Number(v.price_pdv)) ? Number(v.price_pdv) : null,
      stock: Number(v.stock),
      description: v.description?.trim() || null,
      sku: v.sku?.trim() || null,
      image_url: v.image_url || null,
      weight_grams: parseOptionalMeasurementInput(v.weight_grams, 'int'),
      length_cm: parseOptionalMeasurementInput(v.length_cm, 'float'),
      width_cm: parseOptionalMeasurementInput(v.width_cm, 'float'),
      height_cm: parseOptionalMeasurementInput(v.height_cm, 'float'),
      min_stock: v.min_stock != null ? Number(v.min_stock) : 0,
      cost: v.cost != null ? Number(v.cost) : null,
      min_sale_price: v.min_sale_price != null ? Number(v.min_sale_price) : null,
      cost_group_id: (v as any).cost_group_id || null,
      freight_pct: v.freight_pct != null ? Number(v.freight_pct) : 0,
      op_cost_pct: v.op_cost_pct != null ? Number(v.op_cost_pct) : 0,
      tax_pct: v.tax_pct != null ? Number(v.tax_pct) : 0,
    });

    try {
      // Carrega IDs atualmente no banco para esse produto
      const { data: existingRows, error: loadErr } = await supabase
        .from('product_variations')
        .select('id')
        .eq('product_id', targetProductId);
      if (loadErr) {
        return { success: false, error: `Erro ao ler variações atuais: ${loadErr.message}` };
      }
      const existingIds = new Set((existingRows ?? []).map((r: any) => r.id as string));

      const toUpdate = variationsToSave.filter(v => v.id && existingIds.has(v.id));
      const toInsert = variationsToSave.filter(v => !v.id || !existingIds.has(v.id));
      const keepIds = new Set(toUpdate.map(v => v.id as string));
      const toDeleteIds = Array.from(existingIds).filter(id => !keepIds.has(id));

      console.log(`📝 update=${toUpdate.length} insert=${toInsert.length} delete=${toDeleteIds.length}`);

      // 1) UPDATE preservando ID
      for (const v of toUpdate) {
        const { error: upErr } = await supabase
          .from('product_variations')
          .update(buildPayload(v))
          .eq('id', v.id!);
        if (upErr) {
          return { success: false, error: `Erro ao atualizar "${v.name}": ${upErr.message}` };
        }
      }

      // 2) INSERT das novas
      if (toInsert.length > 0) {
        const { error: insErr } = await supabase
          .from('product_variations')
          .insert(toInsert.map(buildPayload));
        if (insErr) {
          return { success: false, error: `Erro ao inserir variações: ${insErr.message}` };
        }
      }

      // 3) DELETE apenas as que sumiram do form
      if (toDeleteIds.length > 0) {
        const { error: delErr } = await supabase
          .from('product_variations')
          .delete()
          .in('id', toDeleteIds);
        if (delErr) {
          return { success: false, error: `Erro ao remover variações antigas: ${delErr.message}` };
        }
      }

      console.log('=== SALVAMENTO CONCLUÍDO (IDs preservados) ===');
      return { success: true };

    } catch (error: any) {
      console.error('❌ Erro inesperado:', error);
      return {
        success: false, 
        error: error.message || 'Erro desconhecido' 
      };
    }
  }, []);

  /**
   * Reseta o estado local de variações
   */
  const resetVariations = useCallback(() => {
    setVariations([]);
  }, []);

  // Autoload quando productId muda
  // Removida a dependência loadVariations para evitar loop
  useEffect(() => {
    if (productId) {
      loadVariations(productId);
    } else {
      setVariations([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  return {
    variations,
    setVariations,
    loading,
    loadVariations,
    saveVariations,
    resetVariations
  };
}

