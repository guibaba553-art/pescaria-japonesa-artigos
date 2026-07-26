# Comprovante de Reembolso na Tela do Cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar status visual `reembolsado` na timeline do cliente, com card de reembolso, modal de comprovante, PDF exportável e link para o recibo oficial da operadora.

**Architecture:** Novo status `reembolsado` no tipo `OrderStatus`, card dedicado na `OrderTrackingTimeline`, modal `RefundReceiptDialog` com PDF via jspdf, edge function `get-order-refund` para expor dados ao cliente, e ajuste nas 4 edge functions de reembolso para usar o novo status.

**Tech Stack:** React, TypeScript, Tailwind CSS, lucide-react, jspdf (já no projeto), Supabase Edge Functions (Deno), PostgreSQL

## Global Constraints

- Manter compatibilidade com ambos gateways: Asaas e Mercado Pago
- Não alterar RLS da tabela `payment_refunds`
- `jspdf` e `jspdf-autotable` já estão instalados (package.json)
- Seguir padrões existentes do projeto (componentes, edge functions, migrations)

---

### Task 1: Novo status `reembolsado` nos tipos e config

**Files:**
- Modify: `src/lib/orderStatus.ts`
- Modify: `src/components/OrderTrackingTimeline.tsx`

**Interfaces:**
- Produces: `OrderStatus` type extended with `'reembolsado'`, `statusConfig.reembolsado`, `OrderTrackingTimeline` type with `'reembolsado'`

- [ ] **Step 1: Adicionar `reembolsado` ao `OrderStatus` em `src/lib/orderStatus.ts`**

```typescript
// Linha 3-13 — adicionar 'reembolsado' ao union type
export type OrderStatus =
  | 'aguardando_pagamento'
  | 'em_preparo'
  | 'aguardando_envio'
  | 'enviado'
  | 'entregado'
  | 'retirado'
  | 'cancelado'
  | 'devolucao_solicitada'
  | 'devolvido'
  | 'pronto_retirada'
  | 'reembolsado';
```

- [ ] **Step 2: Adicionar config visual em `statusConfig`**

```typescript
// Após a entrada 'devolvido' (linha ~82), adicionar:
reembolsado: {
  label: 'Reembolsado',
  icon: Undo2,
  badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20',
  accentClass: 'border-l-emerald-500',
},
```

- [ ] **Step 3: Adicionar `reembolsado` ao tipo em `src/components/OrderTrackingTimeline.tsx`**

```typescript
// Linha 4-12 — adicionar 'reembolsado' ao union type
type OrderStatus =
  | 'aguardando_pagamento'
  | 'em_preparo'
  | 'enviado'
  | 'entregue'
  | 'entregado'
  | 'retirado'
  | 'pronto_retirada'
  | 'cancelado'
  | 'reembolsado';
```

- [ ] **Step 4: Rodar typecheck e commit**

```bash
npx tsc --noEmit
```

Expected: no new errors.

```bash
git add src/lib/orderStatus.ts src/components/OrderTrackingTimeline.tsx
git commit -m "feat: add reembolsado status to OrderStatus type and config"
```

---

### Task 2: Card de reembolso na OrderTrackingTimeline

**Files:**
- Modify: `src/components/OrderTrackingTimeline.tsx`

**Interfaces:**
- Consumes: `OrderStatus` with `'reembolsado'`, `Undo2` from lucide-react
- Produces: New card UI for `reembolsado` status, new props interface

- [ ] **Step 1: Adicionar `Undo2` ao import do lucide-react**

```typescript
// Linha 1 — adicionar Undo2
import { CheckCircle2, CreditCard, Package, Truck, Home, Store, XCircle, Undo2 } from 'lucide-react';
```

- [ ] **Step 2: Adicionar novas props ao `OrderTrackingTimelineProps`**

```typescript
// Após linha 19, adicionar:
interface OrderTrackingTimelineProps {
  status: OrderStatus;
  deliveryType?: 'delivery' | 'pickup';
  cancellationReason?: string;
  isExpired?: boolean;
  refundAmount?: number;
  refundDate?: string;
  refundReason?: string;
  onViewReceipt?: () => void;
  onDownloadPdf?: () => void;
}
```

- [ ] **Step 3: Adicionar import do Button**

```typescript
// Linha 1 ou 2 — adicionar
import { Button } from '@/components/ui/button';
```

- [ ] **Step 4: Adicionar bloco de renderização `reembolsado`**

Após a linha 56 (`const isCancelled = status === 'cancelado' || isExpired;`), antes do `if (isCancelled)`, adicionar:

```typescript
const isRefunded = status === 'reembolsado';

if (isRefunded) {
  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl border bg-emerald-500/5 border-emerald-500/20">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
          <Undo2 className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <p className="font-semibold text-emerald-700 dark:text-emerald-400">
            Pedido Reembolsado
          </p>
          {refundAmount !== undefined && (
            <p className="text-sm text-muted-foreground">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(refundAmount)} estornado{refundDate ? ` em ${new Date(refundDate).toLocaleDateString('pt-BR')}` : ''}
            </p>
          )}
          {refundReason && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1" title={refundReason}>
              Motivo: {refundReason}
            </p>
          )}
        </div>
      </div>
      {(onViewReceipt || onDownloadPdf) && (
        <div className="flex items-center gap-2">
          {onViewReceipt && (
            <Button size="sm" variant="outline" onClick={onViewReceipt}>
              Ver comprovante
            </Button>
          )}
          {onDownloadPdf && (
            <Button size="sm" variant="outline" onClick={onDownloadPdf}>
              Baixar PDF
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Rodar typecheck e commit**

```bash
npx tsc --noEmit
```

```bash
git add src/components/OrderTrackingTimeline.tsx
git commit -m "feat: add refund card UI to OrderTrackingTimeline"
```

---

### Task 3: Modal de comprovante `RefundReceiptDialog`

**Files:**
- Create: `src/components/RefundReceiptDialog.tsx`

**Interfaces:**
- Produces: `RefundReceiptDialog` component with props for order/refund data, PDF download

- [ ] **Step 1: Criar `src/components/RefundReceiptDialog.tsx`**

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, ExternalLink } from 'lucide-react';
import jsPDF from 'jspdf';

interface RefundReceiptData {
  orderId: string;
  amount: number;
  date: string;
  paymentMethod: string;
  gatewayRefundId: string;
  reason: string;
  status: string;
  transactionReceiptUrl?: string;
}

interface RefundReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: RefundReceiptData;
}

const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const paymentMethodLabels: Record<string, string> = {
  credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
  pix: 'PIX',
  boleto: 'Boleto',
};

export function generateRefundPdf(data: RefundReceiptData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  doc.setFontSize(18);
  doc.setTextColor(0, 128, 0);
  doc.text('Comprovante de Reembolso', pageWidth / 2, y, { align: 'center' });

  y += 10;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text('JapasPesca', pageWidth / 2, y, { align: 'center' });

  y += 12;
  doc.setDrawColor(220, 220, 220);
  doc.line(15, y, pageWidth - 15, y);

  y += 10;
  doc.setFontSize(11);
  doc.setTextColor(60, 60, 60);

  const rows: [string, string][] = [
    ['Pedido', `#${data.orderId.slice(0, 8).toUpperCase()}`],
    ['Valor reembolsado', formatBRL(data.amount)],
    ['Data do reembolso', formatDate(data.date)],
    ['Método de pagamento', paymentMethodLabels[data.paymentMethod] || data.paymentMethod],
    ['ID da transação', data.gatewayRefundId],
    ['Motivo', data.reason || '—'],
    ['Status', data.status === 'approved' ? 'Aprovado' : data.status === 'pending' ? 'Pendente' : data.status],
  ];

  doc.setFontSize(11);
  for (const [label, value] of rows) {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, 20, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, 80, y);
    y += 8;
  }

  y += 10;
  doc.setDrawColor(220, 220, 220);
  doc.line(15, y, pageWidth - 15, y);

  y += 8;
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`Emitido em ${new Date().toLocaleDateString('pt-BR')}`, pageWidth / 2, y, { align: 'center' });

  doc.save(`comprovante-reembolso-${data.orderId.slice(0, 8)}.pdf`);
}

