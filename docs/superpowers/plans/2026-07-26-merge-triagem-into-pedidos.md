# Merge Triagem into Admin Pedidos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the triage (SKU scanning) workflow from `/admin/triagem` into the "Em Preparação" tab of `/admin/pedidos`, making order cards clickable to open the TriagemScanDialog.

**Architecture:** A new `TriagemSection` wrapper component encapsulates QR scanner + clickable cards + TriagemScanDialog. OrdersManagement renders it for the "Em Preparação" tab. `getNextStatus` is changed so both pickup and delivery require triage. A new "Aguardando Envio" tab is added. The original triage page is removed.

**Tech Stack:** React, TypeScript, Supabase, Tailwind CSS, shadcn/ui, lucide-react

## Global Constraints

- Do NOT reuse the TriagemOrder type from TriagemScanDialog in TriagemSection for the list — use Order[] from OrdersManagement as input. Fetch full TriagemOrder details on-demand when opening the dialog.
- TriagemScanDialog pickup "Confirmar retirada" button must update status to `pronto_retirada` (not `retirado`)
- `getNextStatus` for `em_preparo` + pickup must return `null` (triage mandatory for both types)
- `site.emPreparacao` filter must only include `em_preparo` (remove `aguardando_envio`)
- The new "Aguardando Envio" tab goes between "Em Preparação" and "Pronto para Retirada"
- Tabs grid must change from `md:grid-cols-7` to `md:grid-cols-8`
- QR global keyboard listener must clean up on unmount

---

### Task 1: Make `getNextStatus` return `null` for pickup `em_preparo`

**Files:**
- Modify: `src/lib/orderStatus.ts:115-120`

**Interfaces:**
- Consumes: nothing (pure logic change)
- Produces: `getNextStatus('em_preparo', 'pickup')` now returns `null`

- [ ] **Step 1: Edit orderStatus.ts**

In `src/lib/orderStatus.ts`, change the `em_preparo` block so pickup also returns `null`:

```typescript
// Before (lines 115-120):
  if (currentStatus === 'em_preparo') {
    // Delivery: embalagem é feita exclusivamente pela Triagem (com leitura de SKU).
    // Pickup: precisa marcar como pronto para retirada primeiro.
    if (deliveryType === 'pickup') return 'pronto_retirada';
    return null;
  }

// After:
  if (currentStatus === 'em_preparo') {
    // Tanto delivery quanto pickup agora exigem triagem obrigatória (scan de SKU).
    return null;
  }
```

- [ ] **Step 2: Verify the change compiles**

Run: `npx tsc --noEmit --project tsconfig.app.json 2>&1 | head -20`
Expected: No errors from `orderStatus.ts`

- [ ] **Step 3: Commit**

```bash
git add src/lib/orderStatus.ts
git commit -m "feat: require triage for pickup em_preparo — getNextStatus now returns null"
```

---

### Task 2: Update orderStatus tests

**Files:**
- Modify: `src/lib/__tests__/orderStatus.test.ts:49-51`

**Interfaces:**
- Consumes: Updated `getNextStatus` from Task 1
- Produces: Tests pass

- [ ] **Step 1: Update test expectations**

In `src/lib/__tests__/orderStatus.test.ts`, change the expectation for `em_preparo` + pickup:

```typescript
// Before (lines 49-51):
  it('returns pronto_retirada from em_preparo for pickup', () => {
    expect(getNextStatus('em_preparo', 'pickup')).toBe('pronto_retirada');
  });

// After:
  it('returns null from em_preparo for pickup (requires triage)', () => {
    expect(getNextStatus('em_preparo', 'pickup')).toBeNull();
  });
```

- [ ] **Step 2: Run the test suite**

Run: `npx vitest run src/lib/__tests__/orderStatus.test.ts`
Expected: All 19 tests pass, including the updated assertion

- [ ] **Step 3: Commit**

