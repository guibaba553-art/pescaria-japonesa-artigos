import { assertEquals } from "jsr:@std/assert@^1";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { handleRequest } from "../send-whatsapp-otp/index.ts";
import { setupEnv, interceptFetch, mockInternalFn } from "./mock_gateways.ts";

setupEnv();
interceptFetch();

const SECRET = "v1,whsec_" + btoa("test-secret-32-bytes-aaaaaaaaaaaaaa").replace(/=+$/, "");
Deno.env.set("SEND_SMS_HOOK_SECRET", SECRET);
Deno.env.set("OTP_DAILY_CAP_PER_PHONE", "5");
Deno.env.set("WHATSAPP_TEMPLATE_AUTH", "japas_otp");
Deno.env.set("WHATSAPP_TOKEN", "test-wa-token");
Deno.env.set("WHATSAPP_PHONE_NUMBER_ID", "1234567890");
// setupEnv() seta SUPABASE_URL local (127.0.0.1) → auto-detecção de dry-run desativada para o caminho real
Deno.env.set("WHATSAPP_DRY_RUN", "false");

const hook = new Webhook(SECRET.replace("v1,whsec_", ""));

async function call(payload: object, secretOverride?: string) {
  const body = JSON.stringify(payload);
  const wh = secretOverride ? new Webhook(secretOverride.replace(/^v1,/, "")) : hook;
  const id = crypto.randomUUID();
  const sig = wh.sign(id, new Date(), body);
  return handleRequest(new Request("http://localhost/fn", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": Math.floor(Date.now() / 1000).toString(),
      "webhook-signature": sig,
    },
    body,
  }));
}

function smsPayload(phone: string, otp = "123456") {
  return {
    user: { id: crypto.randomUUID(), phone, email: null },
    sms: { otp },
  };
}

Deno.test("entrega OTP via Cloud API e responde 200", async () => {
  let sentTo = ""; let templateUsed = ""; let otpSent = "";
  mockInternalFn((url, _m, body) => {
    if (url.includes("graph.facebook.com")) {
      const b = body as Record<string, any>;
      sentTo = b.to; templateUsed = b.template.name;
      otpSent = b.template.components[0].parameters[0].text;
      return { status: 200, body: { messages: [{ id: "wamid.X" }] } };
    }
    return null;
  });
  const r = await call(smsPayload("+5566992110000"));
  assertEquals(r.status, 200);
  assertEquals(sentTo, "5566992110000");
  assertEquals(templateUsed, "japas_otp");
  assertEquals(otpSent, "123456");
  const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svcHeaders = { apikey: SVC, Authorization: `Bearer ${SVC}` };
  await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/otp_send_log?phone=eq.%2B5566992110000`, { method: "DELETE", headers: svcHeaders });
});

Deno.test("DDD 55 (RS): número local de 12 dígitos é tratado como país, não como DDD", async () => {
  let sentTo = "";
  mockInternalFn((url, _m, body) => {
    if (url.includes("graph.facebook.com")) {
      sentTo = (body as Record<string, any>).to;
      return { status: 200, body: { messages: [{ id: "wamid.X" }] } };
    }
    return null;
  });
  const r = await call(smsPayload("55999112233"));
  assertEquals(r.status, 200);
  assertEquals(sentTo, "5555999112233");
  const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svcHeaders = { apikey: SVC, Authorization: `Bearer ${SVC}` };
  await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/otp_send_log?phone=eq.%2B5555999112233`, { method: "DELETE", headers: svcHeaders });
});

