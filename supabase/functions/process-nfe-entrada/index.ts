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
    const { nfeData } = await req.json();
    
    if (!nfeData) {
      throw new Error('NFe data is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Processing NFe entrada with', nfeData.produtos.length, 'products');

    // Calcular frete proporcional por produto baseado no valor
    const valorTotalProdutos = nfeData.produtos.reduce((sum: number, p: any) => sum + p.valor_total, 0);
    const freteTotal = nfeData.valor_frete || 0;

    const produtosProcessados = [];

    for (const produto of nfeData.produtos) {
      // Margem individual do produto ou 30% padrão
      const margemLucro = produto.margem_lucro || 30;
      
      // Calcular frete proporcional deste produto
      const freteProporcional = (produto.valor_total / valorTotalProdutos) * freteTotal;
      
      // Calcular impostos totais do produto
      const impostosTotal = (produto.icms || 0) + (produto.ipi || 0) + (produto.pis || 0) + (produto.cofins || 0);
      
      // Custo unitário da nova entrada = valor do produto + impostos + frete proporcional
      const custoNovaEntrada = produto.valor_unitario + (impostosTotal / produto.quantidade) + (freteProporcional / produto.quantidade);

      console.log(`Produto: ${produto.nome}`);
      console.log(`  Valor unitário: R$ ${produto.valor_unitario.toFixed(2)}`);
      console.log(`  Impostos/unid: R$ ${(impostosTotal / produto.quantidade).toFixed(2)}`);
      console.log(`  Frete/unid: R$ ${(freteProporcional / produto.quantidade).toFixed(2)}`);
      console.log(`  Custo nova entrada/unid: R$ ${custoNovaEntrada.toFixed(2)}`);
      console.log(`  Margem: ${margemLucro}%`);

      // Verificar se produto já existe pelo EAN (código de barras), SKU ou nome
      let produtoExistente = null;
      
      // Prioridade 1: Buscar por EAN (código de barras)
      if (produto.ean && produto.ean !== 'SEM GTIN') {
        const { data } = await supabase
          .from('products')
          .select('*')
          .eq('sku', produto.ean)
          .maybeSingle();
        produtoExistente = data;
        console.log(`  Buscando por EAN: ${produto.ean}`, produtoExistente ? '✓ encontrado' : '✗ não encontrado');
      }

      // Prioridade 2: Buscar por SKU
      if (!produtoExistente && produto.sku) {
        const { data } = await supabase
          .from('products')
          .select('*')
          .eq('sku', produto.sku)
          .maybeSingle();
        produtoExistente = data;
        console.log(`  Buscando por SKU: ${produto.sku}`, produtoExistente ? '✓ encontrado' : '✗ não encontrado');
      }

      // Prioridade 3: Buscar por nome
      if (!produtoExistente) {
        const { data } = await supabase
          .from('products')
          .select('*')
          .ilike('name', produto.nome)
          .maybeSingle();
        produtoExistente = data;
        console.log(`  Buscando por nome: ${produto.nome}`, produtoExistente ? '✓ encontrado' : '✗ não encontrado');
      }

      if (produtoExistente) {
        // Calcular custo médio ponderado
        const estoqueAtual = produtoExistente.stock;
        const precoAtual = produtoExistente.price;
        
        // Reverter o preço atual para custo (assumindo que foi aplicada a mesma margem)
        // Se não conseguirmos calcular, usar o preço atual como custo
        const custoAtual = precoAtual / (1 + margemLucro / 100);
        
        // Custo médio ponderado = (custo_atual * estoque_atual + custo_nova_entrada * qtd_nova) / (estoque_atual + qtd_nova)
        const custoMedioPonderado = estoqueAtual > 0 
          ? ((custoAtual * estoqueAtual) + (custoNovaEntrada * produto.quantidade)) / (estoqueAtual + produto.quantidade)
          : custoNovaEntrada;
        
        // Preço de venda com a margem aplicada sobre o custo médio
        const precoVenda = custoMedioPonderado * (1 + margemLucro / 100);
        
        const novoEstoque = estoqueAtual + produto.quantidade;
        
        console.log(`  Estoque atual: ${estoqueAtual} (custo: R$ ${custoAtual.toFixed(2)})`);
        console.log(`  Custo médio ponderado: R$ ${custoMedioPonderado.toFixed(2)}`);
        console.log(`  Preço venda final: R$ ${precoVenda.toFixed(2)}`);
        
        const updateData: any = {
          stock: novoEstoque,
          price: precoVenda,
          updated_at: new Date().toISOString()
        };
        
        // Se o produto não tem SKU ou o SKU atual não é um EAN válido, atualizar com o EAN da nota
        if (produto.ean && produto.ean !== 'SEM GTIN' && !produtoExistente.sku) {
          updateData.sku = produto.ean;
          console.log(`  Atualizando EAN do produto: ${produto.ean}`);
        }
        
        const { error: updateError } = await supabase
          .from('products')
          .update(updateData)
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
        // Criar novo produto - preço = custo da entrada + margem
        const precoVenda = custoNovaEntrada * (1 + margemLucro / 100);
        console.log(`  Preço venda novo produto: R$ ${precoVenda.toFixed(2)}`);
        
        const skuValue = produto.ean && produto.ean !== 'SEM GTIN' ? produto.ean : produto.sku;
        
        const { data: novoProduto, error: insertError } = await supabase
          .from('products')
          .insert({
            name: produto.nome,
            description: `${produto.nome} - NCM: ${produto.ncm || 'N/A'}${produto.ean && produto.ean !== 'SEM GTIN' ? ` - EAN: ${produto.ean}` : ''}`,
            short_description: produto.nome,
            price: precoVenda,
            category: 'Geral',
            stock: produto.quantidade,
            sku: skuValue || undefined,
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
        emitted_at: nfeData.data_emissao,
        products_count: nfeData.produtos.length
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