```bash
git add src/lib/__tests__/orderStatus.test.ts
git commit -m "test: update getNextStatus test — pickup em_preparo now returns null"
```

---

### Task 3: Update TriagemScanDialog pickup confirm to `pronto_retirada`

**Files:**
- Modify: `src/components/TriagemScanDialog.tsx:209`

**Interfaces:**
- Consumes: nothing
- Produces: In `handleConfirm`, pickup mode sets status to `'pronto_retirada'`

- [ ] **Step 1: Edit the status assignment**

In `src/components/TriagemScanDialog.tsx`, change line 209 in `handleConfirm`:

```typescript
// Before (line 209):
const newStatus = mode === 'pickup' ? 'retirado' : 'aguardando_envio';

// After:
const newStatus = mode === 'pickup' ? 'pronto_retirada' : 'aguardando_envio';
```

Also update the toast message in lines 222-227 to reflect the new status:

```typescript
// Before (lines 222-227):
      toast({
        title: mode === 'pickup' ? '✅ Retirada confirmada' : '✅ Pedido embalado',
        description:
          mode === 'pickup'
            ? `Pedido #${order.id.slice(0, 8)} marcado como retirado.`
            : `Pedido #${order.id.slice(0, 8)} aguardando coleta da transportadora.`,
      });

// After:
      toast({
        title: mode === 'pickup' ? '✅ Triagem concluída' : '✅ Pedido embalado',
        description:
          mode === 'pickup'
            ? `Pedido #${order.id.slice(0, 8)} marcado como pronto para retirada.`
            : `Pedido #${order.id.slice(0, 8)} aguardando coleta da transportadora.`,
      });
```

Also update the button label — find the "Confirmar retirada" button text and change it. Search in the JSX near the end of TriagemScanDialog for the primary action button:

```typescript
// Before (search for "Confirmar retirada" in the JSX):
{mode === 'pickup' ? 'Confirmar retirada' : 'Marcar como aguardando envio'}

// After:
{mode === 'pickup' ? 'Marcar como Pronto para Retirada' : 'Marcar como aguardando envio'}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.app.json 2>&1 | grep -i triagem | head -10`
Expected: No errors from TriagemScanDialog

- [ ] **Step 3: Commit**

```bash
git add src/components/TriagemScanDialog.tsx
git commit -m "feat: pickup triage now sets status to pronto_retirada instead of retirado"
```

---

### Task 4: Create `TriagemSection` component

**Files:**
- Create: `src/components/admin/TriagemSection.tsx`

**Interfaces:**
- Consumes: `Order[]` from OrdersManagement (type defined in `src/components/OrdersManagement.tsx:161`), `useAuth`, `supabase`, `useToast`, `TriagemScanDialog` with `TriagemOrder` type
- Produces: `<TriagemSection orders={orders} onStatusChanged={reloadFn} isAdmin={isAdmin} />`

- [ ] **Step 1: Create the file**

Create `src/components/admin/TriagemSection.tsx` with the following content:

```typescript
import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TriagemScanDialog, TriagemOrder } from '@/components/TriagemScanDialog';
import {
  Package,
  Truck,
  Store,
  User,
  ChevronRight,
  Loader2,
} from 'lucide-react';

interface Order {
  id: string;
  total_amount: number;
  shipping_cost: number;
  status: string;
  created_at: string;
  user_id: string;
  delivery_type: 'delivery' | 'pickup';
  order_items: Array<{ id: string; quantity: number; products: { name: string } }>;
}

interface TriagemSectionProps {
  orders: Order[];
  onStatusChanged: () => void;
}