Deno.test("E.164 de 13 dígitos mantém-se inalterado", async () => {
  let sentTo = "";
  mockInternalFn((url, _m, body) => {
    if (url.includes("graph.facebook.com")) {
      sentTo = (body as Record<string, any>).to;
      return { status: 200, body: { messages: [{ id: "wamid.X" }] } };
    }
    return null;
  });
  const r = await call(smsPayload("5566992110000"));
  assertEquals(r.status, 200);
  assertEquals(sentTo, "5566992110000");
  const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svcHeaders = { apikey: SVC, Authorization: `Bearer ${SVC}` };
  await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/otp_send_log?phone=eq.%2B5566992110000`, { method: "DELETE", headers: svcHeaders });
});

Deno.test("assinatura inválida → 401", async () => {
  const r = await call(smsPayload("+5566992110000"), "v1,whsec_" + btoa("wrong-secret-32-bytes-bbbbbbbbbb"));
  assertEquals(r.status, 401);
});

Deno.test("cap diário atingido → 429 e Cloud API não é chamada", async () => {
  mockInternalFn((url) => {
    if (url.includes("graph.facebook.com")) throw new Error("Cloud API não deveria ser chamada");
    return null;
  });
  const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svcHeaders = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };
  const url = `${Deno.env.get("SUPABASE_URL")}/rest/v1/otp_send_log`;
  for (let i = 0; i < 5; i++) await fetch(url, { method: "POST", headers: svcHeaders, body: JSON.stringify({ phone: "+5566992155555" }) }).then(r => r.text());
  const r = await call(smsPayload("+5566992155555"));
  assertEquals(r.status, 429);
  await fetch(`${url}?phone=eq.%2B5566992155555`, { method: "DELETE", headers: svcHeaders }).then(r => r.text());
});

Deno.test("falha na Cloud API → 502 (Supabase aborta)", async () => {
  mockInternalFn((url) => url.includes("graph.facebook.com") ? { status: 500, body: { error: { message: "boom" } } } : null);
  const r = await call(smsPayload("+5566992166666"));
  assertEquals(r.status, 502);
});

Deno.test("falha ao registrar otp_send_log → ainda responde 200 (log é best-effort)", async () => {
  const captured: string[] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    captured.push(args.map(String).join(" "));
  };
  try {
    mockInternalFn((url, method) => {
      if (url.includes("otp_send_log") && method === "POST") {
        return { status: 500, body: { message: "db indisponível" } };
      }
      if (url.includes("graph.facebook.com")) {
        return { status: 200, body: { messages: [{ id: "wamid.X" }] } };
      }
      return null;
    });
    const r = await call(smsPayload("+5566992177777"));
    assertEquals(r.status, 200);
    assertEquals(
      captured.some((line) => line.includes("falha ao registrar otp_send_log")),
      true,
      "esperava console.error registrando a falha do log",
    );
  } finally {
    console.error = originalConsoleError;
  }
});

Deno.test("dry run: não chama Cloud API, loga OTP e retorna 200", async () => {
  Deno.env.delete("WHATSAPP_DRY_RUN");
  const captured: string[] = [];
  const originalConsoleLog = console.log;
  console.log = (...args: unknown[]) => {
    captured.push(args.map(String).join(" "));
  };
  try {
    mockInternalFn((url) => {
      if (url.includes("graph.facebook.com")) throw new Error("Cloud API não deveria ser chamada");
      return null;
    });
    const r = await call(smsPayload("+5566992188888", "654321"));
    assertEquals(r.status, 200);
    assertEquals(
      captured.some((line) => line.includes("DRY RUN") && line.includes("654321")),
      true,
      "esperava log de dry-run contendo o OTP do payload",
    );
    const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const svcHeaders = { apikey: SVC, Authorization: `Bearer ${SVC}` };
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/otp_send_log?phone=eq.%2B5566992188888&select=phone`, { headers: svcHeaders });
    const rows = await res.json();
    assertEquals(rows.length >= 1, true, "esperava linha em otp_send_log no dry-run");
    await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/otp_send_log?phone=eq.%2B5566992188888`, { method: "DELETE", headers: svcHeaders });
  } finally {
    console.log = originalConsoleLog;
  }
});

Deno.test("dry run: flag explícita false desativa mesmo com URL local", async () => {
  Deno.env.set("WHATSAPP_DRY_RUN", "false");
  const captured: string[] = [];
  const originalConsoleLog = console.log;
  console.log = (...args: unknown[]) => {
    captured.push(args.map(String).join(" "));
  };
  try {
    let sentTo = "";
    mockInternalFn((url, _m, body) => {
      if (url.includes("graph.facebook.com")) {
        sentTo = (body as Record<string, any>).to;
        return { status: 200, body: { messages: [{ id: "wamid.X" }] } };
      }
      return null;
    });
    const r = await call(smsPayload("+5566992199999"));
    assertEquals(r.status, 200);
    assertEquals(sentTo, "5566992199999");
    assertEquals(
      captured.some((line) => line.includes("DRY RUN")),
      false,
      "não esperava log de dry-run com flag false",
    );
    const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const svcHeaders = { apikey: SVC, Authorization: `Bearer ${SVC}` };
    await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/otp_send_log?phone=eq.%2B5566992199999`, { method: "DELETE", headers: svcHeaders });
  } finally {
    console.log = originalConsoleLog;
  }
});

