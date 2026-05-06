// Gera arquivo SPED Fiscal (EFD ICMS/IPI) simplificado para envio à contadora.
// Layout baseado no Guia Prático da EFD ICMS/IPI v3.x (estrutura mínima de Bloco 0, C e 9).
// O arquivo gerado contém apenas as NF-e (modelo 55) AUTORIZADAS no período informado.
// A contadora pode importar/ajustar no PVA SPED.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const cleanDoc = (doc?: string | null) => (doc || '').replace(/\D/g, '');
const fmtVal = (n: number) => (Math.round((n || 0) * 100) / 100).toFixed(2).replace('.', ',');
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}${mm}${yyyy}`;
};
const fmtPeriodo = (yyyymm: string) => yyyymm; // ddmmyyyy passado direto

function makeLine(...fields: (string | number | undefined | null)[]): string {
  // SPED: linhas começam e terminam com pipe, sem pipe extra.
  return '|' + fields.map((f) => (f === undefined || f === null ? '' : String(f))).join('|') + '|';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // ---------- AUTENTICAÇÃO (admin) ----------
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Sessão inválida' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: roleRow } = await supabase
      .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Apenas administradores' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { startDate, endDate } = await req.json();
    if (!startDate || !endDate) {
      return new Response(JSON.stringify({ error: 'Período obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ---------- EMPRESA ----------
    const { data: company } = await supabase
      .from('company_fiscal_data').select('*').limit(1).maybeSingle();
    if (!company) {
      return new Response(
        JSON.stringify({ error: 'Cadastre os dados fiscais da empresa antes de gerar o SPED.' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ---------- NF-e AUTORIZADAS NO PERÍODO ----------
    const startISO = `${startDate}T00:00:00`;
    const endISO = `${endDate}T23:59:59`;
    const { data: emissions } = await supabase
      .from('nfe_emissions')
      .select('id, order_id, nfe_number, nfe_key, valor_total, emitted_at, modelo, status, tipo')
      .eq('modelo', '55')
      .eq('status', 'success')
      .gte('emitted_at', startISO)
      .lte('emitted_at', endISO)
      .order('emitted_at', { ascending: true });

    const nfList = emissions || [];

    // Carrega pedidos + itens em lote
    const orderIds = nfList.map((n) => n.order_id).filter(Boolean) as string[];
    const ordersById = new Map<string, any>();
    const itemsByOrder = new Map<string, any[]>();
    const customersById = new Map<string, any>();

    if (orderIds.length > 0) {
      const { data: orders } = await supabase
        .from('orders')
        .select('id, customer_id, total_amount, shipping_cost, shipping_address, created_at, source')
        .in('id', orderIds);
      (orders || []).forEach((o) => ordersById.set(o.id, o));

      const { data: items } = await supabase
        .from('order_items')
        .select('order_id, quantity, price_at_purchase, product_id, products(name, ncm, cfop, csosn, origem, unidade_comercial, sku)')
        .in('order_id', orderIds);
      (items || []).forEach((it: any) => {
        const arr = itemsByOrder.get(it.order_id) || [];
        arr.push(it);
        itemsByOrder.set(it.order_id, arr);
      });

      const custIds = Array.from(new Set((orders || []).map((o: any) => o.customer_id).filter(Boolean))) as string[];
      if (custIds.length > 0) {
        const { data: custs } = await supabase
          .from('customers')
          .select('id, full_name, company_name, cpf, cnpj, cep, street, number, neighborhood')
          .in('id', custIds);
        (custs || []).forEach((c) => customersById.set(c.id, c));
      }
    }

    // ---------- MONTAGEM SPED ----------
    const lines: string[] = [];
    const dtIni = fmtDate(`${startDate}T00:00:00`);
    const dtFin = fmtDate(`${endDate}T00:00:00`);
    const cnpjEmp = cleanDoc(company.cnpj);
    const ie = company.inscricao_estadual || '';
    const uf = company.uf || '';
    const munCod = company.codigo_municipio || '';

    // Bloco 0
    lines.push(makeLine('0000', '017', '0', dtIni, dtFin,
      company.razao_social, cnpjEmp, '', uf, ie, munCod, '', 'A', '0'));
    lines.push(makeLine('0001', '0'));
    lines.push(makeLine('0005', company.nome_fantasia || company.razao_social,
      cleanDoc(company.cep), company.logradouro, company.numero,
      company.complemento || '', company.bairro,
      company.telefone || '', '', company.email || ''));

    // 0150 — participantes (clientes)
    const participantesCods = new Map<string, string>();
    let codCount = 1;
    customersById.forEach((c) => {
      const cod = `C${String(codCount++).padStart(6, '0')}`;
      participantesCods.set(c.id, cod);
      const doc = cleanDoc(c.cnpj || c.cpf);
      const isCnpj = cleanDoc(c.cnpj).length === 14;
      lines.push(makeLine('0150', cod,
        c.company_name || c.full_name,
        '1058', // BRASIL
        isCnpj ? doc : '', isCnpj ? '' : doc, '',
        '', c.street || '', c.number || '', '', c.neighborhood || ''));
    });
    lines.push(makeLine('0190', 'UN', 'UNIDADE'));
    lines.push(makeLine('0190', 'KG', 'QUILOGRAMA'));

    // 0200 — produtos
    const prodCods = new Map<string, { cod: string; name: string; ncm: string; un: string }>();
    nfList.forEach((nf) => {
      const its = itemsByOrder.get(nf.order_id) || [];
      its.forEach((it: any) => {
        const pid = it.product_id;
        if (!prodCods.has(pid)) {
          const cod = `P${String(prodCods.size + 1).padStart(6, '0')}`;
          prodCods.set(pid, {
            cod,
            name: it.products?.name || 'Produto',
            ncm: (it.products?.ncm || '').replace(/\D/g, ''),
            un: (it.products?.unidade_comercial || 'UN').toUpperCase(),
          });
        }
      });
    });
    prodCods.forEach((p) => {
      lines.push(makeLine('0200', p.cod, p.name, '', '', p.un, '00', p.ncm, '', '', ''));
    });

    // Bloco C
    lines.push(makeLine('C001', '0'));
    let totProd = 0;
    let totNF = 0;
    nfList.forEach((nf) => {
      const order = ordersById.get(nf.order_id) || {};
      const cust = order.customer_id ? customersById.get(order.customer_id) : null;
      const partCod = cust ? participantesCods.get(cust.id) || '' : '';
      const dtDoc = fmtDate(nf.emitted_at || order.created_at);
      const valFrete = Number(order.shipping_cost || 0);
      const valNF = Number(nf.valor_total || order.total_amount || 0);
      const its = itemsByOrder.get(nf.order_id) || [];
      const valProdSum = its.reduce(
        (s: number, it: any) => s + Number(it.quantity) * Number(it.price_at_purchase), 0);
      totProd += valProdSum;
      totNF += valNF;

      // C100 — Nota Fiscal
      lines.push(makeLine('C100',
        '1',         // IND_OPER (0=ent,1=saída)
        '1',         // IND_EMIT (0=própria,1=terc) — emissão própria
        partCod, '55', '00',
        '1',         // série
        nf.nfe_number || '', nf.nfe_key || '', dtDoc, dtDoc,
        fmtVal(valNF), '0', '', '0', fmtVal(valProdSum), '9',
        fmtVal(valFrete), '0', '0', '0', fmtVal(valNF), '0', '0', '0', '0', '0', '0', '0', '0', ''));

      // C170 — Itens
      its.forEach((it: any, idx: number) => {
        const p = prodCods.get(it.product_id);
        const qtd = Number(it.quantity);
        const vUn = Number(it.price_at_purchase);
        const vIt = qtd * vUn;
        lines.push(makeLine('C170',
          String(idx + 1), p?.cod || it.product_id, '',
          fmtVal(qtd), p?.un || 'UN', fmtVal(vIt), '0', '0',
          (it.products?.csosn || '102'),
          (it.products?.cfop || '5102'),
          p?.un || 'UN', fmtVal(qtd), fmtVal(vUn),
          '0', '0', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''));
      });
    });
    // C990 — totalizador do bloco C (qtd linhas C001..C990 inclusive)
    const blocoC = lines.filter((l) => l.startsWith('|C')).length + 1;
    lines.push(makeLine('C990', String(blocoC)));

    // Blocos vazios obrigatórios
    const blocosVazios = ['D', 'E', 'G', 'H', 'K', '1'];
    blocosVazios.forEach((b) => {
      lines.push(makeLine(`${b}001`, '1'));
      lines.push(makeLine(`${b}990`, '2'));
    });

    // Bloco 9
    lines.push(makeLine('9001', '0'));
    // 9900 — registro por tipo
    const counts = new Map<string, number>();
    lines.forEach((l) => {
      const reg = l.split('|')[1];
      counts.set(reg, (counts.get(reg) || 0) + 1);
    });
    counts.set('9900', counts.size + 2); // 9900 + 9990 + 9999
    counts.set('9990', 1);
    counts.set('9999', 1);
    Array.from(counts.entries()).sort().forEach(([reg, qtd]) => {
      lines.push(makeLine('9900', reg, String(qtd)));
    });
    // 9990 — totalizador bloco 9
    const bloco9 = lines.filter((l) => l.startsWith('|9')).length + 1;
    lines.push(makeLine('9990', String(bloco9)));
    // 9999 — total geral
    lines.push(makeLine('9999', String(lines.length + 1)));

    const sped = lines.join('\r\n') + '\r\n';
    const periodo = `${startDate}_a_${endDate}`;
    const filename = `SPED_FISCAL_${cnpjEmp}_${periodo}.txt`;

    return new Response(sped, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-NFe-Count': String(nfList.length),
      },
    });
  } catch (e) {
    console.error('SPED error:', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
