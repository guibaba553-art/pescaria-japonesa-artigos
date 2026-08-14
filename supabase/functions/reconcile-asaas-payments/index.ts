import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

/**
 * Conciliação de pedidos Asaas que ficaram sem asaas_payment_id no banco.
 *
 * Causa raiz do incidente (11-13/08/2026): o UPDATE que gravava asaas_payment_id
 * falhava silenciosamente porque a coluna asaas_invoice_number não existia e o
 * erro não era checado. A cobrança era criada no Asaas, mas o ID nunca era
 * persistido — o webhook não casava o pagamento e o pedido ficava sem ID.
 *
 * Esta função:
 *   1. lista pedidos do SITE (source='site') sem payment_id e sem asaas_payment_id,
 *      em QUALQUER status (aguardando_pagamento, cancelado, etc.), a partir de uma
 *      data de corte — pedidos PDV são excluídos (não passam pelo Asaas);
 *   2. agrupa por customer Asaas + valor (pedidos repetidos ficam no mesmo grupo);
 *   3. consulta GET /v3/payments?customer=... no Asaas filtrando por data (com paginação);
 *   4. casa por valor (total_amount) e faz pareamento 1:1 em ordem cronológica —
 *      cada pedido recebe uma cobrança distinta; excedentes ficam como
 *      'unmatched_payment' para revisão manual;
 *   5. faz o backfill de asaas_payment_id / payment_gateway / payment_method /
 *      asaas_invoice_number / asaas_installment_id.
 *
 * IMPORTANTE: a função NÃO altera status nem baixa estoque — apenas reconcilia
 * o ID de pagamento. Pedidos cancelados ou pagos permanecem como estão; a
 * decisão de restaurar é manual (via admin).
 *
 * Auth: exige CRON_SECRET (Bearer ou header x-cron-secret), como as demais funções
 * administrativas. É executada manualmente, não via cron.
 *
 * Uso (dry-run primeiro):
 *   curl -X POST https://<ref>/functions/v1/reconcile-asaas-payments \
 *     -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" \
 *     -d '{"dryRun": true, "cutoff": "2026-08-12"}'
 *
 * Para aplicar de verdade: {"dryRun": false, "cutoff": "2026-08-12"}
 *
 * cutoff default: 2026-08-12 — a conciliação atua apenas em pedidos criados
 * a partir de 12/08 (pedidos de 11/08 foram tratados manualmente).
 */

const requestSchema = z.object({
  dryRun: z.boolean().optional().default(true),
  cutoff: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "cutoff deve estar no formato YYYY-MM-DD").optional().default("2026-08-12"),
});

const ASAAS_FINAL_STATUSES = ["RECEIVED", "CONFIRMED"];

const LIST_LIMIT = 100;

/**
 * Tolerância (em reais) para o match de valor.
 * Em parcelamentos, o total pode divergir em 1 centavo por arredondamento
 * (ex.: Math.floor(total*100/n)/100 no cálculo da parcela + ajuste na última).
 * Um drift exato de 1 centavo não pode virar no_match falso.
 */
const VALUE_TOLERANCE = 0.01;

function toIsoDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Lista todas as cobranças de um customer na janela de datas, seguindo a
 * paginação (hasMore/offset) para não perder cobranças quando houver >100
 * resultados. Retorna null em caso de erro HTTP.
 */
