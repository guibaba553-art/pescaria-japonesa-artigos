# Auto-emissão de NF-e ao Concluir Triagem / Retirar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emitir NF-e automaticamente ao concluir triagem de entrega (`aguardando_envio`) e ao marcar retirada (`retirado`), com toggle de controle e exibição da NF-e nos cards de pedido.

**Architecture:** Hook no `TriagemScanDialog.handleConfirm` (pack mode) e `OrdersManagement.updateOrderStatus` (retirado). Ambos verificam `focus_nfe_settings.auto_emit_nfe_triagem` antes de chamar `emit-nfe`. Exibição da NF-e como badge colorido no cabeçalho do card + detalhes expandidos com links DANFE/XML.

**Tech Stack:** React 18, TypeScript, Supabase (client + edge functions), Tailwind CSS, shadcn/ui, Vitest

## Global Constraints

- Apenas pedidos do site (`source !== 'pdv'`)
- Respeitar `focus_nfe_settings.enabled && focus_nfe_settings.auto_emit_nfe_triagem`
- Pular emissão se NF-e já autorizada
- Erro na emissão não bloqueia transição de status
- Sempre verificar tipos TypeScript com `npx tsc --noEmit`

---

### Task 1: Migração SQL — coluna `auto_emit_nfe_triagem`

**Files:**
- Create: `supabase/migrations/20260726_auto_emit_nfe_triagem.sql`

**Interfaces:**
- Produces: `focus_nfe_settings.auto_emit_nfe_triagem BOOLEAN NOT NULL DEFAULT false`

- [ ] **Step 1: Criar arquivo de migração**

```sql
-- Adiciona toggle de auto-emissão NF-e ao concluir triagem/retirada
ALTER TABLE public.focus_nfe_settings
ADD COLUMN IF NOT EXISTS auto_emit_nfe_triagem BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260726_auto_emit_nfe_triagem.sql
git commit -m "feat: add auto_emit_nfe_triagem column to focus_nfe_settings"
```

---

### Task 2: Tipos TypeScript — atualizar `focus_nfe_settings`

**Files:**
- Modify: `src/integrations/supabase/types.ts`

**Interfaces:**
- Produces: `focus_nfe_settings.Row.auto_emit_nfe_triagem: boolean`

- [ ] **Step 1: Adicionar campo `auto_emit_nfe_triagem` aos tipos Row, Insert, Update**

No arquivo `src/integrations/supabase/types.ts`, localizar a seção `focus_nfe_settings` (aproximadamente linha 1175). Adicionar `auto_emit_nfe_triagem` em três blocos:

**Row** (após `auto_emit_nfe_pedido_pago`):
```typescript
auto_emit_nfe_triagem: boolean
```

**Insert** (após `auto_emit_nfe_pedido_pago`):
```typescript
auto_emit_nfe_triagem?: boolean
```

**Update** (após `auto_emit_nfe_pedido_pago`):
```typescript
auto_emit_nfe_triagem?: boolean
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Esperado: sem erros novos relacionados a `auto_emit_nfe_triagem`.

- [ ] **Step 3: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "feat: add auto_emit_nfe_triagem to focus_nfe_settings types"
```

---

### Task 3: Toggle no FocusNFeSettings

**Files:**
- Modify: `src/components/FocusNFeSettings.tsx`

**Interfaces:**
- Consumes: `focus_nfe_settings.auto_emit_nfe_triagem: boolean` (do tipo atualizado na Task 2)
- Produces: N/A (UI apenas, sem export de interface)

- [ ] **Step 1: Adicionar campo ao estado `form`**

No `src/components/FocusNFeSettings.tsx`, linha 87 (dentro do `useState` inicial de `form`), adicionar após `auto_emit_nfe_pedido_pago: false`:

```typescript
auto_emit_nfe_triagem: false,
```

- [ ] **Step 2: Carregar valor do banco no `load()`**

Na função `load()`, linha 123 (após `auto_emit_nfe_pedido_pago: settings.auto_emit_nfe_pedido_pago`), adicionar:

```typescript
auto_emit_nfe_triagem: settings.auto_emit_nfe_triagem ?? false,
```

- [ ] **Step 3: Adicionar toggle na seção "Emissão Automática"**

Após o segundo toggle (`auto_emit_nfe_pedido_pago`, linha 454), adicionar o terceiro toggle:

```tsx
<div className="flex items-center justify-between">
  <div>
    <Label>Emitir NF-e ao concluir triagem / retirar</Label>
    <p className="text-sm text-muted-foreground">
      Entrega: emite ao embalar. Retirada: emite quando o cliente retirar.
    </p>
  </div>
  <Switch
    checked={form.auto_emit_nfe_triagem}
    onCheckedChange={(v) => setForm({ ...form, auto_emit_nfe_triagem: v })}
  />
</div>
```

