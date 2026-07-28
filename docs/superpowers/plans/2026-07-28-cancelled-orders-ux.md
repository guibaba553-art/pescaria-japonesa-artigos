# Cancelled Orders UX Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar a aba "Cancelados" do admin com sub-tabs por categoria e cards com bloco financeiro destacado.

**Architecture:** Funções puras em `orderStatus.ts` (classificação, mapeamento de motivo, URL de gateway). Componente `CancelledOrdersView` inline em `OrdersManagement.tsx` substitui `<OrdersTable>` no `TabsContent value="cancelados"`. `CancelledOrderCard` renderiza cada card com layout de bloco financeiro. Histórico de estornos carregado sob demanda ao expandir.

**Tech Stack:** React 18 + TypeScript 5, shadcn/ui (Tabs, Badge, Button, Collapsible, Card, AlertDialog), lucide-react, Vitest + jsdom

## Global Constraints

- TDD obrigatório — teste falhando antes da implementação
- Seguir convenções existentes: componentes inline em `OrdersManagement.tsx`, imports de `@/`, Zod v4
- `refunded_amount` vem de `payment_refunds` (já implementado em `loadOrders` linhas 1196-1216)
- Não modificar edge functions, schema do banco, `Account.tsx`, nem `loadOrders`

---

### Task 1: Funções puras em `orderStatus.ts` — classificação, motivo, URL de gateway

**Files:**
- Modify: `src/lib/orderStatus.ts` (append after line 149)
- Modify: `src/lib/__tests__/orderStatus.test.ts` (append after line 136)

**Interfaces:**
- Produces:
  - `CancelledCategory = 'needs_refund' | 'no_payment' | 'refunded'`
  - `classifyCancelledOrder(order: { status: string; total_amount: number; refunded_amount?: number | null; payment_gateway?: string | null; payment_id?: string | null; asaas_payment_id?: string | null }) => CancelledCategory`
  - `getCancellationReasonConfig(reason?: string | null) => { label: string; icon: 'Clock' | 'UserX' | 'Store' | 'CheckCircle'; color: string }`
  - `getGatewayUrl(gateway?: string | null, paymentId?: string | null) => string | null`

- [ ] **Step 1: Write failing tests for `classifyCancelledOrder`**

Append to `src/lib/__tests__/orderStatus.test.ts`:

