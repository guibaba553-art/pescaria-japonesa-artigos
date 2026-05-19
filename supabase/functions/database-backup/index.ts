// Edge function que faz backup das tabelas principais do banco,
// sobe um JSON gzipado em um bucket privado e envia por e-mail o link
// assinado (válido 7 dias).
//
// Acionada por pg_cron a cada 3 dias. Protegida por CRON_SECRET no
// header x-cron-secret.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { uploadToBackupFolder } from "../_shared/googleDrive.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const BACKUP_EMAIL = "guibaba553@gmail.com";
const BUCKET = "backups";

// Tabelas que queremos no backup. Tabelas de log/auditoria gigantes
// ficam de fora para não estourar tamanho — adicione se precisar.
const TABLES = [
  "profiles",
  "user_roles",
  "user_addresses",
  "customers",
  "categories",
  "products",
  "product_variations",
  "cost_groups",
  "suppliers",
  "orders",
  "order_items",
  "stock_movements",
  "stock_reservations",
  "purchase_lists",
  "purchase_list_items",
  "coupons",
  "coupon_redemptions",
  "reviews",
  "expenses",
  "expense_overrides",
  "cash_registers",
  "cash_movements",
  "saved_sales",
  "saved_payment_methods",
  "employee_permissions",
  "nfe_emissions",
  "nfe_settings",
  "tef_settings",
  "tef_transactions",
  "fiscal_rate_limits",
  "product_label_pending",
  "dismissed_stock_alerts",
];

async function gzip(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(
    new CompressionStream("gzip"),
  );
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Cliente com service role pra rodar tudo
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Autorização: aceita x-cron-secret (validado contra vault via RPC) OU env CRON_SECRET
  const provided = req.headers.get("x-cron-secret") || "";
  let isAuthorized = !!CRON_SECRET && provided === CRON_SECRET;
  if (!isAuthorized && provided) {
    const { data: ok } = await supabase.rpc("verify_cron_secret", {
      _secret: provided,
    });
    isAuthorized = ok === true;
  }
  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {

    const dump: Record<string, unknown> = {
      _meta: {
        generated_at: new Date().toISOString(),
        project: "japaspesca",
        tables: TABLES,
      },
    };

    const errors: Record<string, string> = {};
    let totalRows = 0;

    for (const table of TABLES) {
      // Paginar de 1000 em 1000 (limite default Supabase)
      const rows: unknown[] = [];
      let from = 0;
      const pageSize = 1000;
      // Hard cap por tabela para evitar dump descontrolado
      const hardCap = 200_000;
      while (rows.length < hardCap) {
        const { data, error } = await supabase
          .from(table)
          .select("*")
          .range(from, from + pageSize - 1);
        if (error) {
          errors[table] = error.message;
          break;
        }
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      dump[table] = rows;
      totalRows += rows.length;
      console.log(`✓ ${table}: ${rows.length} linhas`);
    }

    const json = new TextEncoder().encode(JSON.stringify(dump));
    const gz = await gzip(json);

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const path = `backup-${ts}.json.gz`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, gz, {
        contentType: "application/gzip",
        upsert: false,
      });
    if (upErr) throw new Error(`upload: ${upErr.message}`);

    // URL assinada válida por 7 dias
    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    if (signErr) throw new Error(`sign: ${signErr.message}`);

    const sizeMb = (gz.byteLength / 1024 / 1024).toFixed(2);
    const errorList = Object.entries(errors)
      .map(([t, m]) => `<li><b>${t}</b>: ${m}</li>`)
      .join("");

    // Upload pro Google Drive (Meu Drive > japa pesca 2026 > bekup)
    let driveInfo: { id?: string; link?: string; error?: string } = {};
    try {
      const up = await uploadToBackupFolder(path, gz, "application/gzip");
      driveInfo = { id: up.id, link: up.webViewLink };
      console.log(`✓ Drive upload: ${up.id} ${up.webViewLink ?? ""}`);
    } catch (e) {
      driveInfo = { error: (e as Error).message };
      console.error("Drive upload falhou:", e);
    }

    const driveBlock = driveInfo.link
      ? `<p>☁️ <a href="${driveInfo.link}">Abrir no Google Drive</a> (pasta <b>japa pesca 2026 / bekup</b>)</p>`
      : driveInfo.error
        ? `<p style="color:#b00">⚠️ Falha ao enviar pro Drive: ${driveInfo.error}</p>`
        : "";

    const html = `
      <h2>Backup do banco — Japas Pesca</h2>
      <p>Gerado em <b>${new Date().toLocaleString("pt-BR")}</b></p>
      <ul>
        <li>Tabelas: ${TABLES.length}</li>
        <li>Linhas totais: ${totalRows.toLocaleString("pt-BR")}</li>
        <li>Tamanho do arquivo (gzip): ${sizeMb} MB</li>
      </ul>
      <p><a href="${signed.signedUrl}">📥 Baixar backup</a> (link válido por 7 dias)</p>
      ${driveBlock}
      ${errorList ? `<h3>Tabelas com erro:</h3><ul>${errorList}</ul>` : ""}
      <hr/>
      <small>Backup automático — enviado a cada 3 dias.</small>
    `;

    // Envia via Resend
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Backup Japas Pesca <onboarding@resend.dev>",
        to: [BACKUP_EMAIL],
        subject: `Backup do banco — ${new Date().toLocaleDateString("pt-BR")}`,
        html,
      }),
    });
    const emailJson = await emailRes.json();
    if (!emailRes.ok) {
      throw new Error(`resend: ${JSON.stringify(emailJson)}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        file: path,
        size_mb: sizeMb,
        total_rows: totalRows,
        errors,
        email_id: emailJson.id,
        drive: driveInfo,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("backup error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
