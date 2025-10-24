import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ProductVariation } from '@/types/product';

/**
 * Hook para gerenciar variações de produtos
 * Centraliza toda a lógica de CRUD de variações
 */
export function useProductVariations(productId?: string) {
  const [variations, setVariations] = useState<ProductVariation[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  /**
   * Carrega variações do banco de dados
   */
  const loadVariations = async (id?: string) => {
    const targetId = id || productId;
    if (!targetId) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('product_variations')
        .select('*')
        .eq('product_id', targetId);
      
      if (error) {
        console.error('Erro ao carregar variações:', error);
        toast({
          title: 'Aviso',
          description: 'Não foi possível carregar as variações do produto',
          variant: 'destructive'
        });
        return;
      }
      
      if (data) {
        setVariations(data);
        console.log(`${data.length} variações carregadas para o produto ${targetId}`);
      } else {
        setVariations([]);
      }
    } catch (error) {
      console.error('Erro ao carregar variações:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Salva variações no banco de dados
   * Usa estratégia segura: valida antes de deletar
   */
  const saveVariations = async (
    targetProductId: string, 
    variationsToSave: ProductVariation[]
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log(`Salvando ${variationsToSave.length} variações para produto ${targetProductId}`);
      
      // Buscar variações existentes para validação
      const { data: existingVariations } = await supabase
        .from('product_variations')
        .select('id, name')
        .eq('product_id', targetProductId);
      
      console.log(`Variações existentes no banco: ${existingVariations?.length || 0}`);

      // PROTEÇÃO: Se tentando salvar 0 variações mas existem variações no banco
      // pode ser erro de carregamento - avisar e não processar
      if (variationsToSave.length === 0 && existingVariations && existingVariations.length > 0) {
        console.warn('AVISO: Tentativa de salvar com 0 variações, mas existem no banco. Mantendo existentes.');
        toast({
          title: 'Aviso',
          description: 'Não foi possível atualizar as variações. Elas foram mantidas.',
        });
        return { success: true }; // Retorna sucesso mas não faz nada
      }

      // Deletar variações existentes
      if (existingVariations && existingVariations.length > 0) {
        console.log('Deletando variações antigas...');
        const { error: deleteError } = await supabase
          .from('product_variations')
          .delete()
          .eq('product_id', targetProductId);
        
        if (deleteError) {
          console.error('Erro ao deletar variações:', deleteError);
          return { 
            success: false, 
            error: `Erro ao atualizar variações: ${deleteError.message}` 
          };
        }
        console.log('Variações antigas deletadas');
      }

      // Inserir novas variações
      if (variationsToSave.length > 0) {
        const variationsToInsert = variationsToSave.map(v => ({
          product_id: targetProductId,
          name: v.name,
          price: v.price,
          stock: v.stock,
          description: v.description || null,
          sku: v.sku || null
        }));

        console.log('Inserindo novas variações:', variationsToInsert);
        const { error: insertError } = await supabase
          .from('product_variations')
          .insert(variationsToInsert);

        if (insertError) {
          console.error('Erro ao inserir variações:', insertError);
          return { 
            success: false, 
            error: `Erro ao salvar variações: ${insertError.message}` 
          };
        }
        console.log(`${variationsToInsert.length} variações inseridas com sucesso`);
      }

      return { success: true };
    } catch (error: any) {
      console.error('Erro ao salvar variações:', error);
      return { 
        success: false, 
        error: error.message || 'Erro desconhecido ao salvar variações' 
      };
    }
  };

  /**
   * Adiciona uma nova variação localmente
   */
  const addVariation = (variation: Omit<ProductVariation, 'id' | 'product_id'>) => {
    const newVariation: ProductVariation = {
      ...variation,
      id: `temp-${Date.now()}`,
      product_id: productId || '',
    };
    setVariations(prev => [...prev, newVariation]);
  };

  /**
   * Atualiza uma variação existente localmente
   */
  const updateVariation = (variationId: string, updates: Partial<ProductVariation>) => {
    setVariations(prev => 
      prev.map(v => v.id === variationId ? { ...v, ...updates } : v)
    );
  };

  /**
   * Remove uma variação localmente
   */
  const removeVariation = (variationId: string) => {
    setVariations(prev => prev.filter(v => v.id !== variationId));
  };

  /**
   * Reseta as variações para um array vazio
   */
  const resetVariations = () => {
    setVariations([]);
  };

  // Carregar automaticamente quando productId muda
  useEffect(() => {
    if (productId) {
      loadVariations(productId);
    }
  }, [productId]);

  return {
    variations,
    setVariations,
    loading,
    loadVariations,
    saveVariations,
    addVariation,
    updateVariation,
    removeVariation,
    resetVariations
  };
}