Deno.test("dry run: flag true força em qualquer ambiente", async () => {
  Deno.env.set("WHATSAPP_DRY_RUN", "true");
  Deno.env.set("SUPABASE_URL", "https://xxxx.supabase.co");
  const captured: string[] = [];
  const originalConsoleLog = console.log;
  console.log = (...args: unknown[]) => {
    captured.push(args.map(String).join(" "));
  };
  try {
    mockInternalFn((url) => {
      if (url.includes("graph.facebook.com")) throw new Error("Cloud API não deveria ser chamada");
      if (url.includes("otp_send_log")) return { status: 200, body: [] };
      return null;
    });
    const r = await call(smsPayload("+5566992100001"));
    assertEquals(r.status, 200);
    assertEquals(
      captured.some((line) => line.includes("DRY RUN") && line.includes("123456")),
      true,
      "esperava log de dry-run mesmo com URL de produção",
    );
  } finally {
    console.log = originalConsoleLog;
    Deno.env.set("WHATSAPP_DRY_RUN", "false");
    Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
  }
});

Deno.test("dry run zero-config: sem vars WHATSAPP local loga OTP sem 500", async () => {
  Deno.env.delete("WHATSAPP_DRY_RUN");
  Deno.env.set("WHATSAPP_TOKEN", "");
  Deno.env.set("WHATSAPP_PHONE_NUMBER_ID", "");
  Deno.env.set("WHATSAPP_TEMPLATE_AUTH", "");
  const captured: string[] = [];
  const originalConsoleLog = console.log;
  console.log = (...args: unknown[]) => {
    captured.push(args.map(String).join(" "));
  };
  try {
    mockInternalFn((url) => {
      if (url.includes("graph.facebook.com")) throw new Error("Cloud API não deveria ser chamada");
      return null;
    });
    const r = await call(smsPayload("+5566992100002", "111222"));
    assertEquals(r.status, 200);
    assertEquals(
      captured.some((line) => line.includes("DRY RUN") && line.includes("111222")),
      true,
      "esperava log de dry-run sem configuração WHATSAPP",
    );
    const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const svcHeaders = { apikey: SVC, Authorization: `Bearer ${SVC}` };
    await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/otp_send_log?phone=eq.%2B5566992100002`, { method: "DELETE", headers: svcHeaders });
  } finally {
    console.log = originalConsoleLog;
    Deno.env.set("WHATSAPP_DRY_RUN", "false");
    Deno.env.set("WHATSAPP_TOKEN", "test-wa-token");
    Deno.env.set("WHATSAPP_PHONE_NUMBER_ID", "1234567890");
    Deno.env.set("WHATSAPP_TEMPLATE_AUTH", "japas_otp");
  }
});

Deno.test("dry run: flag ausente + URL de produção → caminho real sem log", async () => {
  Deno.env.delete("WHATSAPP_DRY_RUN");
  Deno.env.set("SUPABASE_URL", "https://xxxx.supabase.co");
  const captured: string[] = [];
  const originalConsoleLog = console.log;
  console.log = (...args: unknown[]) => {
    captured.push(args.map(String).join(" "));
  };
  try {
    let sentTo = ""; let templateUsed = ""; let otpSent = "";
    mockInternalFn((url, _m, body) => {
      if (url.includes("graph.facebook.com")) {
        const b = body as Record<string, any>;
        sentTo = b.to; templateUsed = b.template.name;
        otpSent = b.template.components[0].parameters[0].text;
        return { status: 200, body: { messages: [{ id: "wamid.X" }] } };
      }
      if (url.includes("otp_send_log")) return { status: 200, body: [] };
      return null;
    });
    const r = await call(smsPayload("+5566992100003"));
    assertEquals(r.status, 200);
    assertEquals(sentTo, "5566992100003");
    assertEquals(templateUsed, "japas_otp");
    assertEquals(otpSent, "123456");
    assertEquals(
      captured.some((line) => line.includes("DRY RUN")),
      false,
      "não esperava log de dry-run com URL de produção e flag ausente",
    );
  } finally {
    console.log = originalConsoleLog;
    Deno.env.set("WHATSAPP_DRY_RUN", "false");
    Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
  }
});
