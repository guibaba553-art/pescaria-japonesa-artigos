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

    // Carrega configurações
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
    // Retorna instruções para o front chamar localhost:9999
    if (settings.mode === 'connect') {
      return json({
        mode: 'connect',
        transaction_id: tx.id,
        agent_url: settings.agent_url || 'http://localhost:9999',
        stone_code: settings.stone_code,
        payload: {
          amount: Math.round(body.amount * 100), // em centavos
          installments: body.installments ?? 1,
          method: body.payment_method,
          reference: tx.id,
        },
      });
    }

    // === MODO API (cloud / Stone Open API) ===
    // TODO: substituir por chamada real à Stone quando credenciais estiverem disponíveis
    const stoneClientId = Deno.env.get('STONE_CLIENT_ID');
    const stoneClientSecret = Deno.env.get('STONE_CLIENT_SECRET');

    if (!stoneClientId || !stoneClientSecret) {
      // MOCK temporário: aprova após simulação
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

    // (espaço para integração real futura com Stone Open API)
    return json({ error: 'Integração Stone API ainda não implementada' }, 501);
  } catch (err) {
    console.error('[tef-stone-charge] erro', err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
