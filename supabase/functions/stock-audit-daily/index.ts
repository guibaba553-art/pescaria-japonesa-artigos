// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const BACKUP_EMAIL = "guibaba553@gmail.com";

function escapeXml(v: any): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function inferCause(diff: number, mvSummary: any): string {
  if (mvSummary?.untracked_sales) return "Vendas sem registro de movimentação detectadas";
  if (diff > 0) return "Estoque maior que o esperado — possível entrada manual sem registro ou venda cancelada não revertida";
  if (diff < 0) return "Estoque menor que o esperado — possível venda/saída sem rastreio, perda, quebra ou ajuste manual sem log";
  return "Diferença desconhecida";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const runRes = await supabase.from("stock_audit_runs").insert({ status: "running" }).select().single();
  if (runRes.error) {
    return new Response(JSON.stringify({ error: runRes.error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const runId = runRes.data.id as string;

  try {
    // 1. Carrega tudo
    const [{ data: products }, { data: variations }, { data: movements }] = await Promise.all([
      supabase.from("products").select("id,name,sku,stock,category,price").order("name"),
      supabase.from("product_variations").select("id,product_id,name,sku,stock,price"),
      supabase.from("stock_movements").select("product_id,variation_id,movement_type,quantity_delta,order_id"),
    ]);

    const mvByKey = new Map<string, { sum: number; types: Record<string, number> }>();
    for (const m of movements ?? []) {
      const key = `${m.product_id}::${m.variation_id ?? ""}`;
      const e = mvByKey.get(key) ?? { sum: 0, types: {} };
      e.sum += Number(m.quantity_delta);
      e.types[m.movement_type] = (e.types[m.movement_type] ?? 0) + Number(m.quantity_delta);
      mvByKey.set(key, e);
    }

    const discrepancies: any[] = [];
    let totalSkus = 0;
    let okCount = 0;

    // Função para checar uma linha (produto sem variação OU variação)
    const check = (productId: string, variationId: string | null, name: string, varName: string | null, sku: string | null, stock: number) => {
      totalSkus++;
      const key = `${productId}::${variationId ?? ""}`;
      const mv = mvByKey.get(key);
      const expected = mv?.sum ?? 0;
      const current = Number(stock ?? 0);
      const diff = current - expected;
      // tolerância 0.001 para floats de venda por peso
      if (Math.abs(diff) < 0.001) {
        okCount++;
        return;
      }
      discrepancies.push({
        run_id: runId,
        product_id: productId,
        variation_id: variationId,
        product_name: name,
        variation_name: varName,
        sku,
        current_stock: current,
        expected_stock: expected,
        difference: diff,
        movements_summary: mv?.types ?? {},
        probable_cause: inferCause(diff, mv?.types),
      });
    };

    const varsByProduct = new Map<string, any[]>();
    for (const v of variations ?? []) {
      const arr = varsByProduct.get(v.product_id) ?? [];
      arr.push(v);
      varsByProduct.set(v.product_id, arr);
    }

    for (const p of products ?? []) {
      const vars = varsByProduct.get(p.id) ?? [];
      if (vars.length > 0) {
        for (const v of vars) check(p.id, v.id, p.name, v.name, v.sku, v.stock);
      } else {
        check(p.id, null, p.name, null, p.sku, p.stock);
      }
    }

    // 2. Insere divergências
    if (discrepancies.length > 0) {
      const { error: dErr } = await supabase.from("stock_audit_discrepancies").insert(discrepancies);
      if (dErr) throw new Error("Falha ao inserir divergências: " + dErr.message);
    }

    // 3. Gera XML de backup
    const today = new Date().toISOString().slice(0, 10);
    const xmlParts: string[] = [];
    xmlParts.push('<?xml version="1.0" encoding="UTF-8"?>');
    xmlParts.push(`<estoque_backup data="${today}" total_skus="${totalSkus}" divergencias="${discrepancies.length}">`);
    xmlParts.push("<produtos>");
    for (const p of products ?? []) {
      const vars = varsByProduct.get(p.id) ?? [];
      xmlParts.push(`<produto id="${p.id}" sku="${escapeXml(p.sku)}" categoria="${escapeXml(p.category)}">`);
      xmlParts.push(`<nome>${escapeXml(p.name)}</nome>`);
      xmlParts.push(`<estoque>${p.stock}</estoque>`);
      xmlParts.push(`<preco>${p.price}</preco>`);
      if (vars.length) {
        xmlParts.push("<variacoes>");
        for (const v of vars) {
          xmlParts.push(`<variacao id="${v.id}" sku="${escapeXml(v.sku)}"><nome>${escapeXml(v.name)}</nome><estoque>${v.stock}</estoque><preco>${v.price}</preco></variacao>`);
        }
        xmlParts.push("</variacoes>");
      }
      xmlParts.push("</produto>");
    }
    xmlParts.push("</produtos>");
    if (discrepancies.length) {
      xmlParts.push("<divergencias>");
      for (const d of discrepancies) {
        xmlParts.push(`<divergencia product_id="${d.product_id}"${d.variation_id ? ` variation_id="${d.variation_id}"` : ""}><produto>${escapeXml(d.product_name)}</produto>${d.variation_name ? `<variacao>${escapeXml(d.variation_name)}</variacao>` : ""}<sku>${escapeXml(d.sku)}</sku><atual>${d.current_stock}</atual><esperado>${d.expected_stock}</esperado><diferenca>${d.difference}</diferenca><causa>${escapeXml(d.probable_cause)}</causa></divergencia>`);
      }
      xmlParts.push("</divergencias>");
    }
    xmlParts.push("</estoque_backup>");
    const xml = xmlParts.join("\n");
    const xmlBytes = new TextEncoder().encode(xml);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < xmlBytes.length; i += chunkSize) {
      binary += String.fromCharCode(...xmlBytes.subarray(i, i + chunkSize));
    }
    const xmlBase64 = btoa(binary);

    // 4. Envia email com anexo via Resend
    const subject = `Backup Estoque ${today} — ${discrepancies.length > 0 ? `${discrepancies.length} divergência(s)` : "OK ✓"}`;
    const html = `
      <h2>Backup Diário de Estoque</h2>
      <p><strong>Data:</strong> ${today}</p>
      <p><strong>Total de SKUs:</strong> ${totalSkus}</p>
      <p><strong>Conferidos OK:</strong> ${okCount}</p>
      <p><strong>Divergências:</strong> ${discrepancies.length}</p>
      ${discrepancies.length > 0 ? `<h3>Resumo das divergências</h3><ul>${discrepancies.slice(0, 20).map(d => `<li><strong>${escapeXml(d.product_name)}${d.variation_name ? " — " + escapeXml(d.variation_name) : ""}</strong>: atual ${d.current_stock}, esperado ${d.expected_stock} (diff ${d.difference}). ${escapeXml(d.probable_cause)}</li>`).join("")}</ul>${discrepancies.length > 20 ? `<p><em>... e mais ${discrepancies.length - 20} divergências. Veja o XML anexo.</em></p>` : ""}` : "<p>✅ Estoque conferido sem divergências.</p>"}
      <p>Veja todos os detalhes no arquivo XML anexo.</p>
    `;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Backup Estoque <onboarding@resend.dev>",
        to: [BACKUP_EMAIL],
        subject,
        html,
        attachments: [{ filename: `estoque-${today}.xml`, content: xmlBase64 }],
      }),
    });
    const resendJson = await resendRes.json();
    const emailOk = resendRes.ok;

    await supabase.from("stock_audit_runs").update({
      status: "success",
      total_skus: totalSkus,
      ok_count: okCount,
      discrepancy_count: discrepancies.length,
      backup_xml_size: xmlBytes.length,
      email_sent: emailOk,
      email_message_id: resendJson?.id ?? null,
      error_message: emailOk ? null : `Email falhou: ${JSON.stringify(resendJson)}`,
    }).eq("id", runId);

    return new Response(JSON.stringify({ success: true, run_id: runId, total_skus: totalSkus, discrepancies: discrepancies.length, email_sent: emailOk }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    await supabase.from("stock_audit_runs").update({ status: "failed", error_message: err.message }).eq("id", runId);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
