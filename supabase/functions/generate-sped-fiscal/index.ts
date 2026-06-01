// Gera arquivo SPED Fiscal (EFD ICMS/IPI) — layout oficial v020.
// Estrutura espelha o modelo de referência da contadora:
// Bloco 0 (0000, 0001, 0005, 0100, 0990) +
// Blocos B/C/D/E/G/H/K/1 (com 001/990, mais E100/E110 e 1010 quando vazios) +
// Bloco 9 (9001, 9900*, 9990, 9999).
// Quando há NF-e modelo 55 autorizadas no período, são adicionados
// 0150/0190/0200 e C100/C170 dentro do bloco C.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const cleanDoc = (doc?: string | null) => (doc || '').replace(/\D/g, '');
const fmtVal = (n: number) =>
  (Math.round((n || 0) * 100) / 100).toFixed(2).replace('.', ',');
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}${mm}${yyyy}`;
};

function makeLine(...fields: (string | number | undefined | null)[]): string {
  return '|' + fields.map((f) => (f === undefined || f === null ? '' : String(f))).join('|') + '|';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // ---------- AUTH (admin) ----------
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

    // ---------- MONTAGEM ----------
    const dtIni = fmtDate(`${startDate}T00:00:00`);
    const dtFin = fmtDate(`${endDate}T00:00:00`);
    const cnpjEmp = cleanDoc(company.cnpj);
    const ie = company.inscricao_estadual || '';
    const uf = company.uf || '';
    const munCod = company.codigo_municipio || '';
    const indPerfil = (company.ind_perfil || 'A').toUpperCase();
    const indAtiv = String(company.ind_ativ ?? '1');
    // COD_FIN: 0 = remessa original. COD_VER: 020 (versão vigente do leiaute).
    const codVer = '020';
    const codFin = '0';

    // ---------- BLOCO 0 ----------
    const bloco0: string[] = [];
    bloco0.push(makeLine('0000', codVer, codFin, dtIni, dtFin,
      company.razao_social, cnpjEmp, '', uf, ie, munCod, '', indPerfil, indAtiv));
    bloco0.push(makeLine('0001', nfList.length > 0 ? '0' : '0'));
    bloco0.push(makeLine('0005',
      company.nome_fantasia || company.razao_social,
      cleanDoc(company.cep),
      company.logradouro,
      company.numero,
      company.complemento || '',
      company.bairro,
      company.telefone || '',
      company.telefone || '',
      company.email || ''));

    // 0100 — contador
    if (company.contador_nome) {
      bloco0.push(makeLine('0100',
        company.contador_nome,
        cleanDoc(company.contador_cpf),
        company.contador_crc || '',
        cleanDoc(company.contador_cnpj),
        cleanDoc(company.contador_cep),
        company.contador_logradouro || '',
        company.contador_numero || '',
        company.contador_complemento || '',
        company.contador_bairro || '',
        company.contador_telefone || '',
        company.contador_fax || company.contador_telefone || '',
        company.contador_email || '',
        company.contador_codigo_municipio || munCod));
    }

    // 0150 — participantes (clientes das NF-e)
    const participantesCods = new Map<string, string>();
    let codCount = 1;
    customersById.forEach((c) => {
      const cod = `C${String(codCount++).padStart(6, '0')}`;
      participantesCods.set(c.id, cod);
      const doc = cleanDoc(c.cnpj || c.cpf);
      const isCnpj = cleanDoc(c.cnpj).length === 14;
      bloco0.push(makeLine('0150', cod,
        c.company_name || c.full_name,
        '1058',
        isCnpj ? doc : '', isCnpj ? '' : doc, '',
        '', c.street || '', c.number || '', '', c.neighborhood || ''));
    });

    // 0190 / 0200 — só se houver itens
    const prodCods = new Map<string, { cod: string; name: string; ncm: string; un: string }>();
    nfList.forEach((nf) => {
      const its = itemsByOrder.get(nf.order_id) || [];
      its.forEach((it: any) => {
        const pid = it.product_id;
        if (!prodCods.has(pid)) {
          prodCods.set(pid, {
            cod: `P${String(prodCods.size + 1).padStart(6, '0')}`,
            name: it.products?.name || 'Produto',
            ncm: (it.products?.ncm || '').replace(/\D/g, ''),
            un: (it.products?.unidade_comercial || 'UN').toUpperCase(),
          });
        }
      });
    });
    if (prodCods.size > 0) {
      bloco0.push(makeLine('0190', 'UN', 'UNIDADE'));
      bloco0.push(makeLine('0190', 'KG', 'QUILOGRAMA'));
      prodCods.forEach((p) => {
        bloco0.push(makeLine('0200', p.cod, p.name, '', '', p.un, '00', p.ncm, '', '', ''));
      });
    }

    // 0990 — totalizador bloco 0 (inclui ele mesmo)
    bloco0.push(makeLine('0990', String(bloco0.length + 1)));

    // ---------- BLOCO B ---------- (serviços ISS — vazio)
    const blocoB: string[] = [];
    blocoB.push(makeLine('B001', '1'));
    blocoB.push(makeLine('B990', String(blocoB.length + 1)));

    // ---------- BLOCO C ---------- (NF-e mod 55)
    const blocoC: string[] = [];
    blocoC.push(makeLine('C001', nfList.length > 0 ? '0' : '1'));
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

      blocoC.push(makeLine('C100',
        '1', '1', partCod, '55', '00', '1',
        nf.nfe_number || '', nf.nfe_key || '', dtDoc, dtDoc,
        fmtVal(valNF), '0', '', '0', fmtVal(valProdSum), '9',
        fmtVal(valFrete), '0', '0', '0', fmtVal(valNF),
        '0', '0', '0', '0', '0', '0', '0', '0', ''));

      its.forEach((it: any, idx: number) => {
        const p = prodCods.get(it.product_id);
        const qtd = Number(it.quantity);
        const vUn = Number(it.price_at_purchase);
        const vIt = qtd * vUn;
        blocoC.push(makeLine('C170',
          String(idx + 1), p?.cod || it.product_id, '',
          fmtVal(qtd), p?.un || 'UN', fmtVal(vIt), '0', '0',
          (it.products?.csosn || '102'),
          (it.products?.cfop || '5102'),
          p?.un || 'UN', fmtVal(qtd), fmtVal(vUn),
          '0', '0', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''));
      });
    });
    blocoC.push(makeLine('C990', String(blocoC.length + 1)));

    // ---------- BLOCO D ---------- (serviços comunicação/transporte — vazio)
    const blocoD: string[] = [];
    blocoD.push(makeLine('D001', '1'));
    blocoD.push(makeLine('D990', String(blocoD.length + 1)));

    // ---------- BLOCO E ---------- (apuração de ICMS/IPI)
    const blocoE: string[] = [];
    blocoE.push(makeLine('E001', '0'));
    blocoE.push(makeLine('E100', dtIni, dtFin));
    blocoE.push(makeLine('E110',
      '0,00', '0,00', '0,00', '0,00', '0,00', '0,00', '0,00',
      '0,00', '0,00', '0,00', '0,00', '0,00', '0,00', '0,00'));
    blocoE.push(makeLine('E990', String(blocoE.length + 1)));

    // ---------- BLOCO G ---------- (CIAP — vazio)
    const blocoG: string[] = [];
    blocoG.push(makeLine('G001', '1'));
    blocoG.push(makeLine('G990', String(blocoG.length + 1)));

    // ---------- BLOCO H ---------- (inventário — vazio)
    const blocoH: string[] = [];
    blocoH.push(makeLine('H001', '1'));
    blocoH.push(makeLine('H990', String(blocoH.length + 1)));

    // ---------- BLOCO K ---------- (produção — vazio)
    const blocoK: string[] = [];
    blocoK.push(makeLine('K001', '1'));
    blocoK.push(makeLine('K990', String(blocoK.length + 1)));

    // ---------- BLOCO 1 ---------- (outras informações)
    const bloco1: string[] = [];
    bloco1.push(makeLine('1001', '0'));
    bloco1.push(makeLine('1010', 'N', 'N', 'N', 'N', 'N', 'N', 'N', 'N', 'N', 'N', 'N', 'N', 'N'));
    bloco1.push(makeLine('1990', String(bloco1.length + 1)));

    // ---------- BLOCO 9 ----------
    const allBeforeBloco9 = [
      ...bloco0, ...blocoB, ...blocoC, ...blocoD,
      ...blocoE, ...blocoG, ...blocoH, ...blocoK, ...bloco1,
    ];

    const counts = new Map<string, number>();
    allBeforeBloco9.forEach((l) => {
      const reg = l.split('|')[1];
      counts.set(reg, (counts.get(reg) || 0) + 1);
    });

    const bloco9: string[] = [];
    bloco9.push(makeLine('9001', '0'));
    // 9900 inicia contando 9001 + ele mesmo (será incrementado depois)
    counts.set('9001', 1);
    // Reserva slots para 9900/9990/9999 — fechamos os valores ao final
    const regList = Array.from(counts.keys());
    // total de linhas 9900 = nº de regs únicos + 3 (9900, 9990, 9999)
    const total9900 = regList.length + 3;
    counts.set('9900', total9900);
    counts.set('9990', 1);
    counts.set('9999', 1);

    Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([reg, qtd]) => {
        bloco9.push(makeLine('9900', reg, String(qtd)));
      });
    bloco9.push(makeLine('9990', String(bloco9.length + 2))); // +9990 +9999? Conta inclui 9990
    // recalcula: 9990 conta linhas do bloco 9 (inclui ele mesmo) — 9999 fica fora
    const idx9990 = bloco9.length - 1;
    bloco9[idx9990] = makeLine('9990', String(bloco9.length)); // bloco9.length já inclui o 9990

    const allLines = [...allBeforeBloco9, ...bloco9];
    allLines.push(makeLine('9999', String(allLines.length + 1)));

    const sped = allLines.join('\r\n') + '\r\n';
    const periodo = `${startDate}_a_${endDate}`;
    const filename = `SPED_FISCAL_${cnpjEmp}_${periodo}.txt`;

    return new Response(sped, {
      headers: {
        ...corsHeaders,
        'Access-Control-Expose-Headers': 'X-NFe-Count, Content-Disposition',
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
