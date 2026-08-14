import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { handlePaymentConfirmed } from "../_shared/stockHandler.ts";

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
 * persistido — o webhook não casava o pagamento e o pedido ficava preso em
 * 'aguardando_pagamento'.
 *
 * Esta função:
 *   1. lista pedidos 'aguardando_pagamento' sem payment_id e sem asaas_payment_id
 *      (a partir de uma data de corte);
 *   2. para cada um, busca profiles.asaas_customer_id;
 *   3. consulta GET /v3/payments?customer=... no Asaas filtrando por data;
 *   4. casa por valor (total_amount); se houver mais de uma com o mesmo valor,
 *      marca como 'ambiguous' para revisão manual;
 *   5. faz o backfill de asaas_payment_id / payment_gateway / payment_method /
 *      asaas_invoice_number / asaas_installment_id;
 *   6. se a cobrança estiver RECEIVED/CONFIRMED, transiciona o pedido para
 *      'em_preparo' e baixa o estoque (via handlePaymentConfirmed, idempotente).
 *
 * Auth: exige CRON_SECRET (Bearer ou header x-cron-secret), como as demais funções
 * administrativas. É executada manualmente, não via cron.
 *
 * Uso (dry-run primeiro):
 *   curl -X POST https://<ref>/functions/v1/reconcile-asaas-payments \
 *     -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" \
 *     -d '{"dryRun": true, "cutoff": "2026-08-11"}'
 *
 * Para aplicar de verdade: {"dryRun": false, "cutoff": "2026-08-11"}
 */

const requestSchema = z.object({
  dryRun: z.boolean().optional().default(true),
  cutoff: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "cutoff deve estar no formato YYYY-MM-DD").optional().default("2026-08-11"),
});

const ASAAS_FINAL_STATUSES = ["RECEIVED", "CONFIRMED"];

function toIsoDateOnly(iso: string): string {
  return iso.slice(0, 10);
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

    // ── 1. Pedidos órfãos ────────────────────────────────────────────────
    const { data: orphanOrders, error: fetchError } = await supabase
      .from("orders")
      .select("id, user_id, total_amount, created_at, delivery_type, shipping_service_id")
      .eq("status", "aguardando_pagamento")
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

    for (const order of orders) {
      const orderId = order.id as string;
      const totalAmount = Number(order.total_amount);
      const createdAt = order.created_at as string;

      try {
        // ── 2. customer Asaas via profiles ───────────────────────────────
        const { data: profile } = await supabase
          .from("profiles")
          .select("asaas_customer_id")
          .eq("id", order.user_id as string)
          .maybeSingle();

        const customerId = profile?.asaas_customer_id as string | undefined;
        if (!customerId) {
          report.push({ orderId, status: "no_customer", detail: "profiles.asaas_customer_id ausente" });
          continue;
        }

        // ── 3. lista cobranças do customer no Asaas (janela ±3 dias) ─────
        const from = new Date(Date.parse(createdAt) - 3 * 24 * 60 * 60 * 1000);
        const to = new Date(Date.parse(createdAt) + 3 * 24 * 60 * 60 * 1000);

        const listUrl = new URL(`${asaasBaseUrl}/v3/payments`);
        listUrl.searchParams.set("customer", customerId);
        listUrl.searchParams.set("limit", "100");
        listUrl.searchParams.set("dateCreated[ge]", toIsoDateOnly(from.toISOString()));
        listUrl.searchParams.set("dateCreated[le]", toIsoDateOnly(to.toISOString()));

        const listResp = await fetch(listUrl.toString(), { headers: asaasHeaders });
        if (!listResp.ok) {
          report.push({ orderId, status: "asaas_error", detail: `list payments HTTP ${listResp.status}` });
          continue;
        }
        const listData = await listResp.json();
        const payments: Array<Record<string, unknown>> = listData?.data ?? [];

        // ── 4. casa por valor ────────────────────────────────────────────
        const valueMatches = payments.filter((p) =>
          Math.abs(Number(p.value) - totalAmount) < 0.01
        );

        if (valueMatches.length === 0) {
          report.push({ orderId, status: "no_match", detail: "nenhuma cobrança com mesmo valor" });
          continue;
        }
        if (valueMatches.length > 1) {
          report.push({
            orderId,
            status: "ambiguous",
            detail: `${valueMatches.length} cobranças com mesmo valor — revisão manual`,
            candidates: valueMatches.map((p) => ({ id: p.id, status: p.status, dateCreated: p.dateCreated })),
          });
          continue;
        }

        const payment = valueMatches[0];
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

        // ── 5. backfill ──────────────────────────────────────────────────
        const backfill: Record<string, unknown> = {
          asaas_payment_id: paymentId,
          payment_gateway: "asaas",
          payment_method: paymentMethod,
        };
        if (invoiceNumber) backfill.asaas_invoice_number = invoiceNumber;
        if (installmentId) backfill.asaas_installment_id = installmentId;
        if (isFinal) {
          backfill.status = "em_preparo";
          backfill.payment_received_at = new Date().toISOString();
        }

        const { error: updateErr } = await supabase
          .from("orders")
          .update(backfill)
          .eq("id", orderId)
          .eq("status", "aguardando_pagamento");

        if (updateErr) {
          report.push({ orderId, status: "update_error", detail: updateErr.message, paymentId });
          continue;
        }

        // ── 6. baixa de estoque quando pago ──────────────────────────────
        if (isFinal) {
          try {
            await handlePaymentConfirmed(supabase, supabaseUrl, serviceKey, orderId);
          } catch (stockErr) {
            console.error(`[reconcile-asaas-payments] estoque para ${orderId}:`, stockErr);
          }
        }

        applied += 1;
        report.push({
          orderId,
          status: "applied",
          paymentId,
          paymentStatus,
          setEmPreparo: isFinal,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[reconcile-asaas-payments] erro no pedido ${orderId}:`, msg);
        report.push({ orderId, status: "error", detail: msg });
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
