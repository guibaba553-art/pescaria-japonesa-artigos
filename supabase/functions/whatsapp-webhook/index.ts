// supabase/functions/whatsapp-webhook/index.ts
// Recebe statuses de entrega da Cloud API (sent/delivered/failed) p/ monitoria.
// Configurar no painel Meta: Callback URL desta function, Verify Token = WHATSAPP_VERIFY_TOKEN.

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const body = await req.json();
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const status of change.value?.statuses ?? []) {
          if (status.status === "failed") {
            console.error("[whatsapp-webhook] falha de entrega:", JSON.stringify(status));
          }
        }
      }
    }
  } catch (e) {
    console.error("[whatsapp-webhook] parse:", e);
  }
  return new Response("OK", { status: 200 });
});
