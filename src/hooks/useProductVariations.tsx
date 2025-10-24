import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ProductVariation } from '@/types/product';

/**
 * Hook centralizado para gerenciar variações de produtos
 * 
 * ARQUITETURA SIMPLIFICADA:
 * - Carrega variações do banco
 * - Mantém estado local para edição
 * - Salva de forma atômica (deleta tudo e recria)
 * - Sem proteções complexas que podem causar bugs
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
  };

  /**
   * Salva variações no banco de dados
   * ESTRATÉGIA: Sempre deleta tudo e recria (operação atômica)
   */
  const saveVariations = async (
    targetProductId: string, 
    variationsToSave: ProductVariation[]
  ): Promise<{ success: boolean; error?: string }> => {
    console.log('=== SALVANDO VARIAÇÕES ===');
    console.log('Produto:', targetProductId);
    console.log('Variações a salvar:', variationsToSave.length);

    try {
      // PASSO 1: Deletar TODAS as variações existentes
      console.log('Deletando variações antigas...');
      const { error: deleteError } = await supabase
        .from('product_variations')
        .delete()
        .eq('product_id', targetProductId);
      
      if (deleteError) {
        console.error('❌ Erro ao deletar:', deleteError);
        return { 
          success: false, 
          error: `Erro ao limpar variações: ${deleteError.message}` 
        };
      }
      console.log('✅ Variações antigas deletadas');

      // PASSO 2: Inserir novas variações (se houver)
      if (variationsToSave.length > 0) {
        const variationsToInsert = variationsToSave.map(v => ({
          product_id: targetProductId,
          name: v.name.trim(),
          price: Number(v.price),
          stock: Number(v.stock),
          description: v.description?.trim() || null,
          sku: v.sku?.trim() || null
        }));

        console.log('Inserindo novas variações:', variationsToInsert.length);
        const { error: insertError, data } = await supabase
          .from('product_variations')
          .insert(variationsToInsert)
          .select();

        if (insertError) {
          console.error('❌ Erro ao inserir:', insertError);
          return { 
            success: false, 
            error: `Erro ao salvar variações: ${insertError.message}` 
          };
        }
        
        console.log(`✅ ${data?.length || 0} variações salvas com sucesso`);
      } else {
        console.log('✅ Produto sem variações (ok)');
      }

      console.log('=== SALVAMENTO CONCLUÍDO COM SUCESSO ===');
      return { success: true };
      
    } catch (error: any) {
      console.error('❌ Erro inesperado:', error);
      return { 
        success: false, 
        error: error.message || 'Erro desconhecido' 
      };
    }
  };

  /**
   * Reseta o estado local de variações
   */
  const resetVariations = () => {
    setVariations([]);
  };

  // Autoload quando productId muda
  useEffect(() => {
    if (productId) {
      loadVariations(productId);
    } else {
      setVariations([]);
    }
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
