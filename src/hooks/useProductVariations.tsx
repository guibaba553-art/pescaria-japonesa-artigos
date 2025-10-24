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
   * Estratégia: sempre deleta e recria para evitar duplicações
   */
  const saveVariations = async (
    targetProductId: string, 
    variationsToSave: ProductVariation[]
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log(`=== SALVANDO VARIAÇÕES ===`);
      console.log(`Produto ID: ${targetProductId}`);
      console.log(`Número de variações a salvar: ${variationsToSave.length}`);
      
      // SEMPRE deletar variações existentes primeiro
      console.log('Deletando todas as variações existentes...');
      const { error: deleteError } = await supabase
        .from('product_variations')
        .delete()
        .eq('product_id', targetProductId);
      
      if (deleteError) {
        console.error('Erro ao deletar variações:', deleteError);
        return { 
          success: false, 
          error: `Erro ao limpar variações antigas: ${deleteError.message}` 
        };
      }
      console.log('Variações antigas deletadas com sucesso');

      // Inserir novas variações (se houver)
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
            error: `Erro ao salvar novas variações: ${insertError.message}` 
          };
        }
        console.log(`✅ ${variationsToInsert.length} variações inseridas com sucesso`);
      } else {
        console.log('✅ Nenhuma variação para inserir (produto sem variações)');
      }

      console.log('=== VARIAÇÕES SALVAS COM SUCESSO ===');
      return { success: true };
    } catch (error: any) {
      console.error('=== ERRO AO SALVAR VARIAÇÕES ===', error);
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
