// Dispara a emissão fiscal automática (auto-emit-fiscal) após um pedido ser pago.
// auto-emit-fiscal decide se aplica (PDV pix/cartão ou site com retirada) e é idempotente.
export async function triggerAutoFiscal(orderId: string): Promise<void> {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !key || !orderId) return;
  try {
    const resp = await fetch(`${url}/functions/v1/auto-emit-fiscal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ order_id: orderId }),
    });
    console.log('[triggerAutoFiscal]', orderId, resp.status, (await resp.text()).slice(0, 300));
  } catch (e) {
    console.error('[triggerAutoFiscal] falha', orderId, e);
  }
}
