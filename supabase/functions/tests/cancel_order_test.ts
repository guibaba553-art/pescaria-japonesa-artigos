/**
 * Testes para a Edge Function cancel-order.
 *
 * Requer: supabase start (banco local real para auth + DB)
 * Rode com: npm run test:functions
 */

Deno.env.set("DENO_TEST", "1");

import {
  assertEquals,
} from "jsr:@std/assert@^1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { handleRequest } from "../cancel-order/index.ts";
import {
  interceptFetch,
  setupEnv,
  mockAsaas,
  mockMercadopago,
} from "./mock_gateways.ts";
import { getJwt, SUPABASE_URL, ANON_KEY, TEST_USER_ID } from "./helpers.ts";

setupEnv();
interceptFetch();

const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function call(body: Record<string, unknown>, jwt?: string): Promise<Response> {
  return handleRequest(new Request("http://localhost/fn", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${jwt ?? await getJwt()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }));
}

async function getExistingPendingOrder(): Promise<string | null> {
  const jwt = await getJwt();
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/orders?user_id=eq.${TEST_USER_ID}&status=eq.aguardando_pagamento&order=created_at.desc&limit=1&select=id`,
    { headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${jwt}` } }
  );
  const data = await resp.json();
  return data.length > 0 ? data[0].id : null;
}

async function createEmployeeWithOrdersPermission(): Promise<{ email: string; password: string; jwt: string; userId: string }> {
  const email = `test-employee-orders-${Date.now()}@test.com`;
  const password = "test123456";

  const { data: userData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr || !userData?.user) {
    throw new Error(`Failed to create test employee user: ${createErr?.message}`);
  }

  const userId = userData.user.id;

  await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "employee" });
  await supabaseAdmin.from("employee_permissions").upsert({
    user_id: userId,
    can_access_orders: true,
    can_access_pdv: false,
    can_access_catalog: false,
    can_access_cash_register: false,
    can_access_dashboard: false,
    can_access_sales_analysis: false,
    can_access_triagem: false,
    can_access_fiscal: false,
  }, { onConflict: "user_id" });

  const jwtResp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "apikey": ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const jwtData = await jwtResp.json();
  const jwt = jwtData.access_token;

  return { email, password, jwt, userId };
}

async function deleteTestUser(userId: string) {
  await supabaseAdmin.from("employee_permissions").delete().eq("user_id", userId);
  await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
  await supabaseAdmin.auth.admin.deleteUser(userId);
}

// ── Admin access ──────────────────────────────────────────────────────────

Deno.test("cancel-order: admin pode cancelar pedido", async () => {
  const oid = await getExistingPendingOrder();
  if (!oid) {
    console.log("SKIP: no existing pending orders to test with");
    return;
  }

  mockAsaas(() => null);
  mockMercadopago(() => null);

  const r = await call({ orderId: oid, cancellation_reason: "Teste admin" });
  const data = await r.json();

  assertEquals(r.status, 200, `Esperado 200, recebido ${r.status}: ${JSON.stringify(data)}`);
  assertEquals(data.success, true);

  mockAsaas(null);
  mockMercadopago(null);
});

// ── Employee (com permissao de pedidos) access ────────────────────────────

Deno.test("cancel-order: funcionario com can_access_orders pode cancelar pedido", async () => {
  const oid = await getExistingPendingOrder();
  if (!oid) {
    console.log("SKIP: no existing pending orders to test with");
    return;
  }

  const { jwt: employeeJwt, userId } = await createEmployeeWithOrdersPermission();

  try {
    mockAsaas(() => null);
    mockMercadopago(() => null);

    const r = await call({ orderId: oid, cancellation_reason: "Teste funcionario" }, employeeJwt);
    const data = await r.json();

    assertEquals(r.status, 200, `Esperado 200, recebido ${r.status}: ${JSON.stringify(data)}`);
    assertEquals(data.success, true);
  } finally {
    await deleteTestUser(userId);
  }

  mockAsaas(null);
  mockMercadopago(null);
});