- [ ] **Step 4: Verificar compilação**

```bash
npx tsc --noEmit 2>&1 | grep -i "FocusNFeSettings\|auto_emit_nfe_triagem" | head -10
```

- [ ] **Step 5: Commit**

```bash
git add src/components/FocusNFeSettings.tsx
git commit -m "feat: add auto_emit_nfe_triagem toggle to FocusNFeSettings"
```

---

### Task 4: Auto-emissão no TriagemScanDialog (modo pack)

**Files:**
- Modify: `src/components/TriagemScanDialog.tsx`

**Interfaces:**
- Consumes: `supabase.functions.invoke('emit-nfe', { body: { orderId } })`
- Consumes: `focus_nfe_settings.enabled`, `focus_nfe_settings.auto_emit_nfe_triagem`
- Consumes: `order.nfe?.status` (para verificação de duplicidade)

- [ ] **Step 1: Adicionar função `autoEmitirNfe` após `emitNfe`**

Após a função `emitNfe` (linha 298), adicionar:

```typescript
const autoEmitirNfe = async (orderId: string) => {
  if (order?.nfe?.status === 'autorizada' || order?.nfe?.status === 'authorized') return;

  try {
    const { data: settings } = await supabase
      .from('focus_nfe_settings')
      .select('enabled, auto_emit_nfe_triagem')
      .limit(1)
      .maybeSingle();

    if (!settings?.enabled || !settings?.auto_emit_nfe_triagem) return;

    const { error } = await supabase.functions.invoke('emit-nfe', {
      body: { orderId },
    });

    if (error) {
      console.error('[Triagem] auto-emit NF-e error:', error);
      toast({
        title: 'Aviso',
        description: 'Pedido embalado, mas houve erro ao emitir NF-e automaticamente.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'NF-e emitida',
        description: 'A nota fiscal foi emitida automaticamente.',
      });
    }
  } catch (err) {
    console.error('[Triagem] auto-emit NF-e error:', err);
  }
};
```

- [ ] **Step 2: Chamar `autoEmitirNfe` no `handleConfirm` (modo pack)**

No `handleConfirm` (linha 221-227), após os toasts de sucesso e ANTES de `onCompleted()` e `onOpenChange(false)`, adicionar:

```typescript
if (mode === 'pack') {
  autoEmitirNfe(order.id);
}
```

O bloco completo fica:

```typescript
toast({
  title: mode === 'pickup' ? '✅ Triagem concluída' : '✅ Pedido embalado',
  description:
    mode === 'pickup'
      ? `Pedido #${order.id.slice(0, 8)} marcado como pronto para retirada.`
      : `Pedido #${order.id.slice(0, 8)} aguardando coleta da transportadora.`,
});

if (mode === 'pack') {
  autoEmitirNfe(order.id);
}