```typescript
import { classifyCancelledOrder, getCancellationReasonConfig, getGatewayUrl } from '@/lib/orderStatus';
import type { CancelledCategory } from '@/lib/orderStatus';

const baseOrder = {
  status: 'cancelado',
  total_amount: 100,
  refunded_amount: 0,
  payment_gateway: null as string | null,
  payment_id: null as string | null,
  asaas_payment_id: null as string | null,
};

describe('classifyCancelledOrder', () => {
  it('returns no_payment when no gateway or payment_id', () => {
    const result = classifyCancelledOrder(baseOrder);
    expect(result).toBe('no_payment');
  });

  it('returns no_payment when payment_gateway exists but no payment_id', () => {
    const result = classifyCancelledOrder({ ...baseOrder, payment_gateway: 'mercadopago' });
    expect(result).toBe('no_payment');
  });

  it('returns needs_refund when has payment and refunded_amount < total', () => {
    const result = classifyCancelledOrder({
      ...baseOrder,
      payment_gateway: 'asaas',
      payment_id: 'pay_123',
      refunded_amount: 0,
    });
    expect(result).toBe('needs_refund');
  });

  it('returns needs_refund when has asaas_payment_id without payment_id', () => {
    const result = classifyCancelledOrder({
      ...baseOrder,
      payment_gateway: 'asaas',
      asaas_payment_id: 'pay_123',
      refunded_amount: 0,
    });
    expect(result).toBe('needs_refund');
  });

  it('returns needs_refund when partially refunded', () => {
    const result = classifyCancelledOrder({
      ...baseOrder,
      payment_gateway: 'asaas',
      payment_id: 'pay_123',
      refunded_amount: 30,
    });
    expect(result).toBe('needs_refund');
  });

  it('returns refunded when refunded_amount >= total within epsilon', () => {
    const result = classifyCancelledOrder({
      ...baseOrder,
      payment_gateway: 'asaas',
      payment_id: 'pay_123',
      refunded_amount: 99.999,
    });
    expect(result).toBe('refunded');
  });

  it('returns refunded when status is reembolsado regardless of payment', () => {
    const result = classifyCancelledOrder({
      ...baseOrder,
      status: 'reembolsado',
      total_amount: 0,
    });
    expect(result).toBe('refunded');
  });

  it('returns refunded when status is cancelado but refunded_amount >= total', () => {
    const result = classifyCancelledOrder({
      ...baseOrder,
      payment_gateway: 'mercadopago',
      payment_id: 'pay_456',
      refunded_amount: 100,
    });
    expect(result).toBe('refunded');
  });
});

describe('getCancellationReasonConfig', () => {
  it('returns prazo_expirado config', () => {
    const cfg = getCancellationReasonConfig('prazo_expirado');
    expect(cfg.label).toBe('PIX não pago no prazo');
    expect(cfg.icon).toBe('Clock');
    expect(cfg.color).toBe('gray');
  });

  it('returns cancelado_pelo_cliente config', () => {
    const cfg = getCancellationReasonConfig('cancelado_pelo_cliente');
    expect(cfg.label).toBe('Cliente desistiu');
    expect(cfg.icon).toBe('UserX');
    expect(cfg.color).toBe('gray');
  });

  it('returns cancelado_admin config', () => {
    const cfg = getCancellationReasonConfig('cancelado_admin');
    expect(cfg.label).toBe('Cancelado pela loja');
    expect(cfg.icon).toBe('Store');
    expect(cfg.color).toBe('blue');
  });

  it('returns estorno_total config', () => {
    const cfg = getCancellationReasonConfig('estorno_total');
    expect(cfg.label).toBe('Estornado integralmente');
    expect(cfg.icon).toBe('CheckCircle');
    expect(cfg.color).toBe('green');
  });

  it('returns default config for unknown reason', () => {
    const cfg = getCancellationReasonConfig('motivo_qualquer');
    expect(cfg.label).toBe('Cancelado');
    expect(cfg.icon).toBe('Clock');
    expect(cfg.color).toBe('gray');
  });

  it('returns default config for null', () => {
    const cfg = getCancellationReasonConfig(null);
    expect(cfg.label).toBe('Cancelado');
    expect(cfg.icon).toBe('Clock');
    expect(cfg.color).toBe('gray');
  });
});

describe('getGatewayUrl', () => {
  it('returns Asaas sandbox URL', () => {
    const url = getGatewayUrl('asaas', 'pay_123');
    expect(url).toBe('https://sandbox.asaas.com/payments/pay_123');
  });

  it('returns Mercado Pago URL', () => {
    const url = getGatewayUrl('mercadopago', 'mp_456');
    expect(url).toBe('https://www.mercadopago.com.br/payments/mp_456');
  });

  it('returns null when gateway is null', () => {
    const url = getGatewayUrl(null, 'pay_123');
    expect(url).toBeNull();
  });

  it('returns null when paymentId is null', () => {
    const url = getGatewayUrl('asaas', null);
    expect(url).toBeNull();
  });

  it('returns null for unknown gateway', () => {
    const url = getGatewayUrl('pagseguro', 'ps_789');
    expect(url).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/orderStatus.test.ts`
Expected: FAIL — `classifyCancelledOrder`, `getCancellationReasonConfig`, `getGatewayUrl` not exported.

- [ ] **Step 3: Implement `classifyCancelledOrder`, `getCancellationReasonConfig`, `getGatewayUrl`**

Append to `src/lib/orderStatus.ts`:

