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

Deno.test("pedidos repetidos (mesmo valor) são pareados 1:1 com cobranças distintas", async () => {
  // Cria dois pedidos do mesmo usuário, mesmo valor, horários próximos
  const email = `reconciler_repeat_${crypto.randomUUID().slice(0, 8)}@test.com`;
  const { id: userId } = await ensureEmployeeUser(email, "testpass123", {});
  const svc = { "apikey": ANON_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", "Prefer": "return=representation" };

  const p = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    headers: svc,
    body: JSON.stringify({ asaas_customer_id: "cus_repeat_1" }),
  });
  await p.text();

  const baseOrder = {
    user_id: userId,
    total_amount: 49.90,
    shipping_cost: 0,
    shipping_address: "Rua Teste, 123",
    shipping_cep: "12345678",
    status: "aguardando_pagamento",
    delivery_type: "pickup",
    source: "site",
  };
  const orderIds: string[] = [];
  for (const createdAt of ["2026-08-12T10:00:00Z", "2026-08-12T11:00:00Z"]) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
      method: "POST",
      headers: svc,
      body: JSON.stringify({ ...baseOrder, created_at: createdAt }),
    });
    if (!r.ok) {
      throw new Error(`falha ao criar pedido repetido: ${await r.text()}`);
    }
    const data = await r.json();
    orderIds.push((data as any)[0].id);
  }

  // Duas cobranças PENDING com o mesmo valor, criadas em ordem cronológica
  mockAsaas((url, method) => {
    if (method === "GET" && url.includes("/v3/payments")) {
      return {
        status: 200,
        body: {
          object: "list", hasMore: false, totalCount: 2, data: [
            { id: "pay_repeat_1", status: "PENDING", value: 49.90, billingType: "PIX", dateCreated: "2026-08-12 10:05:00" },
            { id: "pay_repeat_2", status: "PENDING", value: 49.90, billingType: "PIX", dateCreated: "2026-08-12 11:05:00" },
          ],
        },
      };
    }
    return null;
  });

  const r = await call({ dryRun: false, cutoff: "2026-08-11" });
  mockAsaas(null);

  assertEquals(r.status, 200);
  const data = await r.json();

  // Cada pedido deve receber uma cobrança DISTINTA
  const entries = orderIds.map((oid) => data.report.find((x: any) => x.orderId === oid));
  assert(entries.every((e) => e && e.status === "applied"), "ambos os pedidos devem ser aplicados");
  const paymentIds = entries.map((e: any) => e.paymentId);
  assertEquals(new Set(paymentIds).size, 2, "cada pedido deve ter um payment_id distinto");

  // Ordem cronológica: pedido mais antigo ↔ cobrança mais antiga
  assertEquals(entries[0].paymentId, "pay_repeat_1");
  assertEquals(entries[1].paymentId, "pay_repeat_2");

  const svcQ = { "apikey": ANON_KEY, "Authorization": `Bearer ${SERVICE_KEY}` };
  const q = await fetch(
    `${SUPABASE_URL}/rest/v1/orders?id=in.(${orderIds.join(",")})&select=id,asaas_payment_id`,
    { headers: svcQ },
  );
  const rows = await q.json();
  const byId = new Map((rows as any[]).map((row) => [row.id, row.asaas_payment_id]));
  assertEquals(byId.get(orderIds[0]), "pay_repeat_1");
  assertEquals(byId.get(orderIds[1]), "pay_repeat_2");

  for (const oid of orderIds) {
    const d = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${oid}`, { method: "DELETE", headers: svcQ });
    await d.text();
  }
  try {
    const u = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: svcQ });
    await u.text();
  } catch {
    /* não-bloqueante */
  }
});
