Deno.env.set("DENO_TEST", "1");

import { assertEquals, assert, assertStringIncludes } from "jsr:@std/assert@^1";
import { handleRequest } from "../reconcile-asaas-payments/index.ts";
import { interceptFetch, setupEnv, mockAsaas } from "./mock_gateways.ts";
import { SUPABASE_URL, ANON_KEY, SERVICE_KEY, ensureEmployeeUser, getJwt, TEST_USER_ID } from "./helpers.ts";

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

// Cria um pedido aguardando_pagamento com usuário único (evita o limite de
// 3 pedidos pendentes por usuário imposto pelo trigger) e profile com
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

// Cria um pedido PDV (source='pdv', status='entregado') — não deve ser
// reconciliado porque vendas na loja não passam pelo Asaas.
// Usa o JWT do admin (role admin) porque o trigger exige auth.uid() com role.
async function createPdvFixture(total = 53.58) {
  const jwt = await getJwt();
  const svc = { "apikey": ANON_KEY, "Authorization": `Bearer ${jwt}`, "Content-Type": "application/json", "Prefer": "return=representation" };
  const orderResp = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
    method: "POST",
    headers: svc,
    body: JSON.stringify({
      user_id: TEST_USER_ID,
      total_amount: total,
      shipping_cost: 0,
      shipping_address: "Loja",
      shipping_cep: "78556100",
      status: "entregado",
      delivery_type: "pickup",
      created_at: "2026-08-12T12:00:00Z",
      source: "pdv",
    }),
  });
  if (!orderResp.ok) {
    throw new Error(`createPdvFixture: falha ao criar pedido PDV (HTTP ${orderResp.status}): ${await orderResp.text()}`);
  }
  const orderData = await orderResp.json();
  const orderId = (orderData as any)[0]?.id ?? (orderData as any).id;
  if (!orderId) {
    throw new Error("createPdvFixture: pedido PDV criado sem id na resposta");
  }
  return orderId;
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

Deno.test("sem cobrança com o valor → no_match com paymentsFound", async () => {
  const { userId, orderId } = await createFixture("cus_reconcile_nm");

  // O Asaas retorna cobranças do customer, mas com VALORES diferentes
  mockAsaas((url, method) => {
    if (method === "GET" && url.includes("/v3/payments")) {
      return { status: 200, body: { object: "list", hasMore: false, totalCount: 2, data: [
        { id: "pay_other_1", status: "PENDING", value: 999.90, billingType: "PIX", dateCreated: "2026-08-12 10:00:00" },
        { id: "pay_other_2", status: "RECEIVED", value: 10.00, billingType: "PIX", dateCreated: "2026-08-12 11:00:00" },
      ] } };
    }
    return null;
  });

  const r = await call({ dryRun: true, cutoff: "2026-08-11" });
  mockAsaas(null);

  assertEquals(r.status, 200);
  const data = await r.json();
  const entry = data.report.find((x: any) => x.orderId === orderId);
  await cleanup(userId, orderId);

  assert(entry, "deve ter registro para o pedido");
  assertEquals(entry.status, "no_match");
  assertStringIncludes(entry.detail, "nenhuma cobrança com este valor");
  // Deve listar as cobranças existentes para revisão manual
  assertEquals(Array.isArray(entry.paymentsFound), true);
  assertEquals(entry.paymentsFound.length, 2);
});

Deno.test("pedido PDV (source=pdv) NÃO é reconciliado", async () => {
  const orderId = await createPdvFixture();

  const r = await call({ dryRun: true, cutoff: "2026-08-11" });
  assertEquals(r.status, 200);
  const data = await r.json();
  const entry = data.report.find((x: any) => x.orderId === orderId);
  const svc = { "apikey": ANON_KEY, "Authorization": `Bearer ${SERVICE_KEY}` };
  const d = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`, { method: "DELETE", headers: svc });
  await d.text();

  assertEquals(entry, undefined, "pedido PDV não deve aparecer na conciliação");
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

Deno.test("cobrança RECEIVED grava o ID sem alterar status do pedido", async () => {
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
  // Mesmo RECEIVED, a conciliação NÃO transiciona status (decisão é manual)
  assertEquals(entry.setEmPreparo, false);

  const svc = { "apikey": ANON_KEY, "Authorization": `Bearer ${SERVICE_KEY}` };
  const q = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}&select=asaas_payment_id,status`, { headers: svc });
  const rows = await q.json();
  await cleanup(userId, orderId);

  assertEquals(rows[0]?.asaas_payment_id, "pay_received_1");
  assertEquals(rows[0]?.status, "aguardando_pagamento", "status não deve mudar — só o ID");
});

