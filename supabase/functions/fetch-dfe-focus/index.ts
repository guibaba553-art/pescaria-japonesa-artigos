import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FocusDfe {
  chave_nfe: string;
  numero?: string;
  serie?: string;
  cnpj_emitente?: string;
  nome_emitente?: string;
  data_emissao?: string;
  valor_nota_fiscal?: number;
  manifestacao_destinatario?: string;
  caminho_xml_nota_fiscal?: string;
}

function extractFromXml(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const triggeredManually = req.method === 'POST';

  try {
    const focusToken = Deno.env.get('FOCUS_NFE_TOKEN_PRODUCAO');
    if (!focusToken) {
      throw new Error('FOCUS_NFE_TOKEN_PRODUCAO não configurado');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Buscar CNPJ da empresa
    const { data: company, error: companyError } = await supabase
      .from('company_fiscal_data')
      .select('cnpj')
      .maybeSingle();

    if (companyError) throw companyError;
    if (!company?.cnpj) {
      throw new Error('CNPJ da empresa não cadastrado em Dados Fiscais');
    }

    const cnpj = company.cnpj.replace(/\D/g, '');
    console.log(`[fetch-dfe-focus] Consultando DFe para CNPJ ${cnpj}`);

    // Buscar focus_nfe_settings para descobrir ambiente
    const { data: focusSettings } = await supabase
      .from('focus_nfe_settings')
      .select('ambiente, enabled')
      .maybeSingle();

    if (!focusSettings?.enabled) {
      console.log('[fetch-dfe-focus] Focus NFe desabilitado, pulando');
      return new Response(
        JSON.stringify({ skipped: true, reason: 'Focus NFe desabilitado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const baseUrl = focusSettings.ambiente === 'producao'
      ? 'https://api.focusnfe.com.br'
      : 'https://homologacao.focusnfe.com.br';

    // Pegar último NSU consultado (armazenado como o maior chave_nfe processada
    // como proxy simples — Focus aceita ?ultimo_nsu=N)
    const { data: ultimoRegistro } = await supabase
      .from('nfe_entrada_pendentes')
      .select('parsed_data')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const ultimoNsu = (ultimoRegistro?.parsed_data as any)?.ultimo_nsu ?? 0;
    console.log(`[fetch-dfe-focus] Último NSU: ${ultimoNsu}`);

    // Consultar Focus DFe
    const dfeUrl = `${baseUrl}/v2/nfes_recebidas?cnpj=${cnpj}&ultimo_nsu=${ultimoNsu}`;
    const auth = btoa(`${focusToken}:`);

    const dfeRes = await fetch(dfeUrl, {
      headers: { 'Authorization': `Basic ${auth}` },
    });

    if (!dfeRes.ok) {
      const errBody = await dfeRes.text();
      throw new Error(`Focus DFe erro ${dfeRes.status}: ${errBody}`);
    }

    const dfeList: FocusDfe[] = await dfeRes.json();
    console.log(`[fetch-dfe-focus] ${dfeList.length} nota(s) recebida(s) da Focus`);

    let baixadas = 0;
    let manifestadas = 0;
    let erros = 0;
    const detalhes: any[] = [];

    for (const dfe of dfeList) {
      try {
        // Verificar se já existe
        const { data: existente } = await supabase
          .from('nfe_entrada_pendentes')
          .select('id')
          .eq('chave_nfe', dfe.chave_nfe)
          .maybeSingle();

        if (existente) {
          console.log(`[fetch-dfe-focus] ${dfe.chave_nfe} já existe, pulando`);
          continue;
        }

        // Baixar XML completo
        let xmlContent = '';
        if (dfe.caminho_xml_nota_fiscal) {
          const xmlUrl = dfe.caminho_xml_nota_fiscal.startsWith('http')
            ? dfe.caminho_xml_nota_fiscal
            : `${baseUrl}${dfe.caminho_xml_nota_fiscal}`;

          const xmlRes = await fetch(xmlUrl, {
            headers: { 'Authorization': `Basic ${auth}` },
          });
          if (xmlRes.ok) xmlContent = await xmlRes.text();
        }

        if (!xmlContent) {
          // Fallback: consultar via chave
          const xmlByKey = await fetch(`${baseUrl}/v2/nfes_recebidas/${dfe.chave_nfe}.xml`, {
            headers: { 'Authorization': `Basic ${auth}` },
          });
          if (xmlByKey.ok) xmlContent = await xmlByKey.text();
        }

        if (!xmlContent) {
          throw new Error('Não foi possível baixar o XML');
        }

        // Extrair dados básicos do XML
        const nNF = dfe.numero || extractFromXml(xmlContent, 'nNF');
        const serie = dfe.serie || extractFromXml(xmlContent, 'serie');
        const cnpjEmit = dfe.cnpj_emitente || extractFromXml(xmlContent, 'CNPJ');
        const xNomeEmit = dfe.nome_emitente || extractFromXml(xmlContent, 'xNome');
        const dhEmi = dfe.data_emissao || extractFromXml(xmlContent, 'dhEmi');
        const vNF = dfe.valor_nota_fiscal ?? Number(extractFromXml(xmlContent, 'vNF') || 0);

        // Inserir como pendente
        const { error: insertError } = await supabase
          .from('nfe_entrada_pendentes')
          .insert({
            chave_nfe: dfe.chave_nfe,
            numero_nfe: nNF,
            serie,
            fornecedor_nome: xNomeEmit,
            fornecedor_cnpj: cnpjEmit,
            data_emissao: dhEmi,
            valor_total: vNF,
            xml_content: xmlContent,
            status: 'pendente',
          });

        if (insertError) throw insertError;
        baixadas++;
        console.log(`[fetch-dfe-focus] ✓ Baixada: ${dfe.chave_nfe} (${xNomeEmit})`);

        // Manifestar ciência da operação
        try {
          const manifestRes = await fetch(
            `${baseUrl}/v2/nfes_recebidas/${dfe.chave_nfe}/manifesto`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ tipo: 'ciencia' }),
            }
          );

          if (manifestRes.ok || manifestRes.status === 422) {
            // 422 geralmente = já manifestada
            await supabase
              .from('nfe_entrada_pendentes')
              .update({
                manifestacao_status: 'ciencia',
                manifestacao_at: new Date().toISOString(),
              })
              .eq('chave_nfe', dfe.chave_nfe);
            manifestadas++;
            console.log(`[fetch-dfe-focus] ✓ Manifestada: ${dfe.chave_nfe}`);
          } else {
            const errMsg = await manifestRes.text();
            console.log(`[fetch-dfe-focus] ⚠ Manifestação falhou ${dfe.chave_nfe}: ${errMsg}`);
          }
        } catch (mErr) {
          console.error(`[fetch-dfe-focus] Erro ao manifestar ${dfe.chave_nfe}:`, mErr);
        }

        detalhes.push({ chave: dfe.chave_nfe, fornecedor: xNomeEmit, valor: vNF });
      } catch (err) {
        erros++;
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[fetch-dfe-focus] Erro processando ${dfe.chave_nfe}:`, errMsg);
        detalhes.push({ chave: dfe.chave_nfe, erro: errMsg });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        triggered: triggeredManually ? 'manual' : 'cron',
        baixadas,
        manifestadas,
        erros,
        total_consultadas: dfeList.length,
        detalhes,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[fetch-dfe-focus] Erro geral:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
