# Auto-emissão de NF-e ao Concluir Triagem / Retirar

**Data:** 2026-07-26
**Status:** Aprovado

## Motivação

Hoje a emissão de NF-e para pedidos do site é manual: o operador precisa clicar em "Emitir Nota" no painel de Análise de Vendas. O objetivo é automatizar esse processo, emitindo a NF-e no momento adequado do fluxo:

- **Entrega:** ao concluir a triagem de embalagem (`em_preparo` → `aguardando_envio`)
- **Retirada:** quando o cliente efetivamente retira o pedido (`pronto_retirada` → `retirado`)

## Escopo

- Apenas pedidos do site (`source !== 'pdv'`). PDV já tem auto-emissão via trigger `auto-emit-fiscal`.
- Respeita as configurações fiscais: `focus_nfe_settings.enabled` e novo campo `auto_emit_nfe_triagem`.
- Pula emissão se o pedido já possui NF-e autorizada (evita duplicidade).
- Falha na emissão não bloqueia o fluxo — apenas notifica via toast.

## Arquivos Afetados

| Arquivo | Tipo de Alteração |
|---|---|
| `supabase/migrations/<timestamp>_auto_emit_nfe_triagem.sql` | **Novo** — adiciona coluna `auto_emit_nfe_triagem` |
| `src/integrations/supabase/types.ts` | **Editar** — adicionar campo ao tipo `focus_nfe_settings` |
| `src/components/FocusNFeSettings.tsx` | **Editar** — novo toggle na UI |
| `src/components/TriagemScanDialog.tsx` | **Editar** — auto-emissão no `handleConfirm` (modo pack) |
| `src/components/OrdersManagement.tsx` | **Editar** — auto-emissão no `updateOrderStatus` (retirado) |

## Design Detalhado

### 1. Migração SQL

Adicionar coluna à tabela `focus_nfe_settings`:

```sql
ALTER TABLE focus_nfe_settings
ADD COLUMN IF NOT EXISTS auto_emit_nfe_triagem BOOLEAN NOT NULL DEFAULT false;
```

### 2. Tipos TypeScript

Em `src/integrations/supabase/types.ts`, adicionar `auto_emit_nfe_triagem: boolean` aos tipos `Row`, `Insert` e `Update` de `focus_nfe_settings`.

### 3. FocusNFeSettings.tsx

Adicionar um terceiro toggle na seção "Emissão Automática" (Card já existente, linhas 430-456):

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

Adicionar `auto_emit_nfe_triagem: false` ao estado inicial `form` e carregar do banco no `load()`.

### 4. TriagemScanDialog.tsx — handleConfirm (modo pack)

Após sucesso do `handleConfirm` (linha 209), quando `mode === 'pack'`:

```typescript
// Após status atualizado com sucesso (linha 221-227)
if (mode === 'pack') {
  autoEmitirNfe(order.id);
}
```

Função auxiliar (no componente ou importada):

```typescript
const autoEmitirNfe = async (orderId: string) => {
  // Verifica se já tem NF-e autorizada
  if (order.nfe?.status === 'autorizada' || order.nfe?.status === 'authorized') return;

  // Verifica config
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
    toast({ title: 'Aviso', description: 'Pedido embalado, mas houve erro ao emitir NF-e automaticamente.', variant: 'destructive' });
  } else {
    toast({ title: 'NF-e emitida', description: 'A nota fiscal foi emitida automaticamente.' });
  }
};
```

### 5. OrdersManagement.tsx — updateOrderStatus

No `updateOrderStatus` (linha 1239), adicionar verificação quando `newStatus === 'retirado'`:

```typescript
if (newStatus === 'retirado') {
  try {
    const { data: settings } = await supabase
      .from('focus_nfe_settings')
      .select('enabled, auto_emit_nfe_triagem')
      .limit(1)
      .maybeSingle();

    if (settings?.enabled && settings?.auto_emit_nfe_triagem) {
      // Verificar se já tem NF-e
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
          toast({ title: 'Aviso', description: 'Pedido atualizado, mas houve erro ao emitir NF-e automaticamente.', variant: 'destructive' });
        } else {
          toast({ title: 'NF-e emitida', description: 'NF-e foi emitida automaticamente.' });
        }
      }
    }
  } catch (err) {
    console.error('[OrdersMgmt] auto-emit NF-e error:', err);
  }
}
```

## Fluxo Completo

```
┌─────────────────────────────────────────────────────────────┐
│                    Pedido do Site                            │
│                                                             │
│  aguardando_pagamento → em_preparo → triagem                │
│                                         │                   │
│                          ┌──────────────┴──────────────┐    │
│                          │                             │    │
│                     ENTRAGA (pack)              RETIRADA     │
│                          │                      (pickup)     │
│                          ▼                             │    │
│                   aguardando_envio              pronto_retirada
│                          │                             │    │
│                   ┌──────┴──────┐               ┌─────┴────┐│
│                   │ auto_emitir │               │ cliente  ││
│                   │    NF-e  ✓  │               │  retira  ││
│                   └─────────────┘               └─────┬────┘│
│                          │                             │    │
│                          ▼                             ▼    │
│                      enviado                      retirado   │
│                                                     │       │
│                                               ┌─────┴────┐  │
│                                               │ auto_emit│  │
│                                               │  NF-e  ✓ │  │
│                                               └──────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Verificações de Segurança

1. **Apenas site:** verifica `order.source !== 'pdv'` (implícito no fluxo — PDV não passa pela triagem de site)
2. **Config ativa:** `focus_nfe_settings.enabled && auto_emit_nfe_triagem`
3. **Sem duplicidade:** verifica se já existe NF-e autorizada antes de emitir
4. **Não bloqueante:** erros na emissão não revertem a transição de status

## Testes

- [ ] Triagem pack: ao confirmar, NF-e é emitida automaticamente (com config ativa)
- [ ] Triagem pack: NF-e NÃO é emitida se config desabilitada
- [ ] Triagem pack: NF-e NÃO é emitida se já existe autorizada
- [ ] Retirada: ao marcar como retirado, NF-e é emitida (com config ativa)
- [ ] Retirada: NF-e NÃO é emitida se config desabilitada
- [ ] Retirada: NF-e NÃO é emitida se já existe autorizada
- [ ] PDV: não afetado (não dispara auto-emissão indevida)
- [ ] Toggle aparece e funciona no FocusNFeSettings
