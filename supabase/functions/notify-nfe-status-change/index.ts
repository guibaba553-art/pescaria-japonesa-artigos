import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Auth: aceita CRON_SECRET (usado pelo trigger via pg_net) OU JWT de admin/employee
    const cronSecret = Deno.env.get('CRON_SECRET');
    const provided = req.headers.get('x-cron-secret');
    const authHeader = req.headers.get('Authorization');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    let authorized = false;
    if (cronSecret && provided && provided === cronSecret) {
      authorized = true;
    } else if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { data: u } = await supabase.auth.getUser(token);
      if (u?.user) {
        const { data: roles } = await supabase
          .from('user_roles').select('role')
          .eq('user_id', u.user.id).in('role', ['admin']);
        if (roles && roles.length > 0) authorized = true;
      }
    }

    if (!authorized) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const {
      emission_id, modelo, numero, status, error_message, emitted_at, order_id,
    } = body || {};

    if (!emission_id || !status) {
      return new Response(JSON.stringify({ error: 'emission_id e status obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Buscar emails dos admins
    const { data: adminRoles, error: rolesErr } = await supabase
      .from('user_roles').select('user_id').eq('role', 'admin');
    if (rolesErr) throw rolesErr;

    const adminIds = (adminRoles || []).map(r => r.user_id);
    if (adminIds.length === 0) {
      return new Response(JSON.stringify({ message: 'Sem admins cadastrados' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Buscar emails via auth.admin
    const recipients: string[] = [];
    for (const id of adminIds) {
      const { data: u } = await supabase.auth.admin.getUserById(id);
      if (u?.user?.email) recipients.push(u.user.email);
    }

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ message: 'Admins sem email' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const emittedFmt = emitted_at
      ? new Date(emitted_at).toLocaleString('pt-BR', { timeZone: 'America/Cuiaba' })
      : undefined;

    const results: any[] = [];
    for (const email of recipients) {
      const { data, error } = await supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'nfe-error-notification',
          recipientEmail: email,
          idempotencyKey: `nfe-${status}-${emission_id}-${email}`,
          templateData: {
            modelo: modelo ? String(modelo) : undefined,
            numero,
            status,
            errorMessage: error_message,
            emittedAt: emittedFmt,
            orderId: order_id,
          },
        },
      });
      results.push({ email, ok: !error, error: error?.message, data });
    }

    return new Response(JSON.stringify({ sent: results.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('notify-nfe-status-change error:', e);
    return new Response(JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
