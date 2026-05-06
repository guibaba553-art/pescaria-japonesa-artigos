import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChargeRequest {
  amount: number;
  payment_method: 'credit' | 'debit' | 'pix' | 'voucher';
  installments?: number;
  order_id?: string | null;
}

// Stone Open API base URLs - serão usadas quando STONE_CLIENT_ID/SECRET forem configurados
const STONE_API_BASE = Deno.env.get('STONE_ENVIRONMENT') === 'production'
  ? 'https://api.openbank.stone.com.br'
  : 'https://sandbox-api.openbank.stone.com.br';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claims?.claims) return json({ error: 'Unauthorized' }, 401);
    const userId = claims.claims.sub;

    const body = (await req.json()) as ChargeRequest;
    if (!body.amount || body.amount <= 0) return json({ error: 'Valor inválido' }, 400);
    if (!['credit', 'debit', 'pix', 'voucher'].includes(body.payment_method)) {
      return json({ error: 'Método de pagamento inválido' }, 400);
    }

    const { data: settings } = await supabase
      .from('tef_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (!settings?.enabled) {
      return json({ error: 'TEF não está habilitado nas configurações' }, 400);
    }

    // Cria registro pendente
    const { data: tx, error: txErr } = await supabase
      .from('tef_transactions')
      .insert({
        order_id: body.order_id ?? null,
        amount: body.amount,
        installments: body.installments ?? 1,
        payment_method: body.payment_method,
        status: 'pending',
        performed_by: userId,
      })
      .select()
      .single();

    if (txErr || !tx) return json({ error: txErr?.message ?? 'Falha ao criar transação' }, 500);

    // === MODO CONNECT (agente local) ===
    if (settings.mode === 'connect') {
      return json({
        mode: 'connect',
        transaction_id: tx.id,
        agent_url: settings.agent_url || 'http://localhost:9999',
        stone_code: settings.stone_code,
        payload: {
          amount: Math.round(body.amount * 100),
          installments: body.installments ?? 1,
          method: body.payment_method,
          reference: tx.id,
        },
      });
    }

    // === MODO API (Stone Open API) ===
    const stoneClientId = Deno.env.get('STONE_CLIENT_ID');
    const stoneClientSecret = Deno.env.get('STONE_CLIENT_SECRET');
    const stoneStoneCode = settings.stone_code || Deno.env.get('STONE_MERCHANT_ID');

    // Sem credenciais → MOCK (para você testar enquanto aguarda a Stone)
    if (!stoneClientId || !stoneClientSecret) {
      const mockResp = {
        status: 'approved' as const,
        nsu: String(Date.now()).slice(-9),
        authorization_code: Math.random().toString(36).slice(2, 8).toUpperCase(),
        card_brand: body.payment_method === 'pix' ? null : 'VISA',
        card_last_digits: body.payment_method === 'pix' ? null : '1234',
      };

      await supabase.from('tef_transactions').update({
        status: mockResp.status,
        nsu: mockResp.nsu,
        authorization_code: mockResp.authorization_code,
        card_brand: mockResp.card_brand,
        card_last_digits: mockResp.card_last_digits,
        raw_response: { mock: true, ...mockResp },
      }).eq('id', tx.id);

      return json({
        mode: 'api',
        transaction_id: tx.id,
        mock: true,
        ...mockResp,
      });
    }

    // === Integração real Stone Open API ===
    try {
      // 1) OAuth client_credentials → access token
      const tokenResp = await fetch(`${STONE_API_BASE}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: stoneClientId,
          client_secret: stoneClientSecret,
        }),
      });

      if (!tokenResp.ok) {
        const errText = await tokenResp.text();
        await markTxError(supabase, tx.id, `OAuth Stone falhou: ${errText}`);
        return json({ error: 'Falha ao autenticar na Stone', detail: errText }, 502);
      }

      const tokenData = await tokenResp.json();
      const accessToken = tokenData.access_token;

      // 2) Criar charge na Stone
      const chargePayload: Record<string, unknown> = {
        amount: Math.round(body.amount * 100),
        currency: 'BRL',
        payment_method: body.payment_method === 'credit' ? 'credit_card' : 'debit_card',
        installments: body.installments ?? 1,
        reference_id: tx.id,
        merchant_id: stoneStoneCode,
      };

      const chargeResp = await fetch(`${STONE_API_BASE}/api/v1/charges`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': tx.id,
        },
        body: JSON.stringify(chargePayload),
      });

      const chargeData = await chargeResp.json();

      if (!chargeResp.ok) {
        await markTxError(supabase, tx.id, chargeData?.message || 'Stone recusou cobrança');
        return json({
          mode: 'api',
          transaction_id: tx.id,
          status: 'declined',
          error: chargeData?.message || 'Cobrança recusada',
        });
      }

      const stoneStatus = chargeData?.status || 'pending';
      const approved = stoneStatus === 'approved' || stoneStatus === 'paid' || stoneStatus === 'succeeded';

      const result = {
        status: approved ? 'approved' : 'declined',
        nsu: chargeData?.nsu ?? chargeData?.acquirer?.nsu ?? null,
        authorization_code: chargeData?.authorization_code ?? chargeData?.acquirer?.authorization_code ?? null,
        card_brand: chargeData?.card?.brand ?? null,
        card_last_digits: chargeData?.card?.last_digits ?? chargeData?.card?.last4 ?? null,
      };

      await supabase.from('tef_transactions').update({
        status: result.status,
        nsu: result.nsu,
        authorization_code: result.authorization_code,
        card_brand: result.card_brand,
        card_last_digits: result.card_last_digits,
        raw_response: chargeData,
      }).eq('id', tx.id);

      return json({
        mode: 'api',
        transaction_id: tx.id,
        ...result,
      });
    } catch (apiErr) {
      const msg = (apiErr as Error).message;
      await markTxError(supabase, tx.id, msg);
      return json({ error: `Erro ao chamar Stone: ${msg}` }, 502);
    }
  } catch (err) {
    console.error('[tef-stone-charge] erro', err);
    return json({ error: (err as Error).message }, 500);
  }
});

async function markTxError(supabase: ReturnType<typeof createClient>, txId: string, message: string) {
  await supabase.from('tef_transactions').update({
    status: 'error',
    error_message: message,
  }).eq('id', txId);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