export function RefundReceiptDialog({ open, onOpenChange, data }: RefundReceiptDialogProps) {
  const handleDownload = () => generateRefundPdf(data);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Comprovante de Reembolso</DialogTitle>
          <DialogDescription>
            Detalhes do estorno realizado para o seu pedido.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            {[
              ['Pedido', `#${data.orderId.slice(0, 8).toUpperCase()}`],
              ['Valor reembolsado', formatBRL(data.amount)],
              ['Data', formatDate(data.date)],
              ['Método de pagamento', paymentMethodLabels[data.paymentMethod] || data.paymentMethod],
              ['ID da transação', data.gatewayRefundId],
              ['Motivo', data.reason || '—'],
              ['Status', data.status === 'approved' ? 'Aprovado' : data.status === 'pending' ? 'Pendente' : data.status],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between items-start">
                <span className="text-sm text-muted-foreground">{label}</span>
                <span className="text-sm font-medium text-right max-w-[60%] break-all">{value}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={handleDownload} className="w-full">
              <Download className="w-4 h-4 mr-2" />
              Baixar PDF
            </Button>
            {data.transactionReceiptUrl && (
              <a
                href={data.transactionReceiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground text-center flex items-center justify-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                Visualizar no site da operadora de pagamento
              </a>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Rodar typecheck e commit**

```bash
npx tsc --noEmit
```

```bash
git add src/components/RefundReceiptDialog.tsx
git commit -m "feat: add RefundReceiptDialog with PDF generation"
```

---

### Task 4: Edge Function `get-order-refund`

**Files:**
- Create: `supabase/functions/get-order-refund/index.ts`

**Interfaces:**
- Produces: `POST /functions/v1/get-order-refund` — retorna dados de reembolso para o cliente dono do pedido

- [ ] **Step 1: Criar `supabase/functions/get-order-refund/index.ts`**

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authentication' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { orderId } = body;

    if (!orderId) {
      return new Response(JSON.stringify({ error: 'orderId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, user_id, payment_method')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return new Response(JSON.stringify({ error: 'Pedido não encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (order.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Acesso não autorizado' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: refunds, error: refundError } = await supabase
      .from('payment_refunds')
      .select('*')
      .eq('order_id', orderId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(1);

    if (refundError) {
      console.error('Error fetching refund:', refundError);
      return new Response(JSON.stringify({ error: 'Erro ao buscar reembolso' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!refunds || refunds.length === 0) {
      return new Response(JSON.stringify({ refund: null }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const refund = refunds[0];
    const transactionReceiptUrl = refund.gateway_response?.transactionReceiptUrl as string | undefined;

    return new Response(
      JSON.stringify({
        refund: {
          id: refund.id,
          amount: refund.amount,
          date: refund.created_at,
          gatewayRefundId: refund.gateway_refund_id,
          reason: refund.reason,
          status: refund.status,
          transactionReceiptUrl: transactionReceiptUrl || null,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/get-order-refund/index.ts
git commit -m "feat: add get-order-refund edge function"
```

---

### Task 5: Integração no Account.tsx

**Files:**
- Modify: `src/pages/Account.tsx`

**Interfaces:**
- Consumes: `OrderTrackingTimeline` updated, `RefundReceiptDialog` component, `supabase` client

- [ ] **Step 1: Adicionar campos ao tipo `Order` (linha 62)**

```typescript
// Modificar linha 62 — adicionar 'reembolsado' ao status union e refunded_amount
interface Order {
  id: string;
  total_amount: number;
  shipping_cost: number;
  shipping_address: string;
  status: 'aguardando_pagamento' | 'em_preparo' | 'enviado' | 'entregue' | 'entregado' | 'retirado' | 'pronto_retirada' | 'cancelado' | 'reembolsado';
  created_at: string;
  tracking_code?: string;
  delivery_type?: 'delivery' | 'pickup';
  order_items: OrderItem[];
  qr_code: string | null;
  qr_code_base64: string | null;
  ticket_url: string | null;
  pix_expiration: string | null;
  nfe_emissions?: NfeEmission[];
  cancellation_reason?: string;
  refunded_amount?: number;
}
```

- [ ] **Step 2: Adicionar imports no topo do arquivo**

```typescript
// Adicionar após os imports existentes:
import { RefundReceiptDialog } from '@/components/RefundReceiptDialog';
import { generateRefundPdf } from '@/components/RefundReceiptDialog';
import { Undo2 } from 'lucide-react';
```

- [ ] **Step 3: Adicionar estado para o dialog de comprovante**

Após o estado `trackingDialog` (linha ~100), adicionar:

```typescript
const [refundReceiptData, setRefundReceiptData] = useState<{
  orderId: string;
  amount: number;
  date: string;
  paymentMethod: string;
  gatewayRefundId: string;
  reason: string;
  status: string;
  transactionReceiptUrl?: string;
} | null>(null);
const [refundDialogOpen, setRefundDialogOpen] = useState(false);
```

- [ ] **Step 4: Adicionar função para buscar dados de reembolso**

Após os estados, adicionar:

```typescript
const handleViewRefundReceipt = async (orderId: string) => {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) return;

  const { data, error } = await supabase.functions.invoke('get-order-refund', {
    body: { orderId },
  });

  if (error || !data?.refund) {
    toast.error('Erro ao carregar comprovante', { description: 'Tente novamente mais tarde.' });
    return;
  }

  const { data: orderData } = await supabase
    .from('orders')
    .select('payment_method')
    .eq('id', orderId)
    .single();

  setRefundReceiptData({
    orderId,
    amount: data.refund.amount,
    date: data.refund.date,
    paymentMethod: orderData?.payment_method || '',
    gatewayRefundId: data.refund.gatewayRefundId,
    reason: data.refund.reason || '',
    status: data.refund.status,
    transactionReceiptUrl: data.refund.transactionReceiptUrl || undefined,
  });
  setRefundDialogOpen(true);
};

const handleDownloadRefundPdf = async (orderId: string) => {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) return;

  const { data, error } = await supabase.functions.invoke('get-order-refund', {
    body: { orderId },
  });

  if (error || !data?.refund) {
    toast.error('Erro ao gerar PDF', { description: 'Tente novamente mais tarde.' });
    return;
  }

  const { data: orderData } = await supabase
    .from('orders')
    .select('payment_method')
    .eq('id', orderId)
    .single();

  generateRefundPdf({
    orderId,
    amount: data.refund.amount,
    date: data.refund.date,
    paymentMethod: orderData?.payment_method || '',
    gatewayRefundId: data.refund.gatewayRefundId,
    reason: data.refund.reason || '',
    status: data.refund.status,
    transactionReceiptUrl: data.refund.transactionReceiptUrl || undefined,
  });
};
```

- [ ] **Step 5: Substituir o bloco da timeline (linha 594)**

```tsx
{/* Substituir as linhas 593-599 */}
<OrderTrackingTimeline
  status={order.status}
  deliveryType={order.delivery_type}
  cancellationReason={order.cancellation_reason}
  isExpired={expired}
  refundAmount={order.refunded_amount}
  refundReason={order.cancellation_reason}
  onViewReceipt={() => handleViewRefundReceipt(order.id)}
  onDownloadPdf={() => handleDownloadRefundPdf(order.id)}
/>
```

- [ ] **Step 6: Adicionar o dialog no JSX final (antes do fechamento do return principal)**

Localizar o `OrderTrackingDialog` existente (~linha 917) e adicionar após ele:

```tsx
{refundReceiptData && (
  <RefundReceiptDialog
    open={refundDialogOpen}
    onOpenChange={setRefundDialogOpen}
    data={refundReceiptData}
  />
)}
```

- [ ] **Step 7: Rodar typecheck e commit**

```bash
npx tsc --noEmit
```

```bash
git add src/pages/Account.tsx
git commit -m "feat: integrate refund receipt into Account page"
```

---

### Task 6: Migration — transições para `reembolsado`

**Files:**
- Create: `supabase/migrations/20260726_add_reembolsado_status.sql`

**Interfaces:**
- Produces: Nova versão da `validate_order_status_transition()` que aceita `reembolsado`

- [ ] **Step 1: Criar migration**

```sql
-- Adiciona o status 'reembolsado' como estado final nas transições de pedido.
-- Pedidos reembolsados não podem transitar para nenhum outro status.

CREATE OR REPLACE FUNCTION public.validate_order_status_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_old_status order_status;
  v_pending_count integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.source = 'pdv' AND NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role)) THEN
      RAISE EXCEPTION 'Apenas funcionários podem criar pedidos com origem PDV';
    END IF;

    IF NEW.source = 'site' THEN
      SELECT COUNT(*) INTO v_pending_count
      FROM public.orders
      WHERE user_id = NEW.user_id AND status = 'aguardando_pagamento';
      IF v_pending_count >= 3 THEN
        RAISE EXCEPTION 'Limite de 3 pedidos pendentes atingido. Cancele pedidos anteriores ou aguarde o pagamento.';
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.orders
        WHERE user_id = NEW.user_id AND created_at > NOW() - INTERVAL '15 seconds'
      ) THEN
        RAISE EXCEPTION 'Aguarde 15 segundos entre pedidos.';
      END IF;
    END IF;

    IF NEW.source = 'site' AND NEW.status != 'aguardando_pagamento' THEN
      RAISE EXCEPTION 'Pedidos do site devem ser criados com status aguardando_pagamento. Status recebido: %', NEW.status;
    END IF;
    IF NEW.source = 'pdv' AND NEW.status != 'entregado' THEN
      RAISE EXCEPTION 'Pedidos do PDV devem ser criados com status entregado. Status recebido: %', NEW.status;
    END IF;
    RETURN NEW;
  END IF;

  v_old_status := OLD.status;
  IF v_old_status = NEW.status THEN RETURN NEW; END IF;

  IF v_old_status = 'aguardando_pagamento' AND NEW.status = 'em_preparo' THEN
    IF auth.role() != 'service_role' THEN
      RAISE EXCEPTION 'Transição de aguardando_pagamento para em_preparo só é permitida via verificação de pagamento (webhook/verify-payment).';
    END IF;
    RETURN NEW;
  END IF;

  IF v_old_status = 'aguardando_pagamento' AND NEW.status = 'cancelado' THEN RETURN NEW; END IF;
  IF v_old_status = 'em_preparo' AND NEW.status IN ('aguardando_envio','pronto_retirada','retirado','cancelado','reembolsado') THEN RETURN NEW; END IF;
  IF v_old_status = 'pronto_retirada' AND NEW.status IN ('retirado','cancelado','reembolsado') THEN RETURN NEW; END IF;
  IF v_old_status = 'aguardando_envio' AND NEW.status IN ('enviado','em_preparo','cancelado','reembolsado') THEN RETURN NEW; END IF;
  IF v_old_status = 'enviado' AND NEW.status IN ('entregado','cancelado','reembolsado') THEN RETURN NEW; END IF;
  IF v_old_status IN ('entregado','retirado') AND NEW.status = 'cancelado' THEN RETURN NEW; END IF;
  IF v_old_status IN ('entregado','retirado') AND NEW.status = 'devolucao_solicitada' THEN RETURN NEW; END IF;
  IF v_old_status = 'devolucao_solicitada' AND NEW.status = 'devolvido' THEN RETURN NEW; END IF;
  IF v_old_status = 'retirado' AND NEW.status = 'devolvido' THEN RETURN NEW; END IF;
  IF v_old_status = 'devolucao_solicitada' AND NEW.status IN ('entregado','retirado') THEN RETURN NEW; END IF;
  IF v_old_status IN ('devolvido','cancelado','reembolsado') THEN
    RAISE EXCEPTION 'Não é possível alterar status de pedidos finalizados';
  END IF;
  RAISE EXCEPTION 'Transição de status inválida de % para %', v_old_status, NEW.status;
END; $$;

DROP TRIGGER IF EXISTS trg_validate_order_status_transition ON public.orders;
CREATE TRIGGER trg_validate_order_status_transition
BEFORE INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.validate_order_status_transition();
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260726_add_reembolsado_status.sql
git commit -m "feat: add reembolsado transitions to order status trigger"
```

---

### Task 7: Ajustar edge functions para usar `reembolsado`

**Files:**
- Modify: `supabase/functions/cancel-order/index.ts`
- Modify: `supabase/functions/refund-payment/index.ts`
- Modify: `supabase/functions/payment-webhook/index.ts`
- Modify: `supabase/functions/asaas-webhook/index.ts`

**Interfaces:**
- Produces: Edge functions setam `reembolsado` em vez de `cancelado` quando há estorno

- [ ] **Step 1: `cancel-order/index.ts` — linha 242**

```typescript
// Alterar:
status: "cancelado",
// Para:
status: refunded ? "reembolsado" : "cancelado",
```

- [ ] **Step 2: `refund-payment/index.ts` — linha 239**

```typescript
// Alterar:
orderUpdate.status = 'cancelado';
// Para:
orderUpdate.status = 'reembolsado';
```

- [ ] **Step 3: `payment-webhook/index.ts` — linha 231**

```typescript
// Alterar:
.update({ status: 'cancelado' })
// Para:
.update({ status: 'reembolsado' })
```

- [ ] **Step 4: `asaas-webhook/index.ts` — linha 324**

```typescript
// Alterar:
orderUpdate.status = 'cancelado';
// Para:
orderUpdate.status = 'reembolsado';
```

- [ ] **Step 5: Verificar e commit**

```bash
git add supabase/functions/cancel-order/index.ts supabase/functions/refund-payment/index.ts supabase/functions/payment-webhook/index.ts supabase/functions/asaas-webhook/index.ts
git commit -m "feat: use reembolsado status instead of cancelado in refund edge functions"
```

---

### Task 8: Verificação final e deploy

- [ ] **Step 1: Rodar typecheck completo**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 2: Rodar testes existentes**

```bash
npx vitest run
```

Expected: testes passando.

- [ ] **Step 3: Rodar linter**

```bash
npx eslint src/ --ext .ts,.tsx
```

Expected: sem erros novos.

- [ ] **Step 4: Push e deploy das edge functions**

```bash
supabase functions deploy get-order-refund
```

Nota: as outras edge functions (`cancel-order`, `refund-payment`, `payment-webhook`, `asaas-webhook`) precisam de re-deploy se foram modificadas.

- [ ] **Step 5: Rodar migration no Supabase**

```bash
supabase db push
```

- [ ] **Step 6: Commit final**

```bash
git add -A
git commit -m "chore: final verification and deployment prep"
```
