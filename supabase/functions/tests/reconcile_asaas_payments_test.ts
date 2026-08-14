Deno.env.set("DENO_TEST", "1");

import { assertEquals, assert } from "jsr:@std/assert@^1";
import { handleRequest } from "../reconcile-asaas-payments/index.ts";
import { interceptFetch, setupEnv, mockAsaas } from "./mock_gateways.ts";
import { SUPABASE_URL, ANON_KEY, SERVICE_KEY, ensureEmployeeUser } from "./helpers.ts";

setupEnv();
interceptFetch();

const CRON_SECRET = "test-cron-secret-123";
Deno.env.set("CRON_SECRET", CRON_SECRET);

async function call(body: Record<string, unknown>): Promise<Response> {
  return handleRequest(new Request("http://localhost/fn", {
    method: "POST",
    headers: { "Authorization": `Bearer ${CRON_SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

// Cria um pedido aguardando_pagamento com um usuário único (evita o limite de
// 3 pedidos pendentes por usuário imposto pelo trigger) e um profile com
// asaas_customer_id.
async function createFixture(customerId: string | null, total = 49.90) {
  const email = `reconciler_${crypto.randomUUID().slice(0, 8)}@test.com`;
  const { id: userId } = await ensureEmployeeUser(email, "testpass123", {});

  const svc = { "apikey": ANON_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", "Prefer": "return=representation" };

  if (customerId) {
    const p = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH",
      headers: svc,
      body: JSON.stringify({ asaas_customer_id: customerId }),
    });
    await p.text();
  }

  const orderResp = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
    method: "POST",
    headers: svc,
    body: JSON.stringify({
      user_id: userId,
      total_amount: total,
      shipping_cost: 0,
      shipping_address: "Rua Teste, 123",
      shipping_cep: "12345678",
      status: "aguardando_pagamento",
      delivery_type: "pickup",
      created_at: "2026-08-12T12:00:00Z",
      source: "site",
    }),
  });
  if (!orderResp.ok) {
    throw new Error(`createFixture: falha ao criar pedido (HTTP ${orderResp.status}): ${await orderResp.text()}`);
  }
  const orderData = await orderResp.json();
  const orderId = (orderData as any)[0]?.id ?? (orderData as any).id;
  if (!orderId) {
    throw new Error("createFixture: pedido criado sem id na resposta");
  }
  return { userId, orderId };
}

async function cleanup(userId: string, orderId: string) {
  const svc = { "apikey": ANON_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
  if (orderId) {
    const d = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`, { method: "DELETE", headers: svc });
    await d.text();
  }
  // Remove o usuário criado pelo fixture para não acumular no banco local
  try {
    const u = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: svc,
    });
    await u.text();
  } catch {
    /* não-bloqueante */
  }
}

Deno.test("sem autorização → 401", async () => {
  const r = await handleRequest(new Request("http://localhost/fn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dryRun: true }),
  }));
  assertEquals(r.status, 401);
});

Deno.test("dry-run casa pedido por valor e não altera o pedido", async () => {
  const { userId, orderId } = await createFixture("cus_reconcile_1");

  mockAsaas((url, method) => {
    if (method === "GET" && url.includes("/v3/payments")) {
      return { status: 200, body: { object: "list", hasMore: false, totalCount: 1, data: [{ id: "pay_pix_001", status: "PENDING", value: 49.90, billingType: "PIX" }] } };
    }
    return null;
  });

  const r = await call({ dryRun: true, cutoff: "2026-08-11" });
  mockAsaas(null);

  assertEquals(r.status, 200);
  const data = await r.json();
  assertEquals(data.dryRun, true);

  const entry = data.report.find((x: any) => x.orderId === orderId);
  assert(entry, "deve ter registro para o pedido criado");
  assertEquals(entry.status, "dry_run");

  const svc = { "apikey": ANON_KEY, "Authorization": `Bearer ${SERVICE_KEY}` };
  const q = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}&select=asaas_payment_id,status`, { headers: svc });
  const rows = await q.json();
  await cleanup(userId, orderId);

  assertEquals(rows[0]?.asaas_payment_id, null);
  assertEquals(rows[0]?.status, "aguardando_pagamento");
});

Deno.test("sem customer Asaas → no_customer", async () => {
  const { userId, orderId } = await createFixture(null);

  const r = await call({ dryRun: true, cutoff: "2026-08-11" });
  assertEquals(r.status, 200);
  const data = await r.json();
  const entry = data.report.find((x: any) => x.orderId === orderId);
  await cleanup(userId, orderId);

  assert(entry, "deve ter registro para o pedido");
  assertEquals(entry.status, "no_customer");
});

Deno.test("aplica backfill do asaas_payment_id (dryRun=false)", async () => {
  const { userId, orderId } = await createFixture("cus_reconcile_2");

  mockAsaas((url, method) => {
    if (method === "GET" && url.includes("/v3/payments")) {
      return { status: 200, body: { object: "list", hasMore: false, totalCount: 1, data: [{ id: "pay_pix_001", status: "PENDING", value: 49.90, billingType: "PIX" }] } };
    }
    return null;
  });

  const r = await call({ dryRun: false, cutoff: "2026-08-11" });
  mockAsaas(null);

  assertEquals(r.status, 200);
  const data = await r.json();
  const entry = data.report.find((x: any) => x.orderId === orderId);
  assert(entry, "deve ter registro para o pedido");
  assertEquals(entry.status, "applied");

  const svc = { "apikey": ANON_KEY, "Authorization": `Bearer ${SERVICE_KEY}` };
  const q = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}&select=asaas_payment_id,payment_gateway,payment_method,status`, { headers: svc });
  const rows = await q.json();
  await cleanup(userId, orderId);

  assertEquals(rows[0]?.asaas_payment_id, "pay_pix_001");
  assertEquals(rows[0]?.payment_gateway, "asaas");
  assertEquals(rows[0]?.payment_method, "pix");
  // PIX com status PENDING não transiciona para em_preparo
  assertEquals(rows[0]?.status, "aguardando_pagamento");
});

Deno.test("cobrança RECEIVED transiciona pedido para em_preparo", async () => {
  const { userId, orderId } = await createFixture("cus_reconcile_3");

  mockAsaas((url, method) => {
    if (method === "GET" && url.includes("/v3/payments")) {
      return { status: 200, body: { object: "list", hasMore: false, totalCount: 1, data: [{ id: "pay_received_1", status: "RECEIVED", value: 49.90, billingType: "PIX" }] } };
    }
    return null;
  });

  const r = await call({ dryRun: false, cutoff: "2026-08-11" });
  mockAsaas(null);

  assertEquals(r.status, 200);
  const data = await r.json();
  const entry = data.report.find((x: any) => x.orderId === orderId);
  assert(entry, "deve ter registro para o pedido");
  assertEquals(entry.status, "applied");
  assertEquals(entry.setEmPreparo, true);

  const svc = { "apikey": ANON_KEY, "Authorization": `Bearer ${SERVICE_KEY}` };
  const q = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}&select=asaas_payment_id,status`, { headers: svc });
  const rows = await q.json();
  await cleanup(userId, orderId);

  assertEquals(rows[0]?.asaas_payment_id, "pay_received_1");
  assertEquals(rows[0]?.status, "em_preparo");
});