Deno.test("parcelamento: casa pelo total do parcelamento, não pela parcela", async () => {
  // Pedido de R$ 200,12 em 3x — a parcela no Asaas vale 66.71, mas o total do
  // parcelamento é 200.12. O match deve usar o total (GET /v3/installments/{id}).
  // Customer único por execução para não colidir com pedidos de runs anteriores.
  const customerId = `cus_reconcile_inst_${crypto.randomUUID().slice(0, 8)}`;
  const installmentId = `inst_${crypto.randomUUID().slice(0, 8)}`;
  const { userId, orderId } = await createFixture(customerId, 200.12);

  mockAsaas((url, method) => {
    if (method === "GET" && url.includes("/v3/installments/")) {
      return { status: 200, body: { id: installmentId, value: 200.12, paymentValue: 66.71, installmentCount: 3, billingType: "CREDIT_CARD" } };
    }
    if (method === "GET" && url.includes("/v3/payments")) {
      return { status: 200, body: { object: "list", hasMore: false, totalCount: 3, data: [
        { id: "pay_inst_1", status: "RECEIVED", value: 66.71, billingType: "CREDIT_CARD", installment: installmentId, installmentNumber: 1, dateCreated: "2026-08-12 10:00:00" },
        { id: "pay_inst_2", status: "PENDING", value: 66.71, billingType: "CREDIT_CARD", installment: installmentId, installmentNumber: 2, dateCreated: "2026-08-12 10:00:00" },
        { id: "pay_inst_3", status: "PENDING", value: 66.71, billingType: "CREDIT_CARD", installment: installmentId, installmentNumber: 3, dateCreated: "2026-08-12 10:00:00" },
      ] } };
    }
    return null;
  });

  const r = await call({ dryRun: false, cutoff: "2026-08-11" });
  mockAsaas(null);

  assertEquals(r.status, 200);
  const data = await r.json();
  const entry = data.report.find((x: any) => x.orderId === orderId);
  if (!entry) console.error("REPORT:", JSON.stringify(data.report, null, 2));
  assert(entry, "deve ter registro para o pedido");
  assertEquals(entry.status, "applied", `parcelamento deve casar pelo total — entry: ${JSON.stringify(entry)}`);

  const svc = { "apikey": ANON_KEY, "Authorization": `Bearer ${SERVICE_KEY}` };
  const q = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}&select=*`, { headers: svc });
  const rows = await q.json();
  await cleanup(userId, orderId);

  const row = (rows as any[])[0];
  assertEquals(row?.asaas_payment_id, "pay_inst_1", "asaas_payment_id deve ser gravado mesmo se coluna opcional faltar");
  // asaas_installment_id é coluna opcional — se existir no schema, deve estar preenchida
  if (row && "asaas_installment_id" in row) {
    assertEquals(row.asaas_installment_id, installmentId);
  }
});

Deno.test("drift de 1 centavo no total do parcelamento não gera no_match", async () => {
  // Pedido de R$ 200.12, mas o Asaas reporta total do parcelamento 200.11
  // (arredondamento). Tolerância de 1 centavo deve casar mesmo assim.
  const customerId = `cus_reconcile_drift_${crypto.randomUUID().slice(0, 8)}`;
  const installmentId = `inst_drift_${crypto.randomUUID().slice(0, 8)}`;
  const { userId, orderId } = await createFixture(customerId, 200.12);

  mockAsaas((url, method) => {
    if (method === "GET" && url.includes("/v3/installments/")) {
      return { status: 200, body: { id: installmentId, value: 200.11, paymentValue: 66.71, installmentCount: 3, billingType: "CREDIT_CARD" } };
    }
    if (method === "GET" && url.includes("/v3/payments")) {
      return { status: 200, body: { object: "list", hasMore: false, totalCount: 3, data: [
        { id: "pay_drift_1", status: "RECEIVED", value: 66.71, billingType: "CREDIT_CARD", installment: installmentId, installmentNumber: 1, dateCreated: "2026-08-12 10:00:00" },
        { id: "pay_drift_2", status: "PENDING", value: 66.70, billingType: "CREDIT_CARD", installment: installmentId, installmentNumber: 2, dateCreated: "2026-08-12 10:00:00" },
        { id: "pay_drift_3", status: "PENDING", value: 66.70, billingType: "CREDIT_CARD", installment: installmentId, installmentNumber: 3, dateCreated: "2026-08-12 10:00:00" },
      ] } };
    }
    return null;
  });

  const r = await call({ dryRun: false, cutoff: "2026-08-11" });
  mockAsaas(null);

  assertEquals(r.status, 200);
  const data = await r.json();
  const entry = data.report.find((x: any) => x.orderId === orderId);
  if (!entry) console.error("REPORT:", JSON.stringify(data.report, null, 2));
  assert(entry, "deve ter registro para o pedido");
  assertEquals(entry.status, "applied", "drift de 1 centavo deve casar — entry: " + JSON.stringify(entry));

  const svc = { "apikey": ANON_KEY, "Authorization": `Bearer ${SERVICE_KEY}` };
  const q = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}&select=*`, { headers: svc });
  const rows = await q.json();
  await cleanup(userId, orderId);

  const row = (rows as any[])[0];
  assertEquals(row?.asaas_payment_id, "pay_drift_1");
});

Deno.test("pedido cancelado também é reconciliado (qualquer status)", async () => {
  // O trigger exige criação como aguardando_pagamento; muda para cancelado depois
  const { userId, orderId } = await createFixture("cus_reconcile_4", 49.90);
  const svc = { "apikey": ANON_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
  const up = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`, {
    method: "PATCH",
    headers: svc,
    body: JSON.stringify({ status: "cancelado", cancellation_reason: "prazo_expirado" }),
  });
  assert(up.ok, `falha ao marcar pedido como cancelado: ${await up.text()}`);

  mockAsaas((url, method) => {
    if (method === "GET" && url.includes("/v3/payments")) {
      return { status: 200, body: { object: "list", hasMore: false, totalCount: 1, data: [{ id: "pay_cancelled_1", status: "RECEIVED", value: 49.90, billingType: "PIX" }] } };
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

  const q = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}&select=asaas_payment_id,status`, { headers: svc });
  const rows = await q.json();
  await cleanup(userId, orderId);

  assertEquals(rows[0]?.asaas_payment_id, "pay_cancelled_1");
  assertEquals(rows[0]?.status, "cancelado", "pedido cancelado continua cancelado — só o ID é gravado");
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