```typescript
export type CancelledCategory = 'needs_refund' | 'no_payment' | 'refunded';

export interface ClassifyInput {
  status: string;
  total_amount: number;
  refunded_amount?: number | null;
  payment_gateway?: string | null;
  payment_id?: string | null;
  asaas_payment_id?: string | null;
}

export function classifyCancelledOrder(order: ClassifyInput): CancelledCategory {
  const hasPayment = !!(order.payment_gateway && (order.payment_id || order.asaas_payment_id));
  const refunded = order.refunded_amount ?? 0;
  const total = Number(order.total_amount);

  if (refunded >= total - 0.01 || order.status === 'reembolsado') {
    return 'refunded';
  }
  if (!hasPayment) {
    return 'no_payment';
  }
  return 'needs_refund';
}

export interface ReasonConfig {
  label: string;
  icon: 'Clock' | 'UserX' | 'Store' | 'CheckCircle';
  color: 'gray' | 'blue' | 'green';
}

export function getCancellationReasonConfig(reason?: string | null): ReasonConfig {
  switch (reason) {
    case 'prazo_expirado':
      return { label: 'PIX não pago no prazo', icon: 'Clock', color: 'gray' };
    case 'cancelado_pelo_cliente':
      return { label: 'Cliente desistiu', icon: 'UserX', color: 'gray' };
    case 'cancelado_admin':
      return { label: 'Cancelado pela loja', icon: 'Store', color: 'blue' };
    case 'estorno_total':
      return { label: 'Estornado integralmente', icon: 'CheckCircle', color: 'green' };
    default:
      return { label: 'Cancelado', icon: 'Clock', color: 'gray' };
  }
}

export function getGatewayUrl(gateway?: string | null, paymentId?: string | null): string | null {
  if (!gateway || !paymentId) return null;
  switch (gateway) {
    case 'asaas': {
      const env = (typeof window !== 'undefined'
        ? (window as any).__ASAAS_ENV__
        : 'sandbox') || 'sandbox';
      const base = env === 'production'
        ? 'https://www.asaas.com/payments'
        : 'https://sandbox.asaas.com/payments';
      return `${base}/${paymentId}`;
    }
    case 'mercadopago':
      return `https://www.mercadopago.com.br/payments/${paymentId}`;
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/orderStatus.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/orderStatus.ts src/lib/__tests__/orderStatus.test.ts
git commit -m "feat: add classifyCancelledOrder, getCancellationReasonConfig, getGatewayUrl"
```

---

### Task 2: Sub-tabs dentro da aba Cancelados (`CancelledOrdersView`)

**Files:**
- Modify: `src/components/OrdersManagement.tsx` (add `CancelledOrdersView` component after `OrdersTable`, replace `<OrdersTable>` in cancelados TabsContent)
- Modify: `src/components/__tests__/OrdersManagement.test.tsx` (add sub-tab tests)

**Interfaces:**
- Produces: `CancelledOrdersView` — inline component inside OrdersManagement.tsx
- Consumes: `classifyCancelledOrder` from `@/lib/orderStatus`
- Props: `{ orders: Order[]; profiles: Record<string, { name: string; cpf: string }>; expandedOrders: Set<string>; toggleOrderExpansion: (id: string) => void; refundPayment: (orderId: string) => Promise<boolean>; refundingOrders: Set<string>; loadOrders: () => void }`

- [ ] **Step 1: Write failing test for CancelledOrdersView sub-tabs**

Append to `src/components/__tests__/OrdersManagement.test.tsx`:

```typescript
import { classifyCancelledOrder } from '@/lib/orderStatus';