async function listAsaasPayments(
  baseUrl: string,
  headers: Record<string, string>,
  customerId: string,
  from: Date,
  to: Date,
): Promise<Array<Record<string, unknown>> | null> {
  const all: Array<Record<string, unknown>> = [];
  let offset = 0;

  for (;;) {
    const url = new URL(`${baseUrl}/v3/payments`);
    url.searchParams.set("customer", customerId);
    url.searchParams.set("limit", String(LIST_LIMIT));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("dateCreated[ge]", toIsoDateOnly(from.toISOString()));
    url.searchParams.set("dateCreated[le]", toIsoDateOnly(to.toISOString()));

    const resp = await fetch(url.toString(), { headers });
    if (!resp.ok) return null;

    const data = await resp.json();
    const items: Array<Record<string, unknown>> = data?.data ?? [];
    all.push(...items);

    if (!data?.hasMore || items.length === 0) break;
    offset += items.length;
  }

  return all;
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  const authHeader = req.headers.get("authorization");
  const cronHeader = req.headers.get("x-cron-secret");
  const isAuthorized = (!!cronSecret && authHeader === `Bearer ${cronSecret}`)
    || (!!cronSecret && cronHeader === cronSecret);
  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      /* body vazio é aceito — usa defaults */
    }
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid input", details: parsed.error.errors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { dryRun, cutoff } = parsed.data;

    const asaasApiKey = Deno.env.get("ASAAS_API_KEY");
    const asaasEnv = Deno.env.get("ASAAS_ENVIRONMENT") || "sandbox";
    if (!asaasApiKey) {
      return new Response(JSON.stringify({ error: "ASAAS_API_KEY não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const asaasBaseUrl = asaasEnv === "production"
      ? "https://api.asaas.com"
      : "https://api-sandbox.asaas.com";
    const asaasHeaders: Record<string, string> = {
      "access_token": asaasApiKey,
      "Content-Type": "application/json",
      "User-Agent": "JapasPesca/1.0.0",
    };

    // ── 1. Pedidos do site sem ID de pagamento (qualquer status) ─────────
    // Apenas pedidos do SITE passam pelo Asaas. Pedidos PDV (source='pdv') são
    // vendas na loja e legitimamente não têm ID de pagamento — são excluídos.
    // Só concilia o ID — NÃO muda status nem baixa estoque. O status fica como
    // está (aguardando_pagamento, cancelado, etc.); a decisão de restaurar é manual.
    const { data: orphanOrders, error: fetchError } = await supabase
      .from("orders")
      .select("id, user_id, total_amount, created_at, delivery_type, shipping_service_id")
      .eq("source", "site")
      .is("payment_id", null)
      .is("asaas_payment_id", null)
      .gte("created_at", `${cutoff}T00:00:00Z`);

    if (fetchError) {
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orders = orphanOrders ?? [];
    const report: Array<Record<string, unknown>> = [];
    let matched = 0;
    let applied = 0;

    // ── 2. Resolve customer Asaas e agrupa pedidos por customer + valor ───
    // Pedidos repetidos (mesmo cliente, mesmo valor, horário próximo) ficam
    // no mesmo grupo e são pareados 1:1 em ordem cronológica com as cobranças.
    const groups = new Map<string, Array<Record<string, unknown>>>();

    for (const order of orders) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("asaas_customer_id")
        .eq("id", order.user_id as string)
        .maybeSingle();

      const customerId = profile?.asaas_customer_id as string | undefined;
      if (!customerId) {
        report.push({ orderId: order.id as string, status: "no_customer", detail: "profiles.asaas_customer_id ausente" });
        continue;
      }

      const key = `${customerId}|${Number(order.total_amount).toFixed(2)}`;
      const list = groups.get(key) ?? [];
      list.push({ ...order, customerId });
      groups.set(key, list);
    }

    // ── 3. Para cada grupo, busca cobranças e faz pareamento 1:1 ──────────
    for (const [, groupOrders] of groups) {
      const customerId = groupOrders[0].customerId as string;
      const totalAmount = Number(groupOrders[0].total_amount);

      // Janela compartilhada do grupo: min(created_at)-3d .. max(created_at)+3d
      const times = groupOrders.map((o) => Date.parse(o.created_at as string));
      const from = new Date(Math.min(...times) - 3 * 24 * 60 * 60 * 1000);
      const to = new Date(Math.max(...times) + 3 * 24 * 60 * 60 * 1000);

      const payments = await listAsaasPayments(asaasBaseUrl, asaasHeaders, customerId, from, to);
      if (payments === null) {
        for (const o of groupOrders) {
          report.push({ orderId: o.id as string, status: "asaas_error", detail: "list payments HTTP error" });
        }
        continue;
      }

      // ── Cobranças candidatas (valor efetivo) ────────────────────────────
      // Cobranças parceladas têm o `value` da PARCELA (não o total do pedido).
      // O total real fica em GET /v3/installments/{id} -> `value`. Para essas,
      // busca o total e usa como valor efetivo de match. Várias parcelas do
      // mesmo parcelamento contam como UMA cobrança (dedupe por installment).
      const installmentIds = new Set<string>();
      for (const p of payments) {
        if (typeof p.installment === "string" && p.installment) {
          installmentIds.add(p.installment as string);
        }
      }
      const installmentTotals = new Map<string, number>();
      for (const iid of installmentIds) {
        try {
          const instResp = await fetch(`${asaasBaseUrl}/v3/installments/${iid}`, { headers: asaasHeaders });
          if (instResp.ok) {
            const instData = await instResp.json();
            installmentTotals.set(iid, Number(instData?.value) || 0);
          }
        } catch {
          /* parcelamento indisponível — mantém 0 e não casa */
        }
      }

      const seenInstallments = new Set<string>();
      const effectivePayments: Array<Record<string, unknown>> = [];
      for (const p of payments) {
        const iid = p.installment as string | undefined;
        if (iid) {
          if (seenInstallments.has(iid)) continue; // mesma cobrança parcelada
          seenInstallments.add(iid);
          const total = installmentTotals.get(iid) ?? 0;
          effectivePayments.push({ ...p, _effectiveValue: total });
        } else {
          effectivePayments.push({ ...p, _effectiveValue: Number(p.value) });
        }
      }

      // Mesmo valor efetivo (tolerância de 1 centavo p/ drift de arredondamento),
      // ordenadas por data de criação.
      const valuePayments = effectivePayments
        .filter((p) => Math.abs(Number(p._effectiveValue) - totalAmount) <= VALUE_TOLERANCE)
        .sort((a, b) => String(a.dateCreated).localeCompare(String(b.dateCreated)));

      // Pedidos ordenados por data de criação (mais antigo primeiro).
      const sortedOrders = [...groupOrders].sort((a, b) =>
        String(a.created_at).localeCompare(String(b.created_at))
      );

      for (let i = 0; i < sortedOrders.length; i++) {
        const order = sortedOrders[i];
        const orderId = order.id as string;
        const payment = valuePayments[i];

        // Sem cobrança suficiente na janela para este pedido.
        if (!payment) {
          // Nenhuma cobrança com o valor do pedido na janela — lista o que
          // EXISTE no Asaas para o customer (outros valores/datas) para revisão.
          if (valuePayments.length === 0) {
            report.push({
              orderId,
              status: "no_match",
              detail: "nenhuma cobrança com este valor na janela",
              paymentsFound: effectivePayments.map((p) => ({
                id: p.id,
                value: p.value,
                effectiveValue: p._effectiveValue,
                status: p.status,
                billingType: p.billingType,
                dateCreated: p.dateCreated,
              })),
            });
          } else {
            report.push({
              orderId,
              status: "no_match",
              detail: "pedidos repetidos excedem as cobranças disponíveis na janela",
            });
          }
          continue;
        }

        const paymentId = payment.id as string;
        const billingType = payment.billingType as string;
        const paymentStatus = payment.status as string;
        const invoiceNumber = (payment.invoiceNumber as string | undefined) || null;
        const installmentId = (payment.installment as string | undefined) || null;

        // Apenas mapeia billingTypes conhecidos; BOLETO/UNDEFINED etc. ficam como
        // estão no Asaas para não gravar payment_method inválido (ex.: 'debit_card').
        const paymentMethod = billingType === "PIX"
          ? "pix"
          : billingType === "CREDIT_CARD"
          ? "credit_card"
          : billingType;
        matched += 1;

        const isFinal = ASAAS_FINAL_STATUSES.includes(paymentStatus);

        if (dryRun) {
          report.push({
            orderId,
            status: "dry_run",
            paymentId,
            paymentStatus,
            wouldSetEmPreparo: isFinal,
          });
          continue;
        }

        // ── 4. backfill — apenas o ID de pagamento ────────────────────────
        // NÃO altera status nem baixa estoque: pedidos cancelados/pagos ficam
        // como estão; a decisão de restaurar é manual.
        // asaas_payment_id em UPDATE próprio, isolado de colunas opcionais
        // (asaas_invoice_number / asaas_installment_id) que podem não existir
        // no banco — o ID precisa ser gravado mesmo se uma coluna opcional falhar.
        const { error: updateErr } = await supabase
          .from("orders")
          .update({
            asaas_payment_id: paymentId,
            payment_gateway: "asaas",
            payment_method: paymentMethod,
          })
          .eq("id", orderId)
          .is("asaas_payment_id", null);

        if (updateErr) {
          report.push({ orderId, status: "update_error", detail: updateErr.message, paymentId });
          continue;
        }

        // Colunas opcionais — falha aqui não impede a gravação do payment_id.
        const optionalData: Record<string, unknown> = {};
        if (invoiceNumber) optionalData.asaas_invoice_number = invoiceNumber;
        if (installmentId) optionalData.asaas_installment_id = installmentId;
        if (Object.keys(optionalData).length > 0) {
          const { error: optionalErr } = await supabase
            .from("orders")
            .update(optionalData)
            .eq("id", orderId);
          if (optionalErr) {
            console.error(
              `[reconcile-asaas-payments] colunas opcionais para ${orderId} (não-bloqueante):`,
              optionalErr.message,
            );
          }
        }

        applied += 1;
        report.push({
          orderId,
          status: "applied",
          paymentId,
          paymentStatus,
          setEmPreparo: false,
        });
      }

      // Cobranças excedentes na janela (sem pedido correspondente) — para revisão.
      for (let i = sortedOrders.length; i < valuePayments.length; i++) {
        report.push({
          orderId: null,
          status: "unmatched_payment",
          paymentId: valuePayments[i].id,
          dateCreated: valuePayments[i].dateCreated,
          value: valuePayments[i].value,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        dryRun,
        cutoff,
        orphanOrders: orders.length,
        matched,
        applied,
        report,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("reconcile-asaas-payments error", err);
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

if (!Deno.env.get("DENO_TEST")) {
  serve(handleRequest);
}
