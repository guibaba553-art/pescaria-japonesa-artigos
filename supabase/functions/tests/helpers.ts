// Shared test helpers

export const SUPABASE_URL = "http://127.0.0.1:54321";
export const ANON_KEY = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
export const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
export const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";

let _jwt: string | null = null;
const _employeeJwts: Map<string, { jwt: string; id: string }> = new Map();

export async function getJwt(): Promise<string> {
  if (_jwt) return _jwt;
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "apikey": ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@pescaria.com", password: "admin123" }),
  });
  _jwt = (await resp.json()).access_token as string;
  return _jwt;
}

export async function ensureEmployeeUser(
  email: string,
  password: string,
  permissions: {
    can_access_orders?: boolean;
    can_access_catalog?: boolean;
    can_access_cash_register?: boolean;
    can_access_dashboard?: boolean;
    can_access_sales_analysis?: boolean;
    can_access_triagem?: boolean;
    can_access_fiscal?: boolean;
    can_access_customers?: boolean;
    can_access_pdv?: boolean;
  } = {}
): Promise<{ id: string }> {
  const cached = _employeeJwts.get(email);
  if (cached) return { id: cached.id };

  const headers = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };

  let userId: string;

  // Check if user already exists
  const existingResp = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
    { headers },
  );
  const { users: existingUsers } = await existingResp.json();

  if (existingUsers && existingUsers.length > 0) {
    userId = existingUsers[0].id;
  } else {
    // Create user
    const createResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: `Test ${email.split("@")[0]}` },
      }),
    });
    const userData = await createResp.json();
    if (userData.error) throw new Error(`Falha ao criar usuário: ${JSON.stringify(userData.error)}`);
    userId = userData.id;
  }

  // Wait for DB trigger to create profile
  await new Promise((r) => setTimeout(r, 200));

  // Set up user_roles and employee_permissions using service key (bypasses RLS)
  const svcHeaders = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };

  // Delete any existing role/perm so we can re-insert cleanly
  const delRoleResp = await fetch(`${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${userId}`, {
    method: "DELETE",
    headers: svcHeaders,
  });
  await delRoleResp.text();

  const delPermResp = await fetch(`${SUPABASE_URL}/rest/v1/employee_permissions?user_id=eq.${userId}`, {
    method: "DELETE",
    headers: svcHeaders,
  });
  await delPermResp.text();

  // Insert user_roles
  const insRoleResp = await fetch(`${SUPABASE_URL}/rest/v1/user_roles`, {
    method: "POST",
    headers: svcHeaders,
    body: JSON.stringify({ user_id: userId, role: "employee" }),
  });
  await insRoleResp.text();

  // Insert employee_permissions
  const insPermResp = await fetch(`${SUPABASE_URL}/rest/v1/employee_permissions`, {
    method: "POST",
    headers: svcHeaders,
    body: JSON.stringify({
      user_id: userId,
      can_access_orders: permissions.can_access_orders ?? true,
      can_access_catalog: permissions.can_access_catalog ?? true,
      can_access_cash_register: permissions.can_access_cash_register ?? false,
      can_access_dashboard: permissions.can_access_dashboard ?? false,
      can_access_sales_analysis: permissions.can_access_sales_analysis ?? false,
      can_access_triagem: permissions.can_access_triagem ?? true,
      can_access_fiscal: permissions.can_access_fiscal ?? false,
      can_access_pdv: permissions.can_access_pdv ?? true,
    }),
  });
  const permText = await insPermResp.text();
  if (!insPermResp.ok) console.error("employee_permissions insert failed:", insPermResp.status, permText);

  // Get JWT
  const tokenResp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const tokenData = await tokenResp.json();
  const jwt: string = tokenData.access_token ?? "";

  _employeeJwts.set(email, { jwt, id: userId });
  return { id: userId };
}

export async function getEmployeeJwt(
  email: string,
  password: string,
  permissions?: Record<string, boolean>,
): Promise<string> {
  const cached = _employeeJwts.get(email);
  if (cached) return cached.jwt;
  await ensureEmployeeUser(email, password, permissions);
  return _employeeJwts.get(email)!.jwt;
}

export async function createOrder(overrides: Record<string, unknown> = {}): Promise<string> {
  const jwt = await getJwt();
  const body = { user_id: TEST_USER_ID, total_amount: 49.90, shipping_cost: 0, shipping_address: "Rua Teste, 123", shipping_cep: "12345678", status: "aguardando_pagamento", delivery_type: "pickup", payment_attempts: 0, pix_attempts: 0, ...overrides };
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
    method: "POST",
    headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${jwt}`, "Content-Type": "application/json", "Prefer": "return=representation" },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) {
    console.error("createOrder failed:", resp.status, JSON.stringify(data));
  }
  return (data as any)[0]?.id ?? (data as any).id;
}

export async function createOrderService(overrides: Record<string, unknown> = {}): Promise<string> {
  const body = { user_id: TEST_USER_ID, total_amount: 49.90, shipping_cost: 0, shipping_address: "Rua Teste, 123", shipping_cep: "12345678", status: "aguardando_pagamento", delivery_type: "pickup", payment_attempts: 0, pix_attempts: 0, ...overrides };
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
    method: "POST",
    headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", "Prefer": "return=representation" },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) {
    console.error("createOrderService failed:", resp.status, JSON.stringify(data));
  }
  return (data as any)[0]?.id ?? (data as any).id;
}

export async function deleteOrder(id: string) {
  // RLS não concede DELETE em orders (migração 20260701000000) — deletar com
  // JWT de usuário retorna 204 mas NÃO remove a linha (no-op silencioso).
  // Sem limpeza real, pedidos acumulam entre testes e o trigger
  // "Aguarde 15 segundos entre pedidos" derruba os casos seguintes.
  await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${id}`, {
    method: "DELETE",
    headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}` },
  });
}