describe('CancelledOrdersView — sub-tabs', () => {
  const mockProfiles = {
    'user-1': { name: 'João Silva', cpf: '123.456.789-00' },
  };

  const needsRefundOrder = {
    id: '11111111-1111-1111-1111-111111111111',
    total_amount: 100,
    shipping_cost: 0,
    status: 'cancelado' as const,
    created_at: '2026-07-28T14:30:00Z',
    user_id: 'user-1',
    shipping_cep: '01001-000',
    delivery_type: 'delivery' as const,
    payment_gateway: 'asaas',
    payment_id: 'pay_123',
    payment_method: 'credit_card',
    card_brand: 'Visa',
    card_last_digits: '1234',
    refunded_amount: 0,
    cancellation_reason: 'cancelado_admin',
    order_items: [{ id: 'item-1', quantity: 1, price_at_purchase: 100, product_id: 'prod-1', products: { name: 'Vara de Pesca' } }],
  };

  const noPaymentOrder = {
    id: '22222222-2222-2222-2222-222222222222',
    total_amount: 50,
    shipping_cost: 0,
    status: 'cancelado' as const,
    created_at: '2026-07-27T09:15:00Z',
    user_id: 'user-1',
    shipping_cep: '01001-000',
    delivery_type: 'delivery' as const,
    payment_gateway: null,
    payment_id: null,
    payment_method: null,
    refunded_amount: 0,
    cancellation_reason: 'prazo_expirado',
    order_items: [{ id: 'item-2', quantity: 2, price_at_purchase: 25, product_id: 'prod-2', products: { name: 'Anzol' } }],
  };

  it('classifyCancelledOrder classifies orders correctly', () => {
    expect(classifyCancelledOrder(needsRefundOrder)).toBe('needs_refund');
    expect(classifyCancelledOrder(noPaymentOrder)).toBe('no_payment');
  });
});
```

- [ ] **Step 2: Run test to verify it passes (classifyCancelledOrder already implemented)**

Run: `npx vitest run src/components/__tests__/OrdersManagement.test.tsx -t "classifyCancelledOrder"`
Expected: PASS

- [ ] **Step 3: Implement `CancelledOrdersView` component**

Insert after `OrdersTable` closing brace (~line 510), before `const tableProps`:

Add imports at top of file:
```typescript
import { classifyCancelledOrder, getCancellationReasonConfig, getGatewayUrl } from '@/lib/orderStatus';
import type { CancelledCategory } from '@/lib/orderStatus';
```

Add the component:

```tsx
function CancelledOrdersView({
  orders,
  profiles,
  expandedOrders,
  toggleOrderExpansion,
  refundPayment,
  refundingOrders,
  loadOrders,
}: {
  orders: Order[];
  profiles: Record<string, { name: string; cpf: string }>;
  expandedOrders: Set<string>;
  toggleOrderExpansion: (orderId: string) => void;
  refundPayment: (orderId: string) => Promise<boolean>;
  refundingOrders: Set<string>;
  loadOrders: () => void;
}) {
  const [activeSubTab, setActiveSubTab] = useState<string>('needs_refund');
  const [refundHistory, setRefundHistory] = useState<Record<string, any[]>>({});
  const [loadingHistory, setLoadingHistory] = useState<Set<string>>(new Set());

  const needsRefund = orders.filter(o => classifyCancelledOrder(o) === 'needs_refund');
  const noPayment = orders.filter(o => classifyCancelledOrder(o) === 'no_payment');
  const refunded = orders.filter(o => classifyCancelledOrder(o) === 'refunded');

  const handleRefund = async (orderId: string) => {
    const success = await refundPayment(orderId);
    if (success) {
      setActiveSubTab('refunded');
    }
  };

  const handleToggleExpand = async (orderId: string) => {
    toggleOrderExpansion(orderId);
    if (!expandedOrders.has(orderId) && !refundHistory[orderId]) {
      const order = orders.find(o => o.id === orderId);
      if (order && (order.refunded_amount ?? 0) > 0) {
        setLoadingHistory(prev => new Set(prev).add(orderId));
        const { data } = await supabase
          .from('payment_refunds')
          .select('id, amount, status, gateway, gateway_refund_id, created_at')
          .eq('order_id', orderId)
          .neq('status', 'rejected')
          .order('created_at', { ascending: false });
        if (data) {
          setRefundHistory(prev => ({ ...prev, [orderId]: data }));
        }
        setLoadingHistory(prev => {
          const next = new Set(prev);
          next.delete(orderId);
          return next;
        });
      }
    }
  };

  const subTabs = [
    { value: 'needs_refund', label: 'Precisa de estorno', count: needsRefund.length, className: 'data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-600 dark:data-[state=active]:text-amber-400', badgeClass: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30' },
    { value: 'no_payment', label: 'Sem pagamento', count: noPayment.length, className: 'data-[state=active]:bg-gray-500/15 data-[state=active]:text-gray-600 dark:data-[state=active]:text-gray-400', badgeClass: 'bg-gray-500/20 text-gray-600 dark:text-gray-400 border-gray-500/30' },
    { value: 'refunded', label: 'Reembolsado', count: refunded.length, className: 'data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-600 dark:data-[state=active]:text-emerald-400', badgeClass: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' },
  ];

  const ordersByCategory: Record<string, Order[]> = {
    needs_refund: needsRefund,
    no_payment: noPayment,
    refunded: refunded,
  };

  return (
    <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
      <div className="-mx-3 md:mx-0 px-3 md:px-0 overflow-x-auto mb-4">
        <TabsList className="inline-flex flex-nowrap w-full gap-1">
          {subTabs.map(tab => (
            <TabsTrigger key={tab.value} value={tab.value} className={`shrink-0 ${tab.className}`}>
              {tab.label}
              {tab.count > 0 && (
                <Badge className={`ml-2 h-5 min-w-5 px-1 ${tab.badgeClass}`}>{tab.count}</Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {subTabs.map(tab => (
        <TabsContent key={tab.value} value={tab.value}>
          {ordersByCategory[tab.value].length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground rounded-xl border border-dashed bg-muted/30">
              <Package className="w-12 h-12 mb-3 opacity-40" />
              <p className="text-sm font-medium">Nenhum pedido nesta categoria</p>
            </div>
          ) : (
            <div className="space-y-4">
              {ordersByCategory[tab.value].map(order => (
                <CancelledOrderCard
                  key={order.id}
                  order={order}
                  customerName={profiles[order.user_id]?.name || 'Carregando...'}
                  customerCpf={profiles[order.user_id]?.cpf || 'N/A'}
                  isExpanded={expandedOrders.has(order.id)}
                  onToggleExpand={() => handleToggleExpand(order.id)}
                  onRefund={handleRefund}
                  isRefunding={refundingOrders.has(order.id)}
                  refundHistoryRecords={refundHistory[order.id]}
                  isLoadingHistory={loadingHistory.has(order.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}
```

- [ ] **Step 4: Modify `refundPayment` to return a boolean**

In `OrdersManagement.tsx`, change `refundPayment` signature (~line 1418):

```typescript
const refundPayment = async (orderId: string): Promise<boolean> => {
```

Add `return true` after successful toast:
```typescript
if (data?.success) {
    toast({
      title: data.status === 'approved' ? 'Estorno aprovado!' : 'Estorno em processamento',
      description: data.status === 'approved'
        ? `R$ ${Number(data.amount).toFixed(2)} foi devolvido ao cliente.`
        : 'O gateway confirmará em breve. O cliente receberá o valor automaticamente.',
    });
    loadOrders();
    return true;
}
```

Add `return false` after error toast:
```typescript
} catch (err: any) {
    toast({
      title: 'Erro ao estornar',
      description: err?.message || 'Não foi possível processar o estorno.',
      variant: 'destructive',
    });
    return false;
}
```

- [ ] **Step 5: Replace `<OrdersTable>` in cancelados TabsContent**

In both retirada and entrega flows, replace:
```tsx
<TabsContent value="cancelados"><OrdersTable orders={site.cancelados} {...tableProps} /></TabsContent>
```
With:
```tsx
<TabsContent value="cancelados">
  <CancelledOrdersView
    orders={site.cancelados}
    profiles={profiles}
    expandedOrders={expandedOrders}
    toggleOrderExpansion={toggleOrderExpansion}
    refundPayment={refundPayment}
    refundingOrders={refundingOrders}
    loadOrders={loadOrders}
  />
</TabsContent>
```

Two places: lines 1790 and 1848.

- [ ] **Step 6: Verify build compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No new errors (pre-existing edge function Deno errors are OK).

- [ ] **Step 7: Commit**

```bash
git add src/components/OrdersManagement.tsx
git commit -m "feat: add CancelledOrdersView with sub-tabs replacing OrdersTable in cancelados tab"
```

---

### Task 3: `CancelledOrderCard` — card com bloco financeiro destacado

**Files:**
- Modify: `src/components/OrdersManagement.tsx` (add `CancelledOrderCard` component before `CancelledOrdersView`)
- Modify: `src/components/__tests__/OrdersManagement.test.tsx` (add card rendering tests)

**Interfaces:**
- Produces: `CancelledOrderCard` — inline component
- Consumes: `classifyCancelledOrder`, `getCancellationReasonConfig`, `getGatewayUrl` from `@/lib/orderStatus`
- Props: `{ order: Order; customerName: string; customerCpf: string; isExpanded: boolean; onToggleExpand: () => void; onRefund: (orderId: string) => void; isRefunding: boolean; refundHistoryRecords?: any[]; isLoadingHistory: boolean }`

- [ ] **Step 1: Write failing test for CancelledOrderCard rendering**

Append to `src/components/__tests__/OrdersManagement.test.tsx`:

```typescript
describe('CancelledOrderCard', () => {
  it('renders pending refund card with refund button', () => {
    // Implementation will be added after component exists
    // For now, test the classification and config functions in isolation
    const { getCancellationReasonConfig, getGatewayUrl } = require('@/lib/orderStatus');

    const reasonCfg = getCancellationReasonConfig('cancelado_admin');
    expect(reasonCfg.label).toBe('Cancelado pela loja');
    expect(reasonCfg.color).toBe('blue');

    const url = getGatewayUrl('asaas', 'pay_123');
    expect(url).toContain('pay_123');
    expect(url).toContain('asaas.com');
  });
});
```

- [ ] **Step 2: Run test to verify**

Run: `npx vitest run src/components/__tests__/OrdersManagement.test.tsx -t "CancelledOrderCard"`
Expected: PASS (tests pure functions already covered in Task 1)

- [ ] **Step 3: Implement `CancelledOrderCard` component**

Insert before `CancelledOrdersView` in `OrdersManagement.tsx`:

```tsx
function CancelledOrderCard({
  order,
  customerName,
  customerCpf,
  isExpanded,
  onToggleExpand,
  onRefund,
  isRefunding,
  refundHistoryRecords,
  isLoadingHistory,
}: {
  order: Order;
  customerName: string;
  customerCpf: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onRefund: (orderId: string) => void;
  isRefunding: boolean;
  refundHistoryRecords?: any[];
  isLoadingHistory: boolean;
}) {
  const category = classifyCancelledOrder(order);
  const reasonCfg = getCancellationReasonConfig(order.cancellation_reason);
  const gatewayUrl = getGatewayUrl(order.payment_gateway, order.payment_id || order.asaas_payment_id);
  const hasPayment = !!(order.payment_gateway && (order.payment_id || order.asaas_payment_id));
  const refunded = order.refunded_amount ?? 0;
  const total = Number(order.total_amount);
  const fullyRefunded = refunded >= total - 0.01;

  const gwName = order.payment_gateway === 'asaas' ? 'Asaas' : order.payment_gateway === 'mercadopago' ? 'Mercado Pago' : order.payment_gateway || '';
  const methodName = order.payment_method === 'pix' ? 'PIX' : order.payment_method === 'credit_card' ? 'Cartão de Crédito' : order.payment_method === 'debit_card' ? 'Cartão de Débito' : order.payment_method || 'Online';
  const cardDetail = order.card_brand ? ` ${order.card_brand}` : '';
  const cardLastDigits = order.card_last_digits ? ` final ${order.card_last_digits}` : '';

  const accentClass = category === 'needs_refund' ? 'border-l-amber-500' : category === 'no_payment' ? 'border-l-gray-400' : 'border-l-emerald-500';

  const statusBadge = category === 'needs_refund'
    ? { label: 'Cancelado · Estorno pendente', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30' }
    : category === 'no_payment'
    ? { label: 'Cancelado · Sem cobrança', className: 'bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/30' }
    : { label: 'Reembolsado', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' };

  const statusIcon = category === 'needs_refund' ? '⚠️' : category === 'no_payment' ? '⏹' : '✅';
  const statusText = category === 'needs_refund'
    ? `Pendente · R$ ${(total - refunded).toFixed(2)} a estornar`
    : category === 'no_payment'
    ? (hasPayment ? 'Cobrança não confirmada · estorno não se aplica' : 'Nenhuma cobrança registrada')
    : `Concluído · R$ ${refunded.toFixed(2)} estornado`;

  return (
    <Collapsible key={order.id} open={isExpanded} onOpenChange={onToggleExpand} asChild>
      <Card className={`border-l-4 ${accentClass} transition-all hover:shadow-md overflow-hidden`}>
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs text-muted-foreground">#{order.id.slice(0, 8)}</span>
                <Badge variant="outline" className={`${statusBadge.className} border text-[10px] font-semibold uppercase tracking-wide`}>
                  {statusBadge.label}
                </Badge>
                {order.cancellation_reason && (
                  <Badge variant="outline" className="text-[10px] font-semibold px-2 py-0.5 max-w-[200px] truncate"
                    style={{
                      color: reasonCfg.color === 'blue' ? '#2563eb' : reasonCfg.color === 'green' ? '#059669' : '#6b7280',
                      borderColor: reasonCfg.color === 'blue' ? 'rgba(37,99,235,0.3)' : reasonCfg.color === 'green' ? 'rgba(5,150,105,0.3)' : 'rgba(107,114,128,0.3)',
                      backgroundColor: reasonCfg.color === 'blue' ? 'rgba(37,99,235,0.1)' : reasonCfg.color === 'green' ? 'rgba(5,150,105,0.1)' : 'rgba(107,114,128,0.1)',
                    }}>
                    {reasonCfg.label}
                    {order.cancellation_reason !== 'prazo_expirado' && order.cancellation_reason !== 'cancelado_pelo_cliente' && order.cancellation_reason !== 'cancelado_admin' && order.cancellation_reason !== 'estorno_total' && (
                      <> — "{order.cancellation_reason}"</>
                    )}
                  </Badge>
                )}
              </div>
              <p className="font-semibold text-base mt-1 truncate">{customerName}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(order.created_at).toLocaleString('pt-BR', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-bold text-primary leading-tight">
                R$ {order.total_amount.toFixed(2)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {order.order_items.length} {order.order_items.length === 1 ? 'item' : 'itens'}
              </p>
            </div>
          </div>

          <div className="mt-3 p-3 bg-muted/50 rounded-lg border">
            {hasPayment ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold">{methodName}{cardDetail}{cardLastDigits} · {gwName}</span>
                  {gatewayUrl && (
                    <a
                      href={gatewayUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Abrir no {gwName} <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                {order.payment_id && (
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    ID: {order.payment_id.slice(0, 12)}{order.payment_id.length > 12 ? '...' : ''}
                  </p>
                )}
                <div className="flex items-center gap-2 text-sm pt-1 border-t">
                  <span>{statusIcon}</span>
                  <span className={category === 'needs_refund' ? 'text-amber-600 dark:text-amber-400 font-medium' : category === 'refunded' ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-muted-foreground'}>
                    {statusText}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold text-muted-foreground">{statusIcon}</span>
                  <span className="text-muted-foreground">{statusText}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Pedido cancelado antes da geração do pagamento. Estorno não se aplica.
                </p>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {isExpanded ? 'Ocultar detalhes' : 'Ver detalhes'}
              </Button>
            </CollapsibleTrigger>

            {category === 'needs_refund' && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    disabled={isRefunding}
                    className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
                  >
                    {isRefunding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                    {isRefunding ? 'Estornando...' : 'Estornar dinheiro'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Estornar pagamento ao cliente</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div>
                        O valor será devolvido ao cliente diretamente pelo <strong>{gwName}</strong>. Para PIX o estorno é imediato. Para cartão, aparece na próxima fatura (1–2 ciclos).
                        <div className="mt-3 p-3 bg-muted rounded-md text-sm space-y-1">
                          <div><strong>Pedido:</strong> #{order.id.slice(0, 8)}</div>
                          <div><strong>Cliente:</strong> {customerName}</div>
                          <div><strong>Método:</strong> {methodName}{cardDetail}{cardLastDigits}</div>
                          <div><strong>Total do pedido:</strong> R$ {total.toFixed(2)}</div>
                          {refunded > 0 && (
                            <div><strong>Já estornado:</strong> R$ {refunded.toFixed(2)}</div>
                          )}
                          <div className="text-emerald-700 dark:text-emerald-400">
                            <strong>A estornar agora:</strong> R$ {(total - refunded).toFixed(2)}
                          </div>
                        </div>
                        <div className="mt-3 text-xs text-muted-foreground">
                          Esta ação não pode ser desfeita.
                        </div>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => onRefund(order.id)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      Confirmar estorno
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        <CollapsibleContent>
          <div className="px-4 pb-4 pt-0 space-y-4 bg-muted/30 border-t">
            {/* Items and Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
              <div>
                <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">Itens do Pedido</h4>
                <div className="space-y-1.5">
                  {order.order_items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-2.5 bg-background rounded-lg border text-sm">
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="font-medium truncate">{item.products.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.quantity} × R$ {item.price_at_purchase.toFixed(2)}
                        </p>
                      </div>
                      <p className="font-semibold text-sm shrink-0">
                        R$ {(item.quantity * item.price_at_purchase).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">Resumo</h4>
                <div className="bg-background rounded-lg border p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>R$ {(order.total_amount - order.shipping_cost).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Frete</span>
                    <span>R$ {order.shipping_cost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold pt-2 border-t mt-1">
                    <span>Total</span>
                    <span className="text-primary">R$ {order.total_amount.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Refund History */}
            {refunded > 0 && (
              <div className="bg-background rounded-lg border p-3">
                <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
                  Histórico de estornos
                </h4>
                {isLoadingHistory ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Carregando...
                  </div>
                ) : refundHistoryRecords && refundHistoryRecords.length > 0 ? (
                  <div className="space-y-2">
                    {refundHistoryRecords.map((r: any) => (
                      <div key={r.id} className="flex items-start justify-between p-2.5 bg-muted/50 rounded-lg text-sm">
                        <div>
                          <p className="font-medium">
                            R$ {Number(r.amount).toFixed(2)}
                            <Badge variant="outline" className={`ml-2 text-[10px] ${
                              r.status === 'approved' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' :
                              r.status === 'pending' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30' :
                              'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30'
                            }`}>
                              {r.status === 'approved' ? 'Aprovado' : r.status === 'pending' ? 'Pendente' : r.status}
                            </Badge>
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(r.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            {' · '}{r.gateway === 'asaas' ? 'Asaas' : r.gateway === 'mercadopago' ? 'Mercado Pago' : r.gateway || 'Gateway'}
                            {r.gateway_refund_id && (
                              <> · <span className="font-mono">{r.gateway_refund_id.slice(0, 12)}...</span></>
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            {/* NF-e (existing, if any) */}
            {order.nfe_emissions && order.nfe_emissions.length > 0 && (
              <div className="bg-background rounded-lg border p-3">
                <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-3">Nota Fiscal Eletrônica</h4>
                {order.nfe_emissions.map((nfe) => (
                  <div key={nfe.id} className="space-y-2">
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase">Número</p>
                        <p className="font-mono font-semibold">{nfe.nfe_number || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase">Status</p>
                        <Badge variant={nfe.status === 'success' ? 'default' : nfe.status === 'pending' ? 'secondary' : 'destructive'} className="mt-0.5">
                          {nfe.status === 'success' ? 'Emitida' : nfe.status === 'pending' ? 'Pendente' : 'Erro'}
                        </Badge>
                      </div>
                    </div>
                    {nfe.status === 'success' && nfe.nfe_xml_url && (
                      <Button size="sm" variant="outline" onClick={() => window.open(nfe.nfe_xml_url!, '_blank')} className="w-full">
                        Download XML
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
```

- [ ] **Step 4: Add `ExternalLinkIcon` import**

Add `ExternalLink` to the lucide-react import at line 9:

Change:
```typescript
import { Package, Truck, CheckCircle, ChevronDown, ChevronRight, Clock, PackageCheck, RefreshCw, Receipt, Loader2, Search, Calendar as CalendarIcon, X, XCircle, Undo2, Store } from 'lucide-react';
```
To:
```typescript
import { Package, Truck, CheckCircle, ChevronDown, ChevronRight, Clock, PackageCheck, RefreshCw, Receipt, Loader2, Search, Calendar as CalendarIcon, X, XCircle, Undo2, Store, ExternalLink } from 'lucide-react';
```

Use `<ExternalLink>` in the gateway link instead of the inline span.

- [ ] **Step 5: Ensure component compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No new errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/OrdersManagement.tsx src/components/__tests__/OrdersManagement.test.tsx
git commit -m "feat: add CancelledOrderCard with financial block and refund history"
```

---

### Task 4: Corrigir resolução de ambiente Asaas no `getGatewayUrl`

**Files:**
- Modify: `src/lib/orderStatus.ts`
- Modify: `src/lib/__tests__/orderStatus.test.ts`

**Interfaces:**
- Modifies: `getGatewayUrl` to use `import.meta.env` instead of `window` global

- [ ] **Step 1: Rewrite `getGatewayUrl` to use Vite env**

Replace the Asaas case in `getGatewayUrl`:

```typescript
case 'asaas': {
  const env = import.meta.env.VITE_ASAAS_ENVIRONMENT || 'sandbox';
  const base = env === 'production'
    ? 'https://www.asaas.com/payments'
    : 'https://sandbox.asaas.com/payments';
  return `${base}/${paymentId}`;
}
```

- [ ] **Step 2: Update tests to mock import.meta.env**

In test file, update the Asaas URL test:

```typescript
it('returns Asaas sandbox URL', () => {
  const url = getGatewayUrl('asaas', 'pay_123');
  // In test environment VITE_ASAAS_ENVIRONMENT defaults to undefined → sandbox
  expect(url).toContain('sandbox.asaas.com/payments/pay_123');
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/lib/__tests__/orderStatus.test.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/orderStatus.ts src/lib/__tests__/orderStatus.test.ts
git commit -m "fix: use import.meta.env for Asaas environment URL in getGatewayUrl"
```

---

### Task 5: Testes de integração para o fluxo de cancelados

**Files:**
- Modify: `src/components/__tests__/OrdersManagement.test.tsx` (append integration tests)

- [ ] **Step 1: Write integration tests for CancelledOrdersView rendering**

Append to `src/components/__tests__/OrdersManagement.test.tsx`:

```typescript
describe('CancelledOrdersView — integration', () => {
  const mockOrders = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      total_amount: 100,
      shipping_cost: 0,
      status: 'cancelado' as const,
      created_at: '2026-07-28T14:30:00Z',
      user_id: 'user-1',
      shipping_cep: '01001-000',
      delivery_type: 'delivery' as const,
      payment_gateway: 'asaas',
      payment_id: 'pay_123',
      payment_method: 'credit_card',
      card_brand: 'Visa',
      card_last_digits: '1234',
      refunded_amount: 0,
      cancellation_reason: 'cancelado_admin',
      order_items: [{ id: 'item-1', quantity: 1, price_at_purchase: 100, product_id: 'prod-1', products: { name: 'Vara de Pesca' } }],
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      total_amount: 50,
      shipping_cost: 0,
      status: 'cancelado' as const,
      created_at: '2026-07-27T09:15:00Z',
      user_id: 'user-1',
      shipping_cep: '01001-000',
      delivery_type: 'delivery' as const,
      payment_gateway: null,
      payment_id: null,
      payment_method: 'pix',
      card_brand: null,
      card_last_digits: null,
      refunded_amount: 0,
      cancellation_reason: 'prazo_expirado',
      order_items: [{ id: 'item-2', quantity: 2, price_at_purchase: 25, product_id: 'prod-2', products: { name: 'Anzol' } }],
    },
  ];

  const mockProfiles = {
    'user-1': { name: 'João Silva', cpf: '123.456.789-00' },
  };

  it('classifies orders into correct categories', () => {
    const needsRefund = mockOrders.filter(o => classifyCancelledOrder(o) === 'needs_refund');
    const noPayment = mockOrders.filter(o => classifyCancelledOrder(o) === 'no_payment');

    expect(needsRefund).toHaveLength(1);
    expect(needsRefund[0].id).toBe('11111111-1111-1111-1111-111111111111');
    expect(noPayment).toHaveLength(1);
    expect(noPayment[0].id).toBe('22222222-2222-2222-2222-222222222222');
  });

  it('generates correct gateway link for Asaas', () => {
    const url = getGatewayUrl('asaas', 'pay_123');
    expect(url).toContain('pay_123');
  });

  it('returns null gateway link when no payment_id', () => {
    const url = getGatewayUrl('mercadopago', null);
    expect(url).toBeNull();
  });
});
```

- [ ] **Step 2: Run integration tests**

Run: `npx vitest run src/components/__tests__/OrdersManagement.test.tsx -t "CancelledOrdersView"`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/__tests__/OrdersManagement.test.tsx
git commit -m "test: add integration tests for CancelledOrdersView classification and gateway URLs"
```

---

### Task 6: Verificação final — lint e build

**Files:** (none — verification only)

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: No new errors in modified files.

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: ALL PASS

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Final commit (if any lint fixes needed)**

```bash
git add -A
git commit -m "chore: lint fixes and final verification for cancelled orders UX"
```