onCompleted();
onOpenChange(false);
```

- [ ] **Step 3: Verificar compilação**

```bash
npx tsc --noEmit 2>&1 | grep -i "TriagemScanDialog" | head -10
```

- [ ] **Step 4: Commit**

```bash
git add src/components/TriagemScanDialog.tsx
git commit -m "feat: auto-emit NF-e on triagem pack completion"
```

---

### Task 5: Auto-emissão no OrdersManagement + Exibição NF-e nos cards

**Files:**
- Modify: `src/components/OrdersManagement.tsx`

**Interfaces:**
- Consumes: `supabase.functions.invoke('emit-nfe', { body: { orderId } })`
- Consumes: `focus_nfe_settings.enabled`, `focus_nfe_settings.auto_emit_nfe_triagem`
- Consumes: `nfe_emissions.status`, `nfe_emissions.nfe_number`, etc. (já existentes)
- Produces: N/A

- [ ] **Step 1: Adicionar `danfe_url` à query de `nfe_emissions` no `loadOrders`**

No `loadOrders`, linha 1145, alterar o `.select()` para incluir `danfe_url`:

```typescript
.select('id, order_id, nfe_number, nfe_key, nfe_xml_url, danfe_url, status, emitted_at, error_message')
```

- [ ] **Step 2: Adicionar auto-emissão no `updateOrderStatus` quando `newStatus === 'retirado'`**

No `updateOrderStatus` (linha 1239), após o bloco existente de auto-emissão para `em_preparo` (linha 1299), adicionar:

```typescript
if (newStatus === 'retirado') {
  try {
    const { data: settings } = await supabase
      .from('focus_nfe_settings')
      .select('enabled, auto_emit_nfe_triagem')
      .limit(1)
      .maybeSingle();

    if (settings?.enabled && settings?.auto_emit_nfe_triagem) {
      const { data: nfe } = await supabase
        .from('nfe_emissions')
        .select('status')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!nfe || (nfe.status !== 'autorizada' && nfe.status !== 'authorized')) {
        const { error: nfeError } = await supabase.functions.invoke('emit-nfe', {
          body: { orderId }
        });
        if (nfeError) {
          console.error('[OrdersMgmt] auto-emit NF-e error:', nfeError);
          toast({
            title: 'Aviso',
            description: 'Pedido atualizado, mas houve erro ao emitir NF-e automaticamente.',
            variant: 'destructive'
          });
        } else {
          toast({
            title: 'NF-e emitida',
            description: 'NF-e foi emitida automaticamente.'
          });
        }
      }
    }
  } catch (err) {
    console.error('[OrdersMgmt] auto-emit NF-e error:', err);
  }
}
```

- [ ] **Step 3: Adicionar badge de NF-e no cabeçalho do `renderOrderCard`**

No `renderOrderCard` (linha 522), após o badge de tipo de entrega (linha 555), adicionar:

```tsx
{order.nfe_emissions && order.nfe_emissions.length > 0 && (() => {
  const latestNfe = order.nfe_emissions[order.nfe_emissions.length - 1];
  const nfeStatusColor: Record<string, string> = {
    autorizada: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
    authorized: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
    pendente: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
    pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
    rejeitada: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
    rejected: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
    error: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
    cancelada: 'bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/30',
    cancelled: 'bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/30',
  };
  const colorClass = nfeStatusColor[latestNfe.status] || 'bg-muted text-muted-foreground border-border';
  return (
    <Badge variant="outline" className={`text-[10px] font-semibold uppercase tracking-wide ${colorClass}`}>
      <Receipt className="w-3 h-3 mr-1" />
      NF-e {latestNfe.nfe_number ? `Nº ${latestNfe.nfe_number}` : latestNfe.status}
    </Badge>
  );
})()}
```

- [ ] **Step 4: Adicionar seção de NF-es nos detalhes expandidos**

Dentro do `CollapsibleContent` do card (após a seção de itens do pedido), adicionar:

```tsx
{order.nfe_emissions && order.nfe_emissions.length > 0 && (
  <div className="px-4 pb-3 space-y-2">
    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
      <Receipt className="w-3.5 h-3.5" /> Notas Fiscais
    </h4>
    {order.nfe_emissions.map((nfe: any) => {
      const nfeStatusColor: Record<string, string> = {
        autorizada: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
        authorized: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
        pendente: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
        pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
        rejeitada: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
        rejected: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
        error: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
        cancelada: 'bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/30',
        cancelled: 'bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/30',
      };
      const colorClass = nfeStatusColor[nfe.status] || 'bg-muted text-muted-foreground border-border';
      return (
        <div key={nfe.id} className="flex items-center justify-between gap-2 text-sm bg-muted/40 rounded-md px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="outline" className={`text-[10px] ${colorClass}`}>
              {nfe.status}
            </Badge>
            {nfe.nfe_number && (
              <span className="font-mono text-xs">Nº {nfe.nfe_number}</span>
            )}
            {nfe.emitted_at && (
              <span className="text-xs text-muted-foreground">
                {new Date(nfe.emitted_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {nfe.nfe_xml_url && (
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                <a href={nfe.nfe_xml_url} target="_blank" rel="noopener noreferrer">XML</a>
              </Button>
            )}
            {nfe.danfe_url && (
              <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                <a href={nfe.danfe_url} target="_blank" rel="noopener noreferrer">
                  <Printer className="w-3 h-3 mr-1" /> DANFE
                </a>
              </Button>
            )}
          </div>
        </div>
      );
    })}
  </div>
)}
```

- [ ] **Step 5: Verificar compilação**

```bash
npx tsc --noEmit 2>&1 | grep -i "OrdersManagement" | head -10
```

- [ ] **Step 6: Rodar testes existentes do OrdersManagement**

```bash
npx vitest run src/components/__tests__/OrdersManagement.test.tsx
```

Verificar que testes existentes continuam passando.

- [ ] **Step 7: Commit**

```bash
git add src/components/OrdersManagement.tsx
git commit -m "feat: auto-emit NF-e on retirado + display NF-e badge on order cards"
```

---

### Task 6: Verificação final

- [ ] **Step 1: TypeScript check global**

```bash
npx tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 2: Rodar todos os testes**

```bash
npx vitest run
```

- [ ] **Step 3: Verificar lint**

```bash
npx eslint src/components/TriagemScanDialog.tsx src/components/OrdersManagement.tsx src/components/FocusNFeSettings.tsx --max-warnings=0 2>&1 | tail -5
```

- [ ] **Step 4: Commit final se necessário**

```bash
git status
```
