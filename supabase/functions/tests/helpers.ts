// Shared test helpers

export const SUPABASE_URL = "http://127.0.0.1:54321";
export const ANON_KEY = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
export const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";

let _jwt: string | null = null;

export async function getJwt(): Promise<string> {
  if (_jwt) return _jwt;
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "apikey": ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@pescaria.com", password: "admin123" }),
  });
  _jwt = (await resp.json()).access_token;
  return _jwt;
}

export async function createOrder(overrides: Record<string, unknown> = {}): Promise<string> {
  const jwt = await getJwt();
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
    method: "POST",
    headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${jwt}`, "Content-Type": "application/json", "Prefer": "return=representation" },
    body: JSON.stringify({ user_id: TEST_USER_ID, total_amount: 49.90, shipping_cost: 0, shipping_address: "Rua Teste, 123", shipping_cep: "12345678", status: "aguardando_pagamento", delivery_type: "pickup", payment_attempts: 0, pix_attempts: 0, ...overrides }),
  });
  const data = await resp.json();
  return (data as any)[0]?.id ?? (data as any).id;
}

export async function deleteOrder(id: string) {
  const jwt = await getJwt();
  await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${id}`, { method: "DELETE", headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${jwt}` } });
}
