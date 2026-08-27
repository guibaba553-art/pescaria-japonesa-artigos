// Send SMS Auth Hook: entrega o OTP gerado pelo Supabase via WhatsApp Cloud API.
// Referência: https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook

import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, send-sms-hook-secret",
};

function normalizeE164(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  // DDD 55 (RS) pode abrir número local (55999112233): 12-13 dígitos já são
  // E.164 (55 + DDD + número) — não confundir com prefixo de país já presente.
  // Espelha toE164 (src/lib/whatsappOtp.ts).
  const isE164Br = digits.length >= 12 && digits.length <= 13 && digits.startsWith("55");
  if (isE164Br) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 11) digits = `55${digits}`;
  return `+${digits}`;
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const hookSecret = Deno.env.get("SEND_SMS_HOOK_SECRET")?.replace("v1,whsec_", "") ?? "";
  const WH_TOKEN = Deno.env.get("WHATSAPP_TOKEN");
  const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const TEMPLATE = Deno.env.get("WHATSAPP_TEMPLATE_AUTH");
  const DAILY_CAP = parseInt(Deno.env.get("OTP_DAILY_CAP_PER_PHONE") ?? "5", 10);

  // DRY RUN: em ambiente local loga o OTP no console sem chamar a Cloud API
  const dryRunFlag = Deno.env.get("WHATSAPP_DRY_RUN");
  const isLocal = /127\.0\.0\.1|localhost/.test(Deno.env.get("SUPABASE_URL") ?? "");
  const isDryRun = dryRunFlag === "true" || (dryRunFlag !== "false" && isLocal);

  if (!hookSecret || (!isDryRun && (!WH_TOKEN || !PHONE_ID || !TEMPLATE))) {
    console.error("[send-whatsapp-otp] env incompleta");
    return new Response(JSON.stringify({ error: "Configuração ausente" }), { status: 500, headers: corsHeaders });
  }

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);

  let event: { user: { id: string; phone: string }; sms: { otp: string } };
  try {
    const wh = new Webhook(hookSecret);
    event = wh.verify(payload, headers) as typeof event;
  } catch {
    return new Response(JSON.stringify({ error: "Assinatura inválida" }), { status: 401, headers: corsHeaders });
  }

  const to = normalizeE164(event.user.phone);
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Cap diário anti-bombing/custo (spec 5.2)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("otp_send_log")
    .select("*", { count: "exact", head: true })
    .eq("phone", to)
    .gte("sent_at", since);
  if ((count ?? 0) >= DAILY_CAP) {
    return new Response(JSON.stringify({ error: "Limite diário de envios atingido" }), { status: 429, headers: corsHeaders });
  }

  if (isDryRun) {
    console.log(`[send-whatsapp-otp] DRY RUN — código para ${to}: ${event.sms.otp}`);
  } else {
    const resp = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${WH_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/^\+/, ""),
        type: "template",
        template: {
          name: TEMPLATE,
          language: { code: "pt_BR" },
          components: [{ type: "body", parameters: [{ type: "text", text: event.sms.otp }] }],
        },
      }),
    });

    if (!resp.ok) {
      console.error("[send-whatsapp-otp] Cloud API falhou:", resp.status, await resp.text());
      return new Response(JSON.stringify({ error: "Falha ao entregar OTP" }), { status: 502, headers: corsHeaders });
    }
  }

  try {
    const { error: logError } = await admin.from("otp_send_log").insert({ phone: to });
    if (logError) throw logError;
  } catch (error) {
    // Log é best-effort para o cap diário; o SMS já foi entregue — não abortar o fluxo do GoTrue.
    console.error("[send-whatsapp-otp] falha ao registrar otp_send_log:", (error as Error).message);
  }
  return new Response(JSON.stringify({}), { status: 200, headers: corsHeaders });
}

if (!Deno.env.get("DENO_TEST")) {
  Deno.serve(handleRequest);
}