export function TriagemSection({ orders, onStatusChanged }: TriagemSectionProps) {
  const { toast } = useToast();
  const [filter, setFilter] = useState<'all' | 'delivery' | 'pickup'>('all');
  const [selectedOrder, setSelectedOrder] = useState<TriagemOrder | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'pickup' | 'pack'>('pickup');
  const [loadingOrderId, setLoadingOrderId] = useState<string | null>(null);
  const lastHandledQrRef = useRef<string | null>(null);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (filter === 'delivery') return o.delivery_type === 'delivery';
      if (filter === 'pickup') return o.delivery_type === 'pickup';
      return true;
    });
  }, [orders, filter]);

  // --- Fetch full TriagemOrder detail when opening dialog ---

  const fetchOrderDetail = useCallback(async (orderId: string): Promise<TriagemOrder | null> => {
    setLoadingOrderId(orderId);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(
          `id, total_amount, shipping_cost, shipping_address, shipping_cep, status, delivery_type, source, created_at, user_id, tracking_code, shipping_label_url, shipping_label_order_id,
           order_items(id, quantity, price_at_purchase, product_id, variation_id, products(name, image_url, sku, weight_grams, length_cm, width_cm, height_cm), product_variations(name, sku, weight_grams, length_cm, width_cm, height_cm)),
           nfe_emissions(id, nfe_number, danfe_url, status)`,
        )
        .eq('id', orderId)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        toast({
          title: 'Pedido não encontrado',
          description: `Nenhum pedido com ID ${orderId.slice(0, 8)}.`,
          variant: 'destructive',
        });
        return null;
      }

      if (data.status !== 'em_preparo') {
        toast({
          title: 'Pedido não está em preparo',
          description: `Status atual: ${data.status}. Triagem só abre pedidos em preparo.`,
          variant: 'destructive',
        });
        return null;
      }

      let profile: any = null;
      if ((data as any).user_id) {
        const { data: p } = await supabase
          .from('profiles')
          .select('id, full_name, phone, cpf')
          .eq('id', (data as any).user_id)
          .maybeSingle();
        profile = p || null;
      }

      const nfes = ((data as any).nfe_emissions || []) as any[];
      const authorized = nfes.find(
        (n: any) => n.status === 'autorizada' || n.status === 'authorized',
      );
      const nfe = authorized || nfes[0] || null;

      return {
        ...(data as any),
        profile,
        nfe: nfe
          ? { id: nfe.id, nfe_number: nfe.nfe_number, danfe_url: nfe.danfe_url, status: nfe.status }
          : null,
      };
    } catch (err: any) {
      console.error('[TriagemSection] fetch error:', err);
      toast({
        title: 'Erro ao buscar pedido',
        description: err.message,
        variant: 'destructive',
      });
      return null;
    } finally {
      setLoadingOrderId(null);
    }
  }, [toast]);

  // --- Open dialog for an order ---

  const openScanFor = useCallback(async (orderId: string, deliveryType: string) => {
    const detail = await fetchOrderDetail(orderId);
    if (!detail) return;
    setDialogMode(deliveryType === 'pickup' ? 'pickup' : 'pack');
    setSelectedOrder(detail);
    setScanOpen(true);
  }, [fetchOrderDetail]);

  // --- Card click handler ---

  const handleCardClick = useCallback((order: Order) => {
    openScanFor(order.id, order.delivery_type);
  }, [openScanFor]);

  // --- QR / Barcode detection ---

  const extractOrderId = (raw: string): string | null => {
    const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const m = raw.match(uuidRe);
    return m ? m[0].toLowerCase() : null;
  };

  const openOrderById = useCallback(async (orderId: string) => {
    // Check if the order is in our current filteredOrders list
    const found = filteredOrders.find((o) => o.id.toLowerCase() === orderId);
    if (found) {
      openScanFor(found.id, found.delivery_type);
      return;
    }
    // Not in list — fetch from DB directly
    const detail = await fetchOrderDetail(orderId);
    if (!detail) return;
    setDialogMode(detail.delivery_type === 'pickup' ? 'pickup' : 'pack');
    setSelectedOrder(detail);
    setScanOpen(true);
  }, [filteredOrders, openScanFor, fetchOrderDetail]);

  // Global keyboard listener for barcode scanners
  useEffect(() => {
    let buffer = '';
    let lastTime = 0;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (target as any)?.isContentEditable;
      if (isEditable) return;
      if (scanOpen) return;

      const now = Date.now();
      if (now - lastTime > 80) buffer = '';
      lastTime = now;

      if (e.key === 'Enter') {
        const orderId = extractOrderId(buffer);
        buffer = '';
        if (orderId && lastHandledQrRef.current !== orderId) {
          lastHandledQrRef.current = orderId;
          openOrderById(orderId);
        }
        return;
      }

      if (e.key.length === 1) {
        buffer += e.key;
        const orderId = extractOrderId(buffer);
        if (orderId && lastHandledQrRef.current !== orderId) {
          lastHandledQrRef.current = orderId;
          buffer = '';
          openOrderById(orderId);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [scanOpen, openOrderById]);

  const handleDialogComplete = useCallback(() => {
    onStatusChanged();
    lastHandledQrRef.current = null;
  }, [onStatusChanged]);

  // --- Render ---

  const activeBtnClass = (f: string) => {
    if (f === 'all') return 'bg-primary text-primary-foreground hover:bg-primary/90';
    if (f === 'delivery') return 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600';
    return 'bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600';
  };

  const inactiveBtnClass = (f: string) => {
    if (f === 'all') return '';
    if (f === 'delivery') return 'border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 hover:text-blue-800 dark:hover:text-blue-200';
    return 'border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 hover:text-emerald-800 dark:hover:text-emerald-200';
  };

  return (
    <div>
      {/* Sub-filter: Todos / Entrega / Retirada */}
      <div className="flex items-center gap-3 mb-5">
        <span className="text-sm text-muted-foreground font-medium">Filtrar:</span>
        <div className="flex gap-2">
          {(['all', 'delivery', 'pickup'] as const).map((f) => {
            const isActive = filter === f;
            return (
              <Button
                key={f}
                size="default"
                variant={isActive ? 'default' : 'outline'}
                onClick={() => setFilter(f)}
                className={`gap-1.5 text-sm px-4 ${isActive ? activeBtnClass(f) : inactiveBtnClass(f)}`}
              >
                {f === 'delivery' && <Truck className={`w-4 h-4 ${isActive ? '' : 'text-blue-600 dark:text-blue-400'}`} />}
                {f === 'pickup' && <Store className={`w-4 h-4 ${isActive ? '' : 'text-emerald-600 dark:text-emerald-400'}`} />}
                {f === 'all' ? 'Todos' : f === 'delivery' ? 'Entrega' : 'Retirada'}
              </Button>
            );
          })}
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhum pedido em preparo aguardando triagem.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredOrders.map((o) => {
            const totalUnits = o.order_items.reduce((s, it) => s + (it.quantity || 0), 0);
            const isLoading = loadingOrderId === o.id;
            return (
              <button
                key={o.id}
                onClick={() => handleCardClick(o)}
                disabled={isLoading}
                className={`group text-left bg-card border-2 rounded-2xl p-4 hover:shadow-md transition-all cursor-pointer
                  ${o.delivery_type === 'pickup'
                    ? 'border-l-4 border-l-emerald-500 hover:border-emerald-500/40'
                    : 'border-l-4 border-l-blue-500 hover:border-blue-500/40'}
                  ${isLoading ? 'opacity-60 pointer-events-none' : ''}
                `}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold">#{o.id.slice(0, 8)}</span>
                      {o.delivery_type === 'pickup' ? (
                        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                          <Store className="w-3 h-3 mr-1" /> Retirada
                        </Badge>
                      ) : (
                        <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30">
                          <Truck className="w-3 h-3 mr-1" /> Envio
                        </Badge>
                      )}
                    </div>
                    {isLoading ? (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Carregando detalhes...</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-sm text-foreground/80 mt-1.5">
                        <User className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="truncate">{'Clique para triagem'}</span>
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {o.order_items.length} item(ns) · {totalUnits} unidade(s)
                  </span>
                  <span className="font-bold text-foreground">
                    {o.total_amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {new Date(o.created_at).toLocaleString('pt-BR')}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <TriagemScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        order={selectedOrder}
        mode={dialogMode}
        onCompleted={handleDialogComplete}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.app.json 2>&1 | grep TriagemSection | head -10`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/TriagemSection.tsx
git commit -m "feat: create TriagemSection component with QR scanner and clickable cards"
```

---

### Task 5: Update OrdersManagement — embed TriagemSection, add "Aguardando Envio" tab

**Files:**
- Modify: `src/components/OrdersManagement.tsx`

**Interfaces:**
- Consumes: `TriagemSection` from Task 4, `useAuth`
- Produces: Updated tabs with TriagemSection for "Em Preparação" and new "Aguardando Envio" tab

- [ ] **Step 1: Add import for TriagemSection**

Add the import at the top of `src/components/OrdersManagement.tsx` (after existing imports, around line 30):

```typescript
import { TriagemSection } from '@/components/admin/TriagemSection';
```

- [ ] **Step 2: Change `site.emPreparacao` filter to exclude `aguardando_envio`**

Find line 1558:
```typescript
emPreparacao: siteOrders.filter(o => o.status === 'em_preparo' || o.status === 'aguardando_envio'),
```

Replace with:
```typescript
emPreparacao: siteOrders.filter(o => o.status === 'em_preparo'),
```

- [ ] **Step 3: Add `aguardandoEnvio` to the `site` object**

After line 1558 (now the updated `emPreparacao` line), add:

```typescript
aguardandoEnvio: siteOrders.filter(o => o.status === 'aguardando_envio'),
```

- [ ] **Step 4: Change tabs grid from `md:grid-cols-7` to `md:grid-cols-8`**

Find line 1594:
```typescript
<TabsList className="inline-flex md:grid w-max md:w-full md:grid-cols-7 gap-1">
```

Replace with:
```typescript
<TabsList className="inline-flex md:grid w-max md:w-full md:grid-cols-8 gap-1">
```

- [ ] **Step 5: Add "Aguardando Envio" tab trigger**

After line 1608 (after the "Em Preparação" `TabsTrigger` closing `</TabsTrigger>`), insert the new tab trigger:

```tsx
          <TabsTrigger value="aguardando-envio" className="shrink-0">
            <PackageCheck className="w-4 h-4 mr-2" />
            Aguardando Envio
            {site.aguardandoEnvio.length > 0 && (
              <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{site.aguardandoEnvio.length}</Badge>
            )}
          </TabsTrigger>
```

Note: `PackageCheck` is already imported (used in the "Entregues" tab).

- [ ] **Step 6: Replace "Em Preparação" tab content with TriagemSection**

Find lines 1658-1697 (the `TabsContent value="em-preparacao"` block). Replace the entire content block:

```tsx
// Before (lines 1658-1697 — the em-preparacao TabsContent):
      <TabsContent value="em-preparacao">
        {/* Filtro interno: Todos / Entrega / Retirada */}
        <div className="flex items-center gap-3 mb-5">
          <span className="text-sm text-muted-foreground font-medium">Filtrar:</span>
          <div className="flex gap-2">
            {(['all', 'delivery', 'pickup'] as const).map((f) => {
              const isActive = prepFilter === f;
              // ... (all the filter button code)
            })}
          </div>
        </div>
        <OrdersTable orders={prepFiltered} {...tableProps} />
      </TabsContent>

// After:
      <TabsContent value="em-preparacao">
        <TriagemSection
          orders={site.emPreparacao}
          onStatusChanged={loadOrders}
        />
      </TabsContent>
```

- [ ] **Step 7: Add "Aguardando Envio" tab content**

After the "Em Preparação" TabsContent, add:

```tsx
      <TabsContent value="aguardando-envio"><OrdersTable orders={site.aguardandoEnvio} {...tableProps} /></TabsContent>
```

- [ ] **Step 8: Remove unused `prepFilter` state and the `prepFiltered` variable**

Remove line 1058:
```typescript
// Remove this line:
  const [prepFilter, setPrepFilter] = useState<'all' | 'delivery' | 'pickup'>('all');
```

Remove lines 1585-1589:
```typescript
// Remove these lines:
    const prepFiltered = site.emPreparacao.filter(o => {
      if (prepFilter === 'delivery') return o.delivery_type === 'delivery';
      if (prepFilter === 'pickup') return o.delivery_type === 'pickup';
      return true;
    });
```

- [ ] **Step 9: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.app.json 2>&1 | head -30`
Expected: No errors

- [ ] **Step 10: Run existing test**

Run: `npx vitest run src/components/__tests__/OrdersManagement.test.tsx 2>&1 | tail -20`
Expected: Tests pass (or update if they reference prepFilter)

- [ ] **Step 11: Commit**

```bash
git add src/components/OrdersManagement.tsx
git commit -m "feat: embed TriagemSection in Em Preparação tab, add Aguardando Envio tab"
```

---

### Task 6: Remove Triagem route, nav entry, and admin grid card

**Files:**
- Modify: `src/App.tsx:21,95`
- Modify: `src/components/Header.tsx:163`
- Modify: `src/pages/Admin.tsx:91-95`

**Interfaces:**
- Consumes: nothing
- Produces: Triagem references removed from routing and navigation

- [ ] **Step 1: Remove from App.tsx**

In `src/App.tsx`, remove the lazy import on line 21:
```typescript
// Remove this line:
const AdminTriagem = lazy(() => import("./pages/AdminTriagem"));
```

Remove the route on line 95:
```typescript
// Remove this line:
<Route path="/admin/triagem" element={<AdminTriagem />} />
```

- [ ] **Step 2: Remove from Header.tsx**

In `src/components/Header.tsx`, remove line 163:
```typescript
// Remove this line:
{ label: 'Triagem', path: '/admin/triagem', icon: ScanLine, permKey: 'triagem' },
```

- [ ] **Step 3: Remove from Admin.tsx**

In `src/pages/Admin.tsx`, remove lines 90-96:
```typescript
// Remove this block:
    {
      title: 'Triagem',
      desc: 'Conferir retiradas e embalar envios por código de barras',
      icon: ScanBarcode,
      path: '/admin/triagem',
      perm: 'triagem',
    },
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.app.json 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/Header.tsx src/pages/Admin.tsx
git commit -m "feat: remove Triagem route, nav entry, and admin grid card"
```

---

### Task 7: Delete AdminTriagem.tsx

**Files:**
- Delete: `src/pages/AdminTriagem.tsx`

- [ ] **Step 1: Delete the file**

```bash
rm src/pages/AdminTriagem.tsx
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.app.json 2>&1 | head -20`
Expected: No errors (the import was removed in Task 6)

- [ ] **Step 3: Commit**

```bash
git add src/pages/AdminTriagem.tsx
git commit -m "feat: delete AdminTriagem page — merged into OrdersManagement"
```

---

### Task 8: Run full test suite and final verification

- [ ] **Step 1: Run all tests**

```bash
npx vitest run 2>&1 | tail -30
```
Expected: All tests pass

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit --project tsconfig.app.json 2>&1 | tail -20
```
Expected: No errors

- [ ] **Step 3: Verify the build compiles**

```bash
npx vite build 2>&1 | tail -20
```
Expected: Build succeeds

- [ ] **Step 4: Review PR-ready diff**

```bash
git diff origin/main --stat
```
Expected: Files changed match the spec summary

- [ ] **Step 5: Commit any remaining changes**

```bash
git status
```
Expected: Clean working tree
