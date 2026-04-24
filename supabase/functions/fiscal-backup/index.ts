// Backup fiscal completo: gera ZIP com XMLs + manifest JSON + CSV resumo
// Uso: guarda obrigatória de 5 anos (Receita Federal — Art. 173 CTN / Art. 195 CF)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth — apenas admin pode baixar backup
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Usuário inválido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleCheck } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Apenas administradores" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { startDate, endDate } = await req.json();
    if (!startDate || !endDate) {
      return new Response(JSON.stringify({ error: "startDate e endDate obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Buscar todas NFes autorizadas (saída e entrada) no período
    const { data: nfes, error: nfeErr } = await admin
      .from("nfe_emissions")
      .select("*")
      .in("status", ["authorized", "autorizado", "emitida", "success"])
      .gte("emitted_at", `${startDate}T00:00:00`)
      .lte("emitted_at", `${endDate}T23:59:59`)
      .order("emitted_at", { ascending: true });

    if (nfeErr) throw nfeErr;

    const zip = new JSZip();
    const xmlFolder = zip.folder("xmls")!;
    const manifest: any[] = [];
    let downloaded = 0;
    let failed = 0;

    for (const nfe of nfes || []) {
      const fileName = `${nfe.nfe_key || nfe.id}.xml`;

      // Download do XML quando disponível
      if (nfe.nfe_xml_url) {
        try {
          const r = await fetch(nfe.nfe_xml_url);
          if (r.ok) {
            const xml = await r.text();
            const subFolder = nfe.tipo === "entrada" ? "entrada" : "saida";
            xmlFolder.folder(subFolder)!.file(fileName, xml);
            downloaded++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      }

      manifest.push({
        id: nfe.id,
        order_id: nfe.order_id,
        tipo: nfe.tipo,
        modelo: nfe.modelo,
        ambiente: nfe.ambiente,
        nfe_number: nfe.nfe_number,
        nfe_key: nfe.nfe_key,
        protocolo: nfe.protocolo,
        status: nfe.status,
        valor_total: nfe.valor_total,
        emitted_at: nfe.emitted_at,
        cancelled_at: nfe.cancelled_at,
        motivo_cancelamento: nfe.motivo_cancelamento,
        fornecedor_nome: nfe.fornecedor_nome,
        fornecedor_cnpj: nfe.fornecedor_cnpj,
        danfe_url: nfe.danfe_url,
      });
    }

    // CSV resumo (para o contador)
    const csvHeader =
      "Numero;Chave;Tipo;Modelo;Ambiente;Status;ValorTotal;EmitidoEm;Protocolo;FornecedorNome;FornecedorCNPJ\n";
    const csvRows = manifest
      .map((m) =>
        [
          m.nfe_number ?? "",
          m.nfe_key ?? "",
          m.tipo ?? "",
          m.modelo ?? "",
          m.ambiente ?? "",
          m.status ?? "",
          m.valor_total ?? "",
          m.emitted_at ?? "",
          m.protocolo ?? "",
          m.fornecedor_nome ?? "",
          m.fornecedor_cnpj ?? "",
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(";")
      )
      .join("\n");

    const meta = {
      generated_at: new Date().toISOString(),
      generated_by: userData.user.email,
      period: { start: startDate, end: endDate },
      totals: {
        nfes: manifest.length,
        xml_baixados: downloaded,
        xml_falhas: failed,
        valor_total: manifest.reduce((s, m) => s + Number(m.valor_total || 0), 0),
      },
      legal_notice:
        "Backup fiscal — guardar por 5 anos conforme Art. 173 CTN e Art. 195 CF/88. Os XMLs aqui contidos têm valor fiscal e devem ser preservados em mídia segura.",
    };

    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    zip.file("metadata.json", JSON.stringify(meta, null, 2));
    zip.file("resumo.csv", csvHeader + csvRows);
    zip.file(
      "LEIA-ME.txt",
      `BACKUP FISCAL — JapasPesca\n` +
        `Período: ${startDate} a ${endDate}\n` +
        `Gerado em: ${new Date().toLocaleString("pt-BR")}\n\n` +
        `Conteúdo:\n` +
        `  /xmls/saida/    — XMLs de NFCe/NFe de saída autorizadas\n` +
        `  /xmls/entrada/  — XMLs de NFe de entrada (fornecedores)\n` +
        `  manifest.json   — Dados estruturados de todas as notas\n` +
        `  metadata.json   — Resumo e totais do período\n` +
        `  resumo.csv      — Planilha resumo (Excel/Calc)\n\n` +
        `OBRIGAÇÃO LEGAL: Conservar este backup por no mínimo 5 anos\n` +
        `(Art. 173 do CTN e Art. 195, parágrafo único, da CF/88).\n` +
        `Recomenda-se armazenar em ao menos 2 mídias distintas\n` +
        `(ex: disco local + nuvem externa).\n`
    );

    const blob = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

    const fname = `backup-fiscal-${startDate}_a_${endDate}.zip`;
    return new Response(blob, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fname}"`,
        "X-Backup-Count": String(manifest.length),
        "X-Backup-Downloaded": String(downloaded),
        "X-Backup-Failed": String(failed),
      },
    });
  } catch (err: any) {
    console.error("[fiscal-backup] erro:", err);
    return new Response(JSON.stringify({ error: err.message || "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
