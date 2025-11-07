import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { nfeData, margemLucro } = await req.json();
    
    if (!nfeData || !margemLucro) {
      throw new Error('NFe data and profit margin are required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Processing NFe entrada with', nfeData.produtos.length, 'products');
    console.log('Profit margin:', margemLucro, '%');

    // Calcular frete proporcional por produto baseado no valor
    const valorTotalProdutos = nfeData.produtos.reduce((sum: number, p: any) => sum + p.valor_total, 0);
    const freteTotal = nfeData.valor_frete || 0;

    const produtosProcessados = [];

    for (const produto of nfeData.produtos) {
      // Calcular frete proporcional deste produto
      const freteProporcional = (produto.valor_total / valorTotalProdutos) * freteTotal;
      
      // Calcular impostos totais do produto
      const impostosTotal = (produto.icms || 0) + (produto.ipi || 0) + (produto.pis || 0) + (produto.cofins || 0);
      
      // Custo total = valor do produto + impostos + frete proporcional
      const custoTotal = produto.valor_unitario + (impostosTotal / produto.quantidade) + (freteProporcional / produto.quantidade);
      
      // Preço de venda = custo * (1 + margem/100)
      const precoVenda = custoTotal * (1 + margemLucro / 100);

      console.log(`Produto: ${produto.nome}`);
      console.log(`  Valor unitário: R$ ${produto.valor_unitario.toFixed(2)}`);
      console.log(`  Impostos/unid: R$ ${(impostosTotal / produto.quantidade).toFixed(2)}`);
      console.log(`  Frete/unid: R$ ${(freteProporcional / produto.quantidade).toFixed(2)}`);
      console.log(`  Custo total/unid: R$ ${custoTotal.toFixed(2)}`);
      console.log(`  Preço venda: R$ ${precoVenda.toFixed(2)}`);

      // Verificar se produto já existe pelo SKU ou nome
      let produtoExistente = null;
      if (produto.sku) {
        const { data } = await supabase
          .from('products')
          .select('*')
          .eq('sku', produto.sku)
          .maybeSingle();
        produtoExistente = data;
      }

      if (!produtoExistente) {
        const { data } = await supabase
          .from('products')
          .select('*')
          .ilike('name', produto.nome)
          .maybeSingle();
        produtoExistente = data;
      }

      if (produtoExistente) {
        // Atualizar estoque e preço do produto existente
        const novoEstoque = produtoExistente.stock + produto.quantidade;
        const { error: updateError } = await supabase
          .from('products')
          .update({
            stock: novoEstoque,
            price: precoVenda,
            updated_at: new Date().toISOString()
          })
          .eq('id', produtoExistente.id);

        if (updateError) throw updateError;

        console.log(`  ✓ Produto atualizado (estoque: ${novoEstoque})`);
        produtosProcessados.push({
          ...produtoExistente,
          stock: novoEstoque,
          price: precoVenda,
          acao: 'atualizado'
        });
      } else {
        // Criar novo produto
        const { data: novoProduto, error: insertError } = await supabase
          .from('products')
          .insert({
            name: produto.nome,
            description: `${produto.nome} - NCM: ${produto.ncm || 'N/A'}`,
            short_description: produto.nome,
            price: precoVenda,
            category: 'Geral',
            stock: produto.quantidade,
            sku: produto.sku || undefined,
            featured: false,
            on_sale: false,
            include_in_nfe: true
          })
          .select()
          .single();

        if (insertError) throw insertError;

        console.log(`  ✓ Produto criado`);
        produtosProcessados.push({
          ...novoProduto,
          acao: 'criado'
        });
      }
    }

    // Registrar a NFe de entrada
    const { data: nfeEmission, error: nfeError } = await supabase
      .from('nfe_emissions')
      .insert({
        order_id: null,
        tipo: 'entrada',
        fornecedor_nome: nfeData.fornecedor.nome,
        fornecedor_cnpj: nfeData.fornecedor.cnpj,
        nfe_number: nfeData.numero,
        nfe_key: nfeData.chave_acesso || null,
        status: 'success',
        emitted_at: nfeData.data_emissao
      })
      .select()
      .single();

    if (nfeError) throw nfeError;

    console.log('NFe entrada registrada com sucesso');

    return new Response(
      JSON.stringify({
        success: true,
        produtos: produtosProcessados,
        nfe_emission: nfeEmission,
        message: `${produtosProcessados.length} produto(s) processado(s) com sucesso`
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Error processing NFe entrada:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Erro desconhecido ao processar NFe de entrada' 
      }),
      { 
        status: 500, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});