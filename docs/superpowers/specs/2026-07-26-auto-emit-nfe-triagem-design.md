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
| `src/components/OrdersManagement.tsx` | **Editar** — auto-emissão no `updateOrderStatus` (retirado) + exibição NF-e nos cards |

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

### 6. OrdersManagement.tsx — Exibição da NF-e nos Cards

Adicionar badge de status da NF-e no cabeçalho do card (`renderOrderCard`, linha 522), visível assim que houver uma NF-e associada ao pedido (não apenas após auto-emissão).

**No cabeçalho do card** (junto aos badges existentes, após o badge de tipo de entrega):

```tsx
{order.nfe_emissions?.length > 0 && (() => {
  const latestNfe = order.nfe_emissions[order.nfe_emissions.length - 1];
  const nfeStatusColors: Record<string, string> = {
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
  const colorClass = nfeStatusColors[latestNfe.status] || 'bg-muted text-muted-foreground border-border';
  return (
    <Badge variant="outline" className={`text-[10px] font-semibold uppercase tracking-wide ${colorClass}`}>
      <Receipt className="w-3 h-3 mr-1" />
      NF-e {latestNfe.nfe_number ? `Nº ${latestNfe.nfe_number}` : latestNfe.status}
    </Badge>
  );
})()}
```

**Nos detalhes expandidos** (dentro do `CollapsibleContent`, ao expandir o card): mostrar lista de NF-es com links para DANFE/XML:

```tsx
{order.nfe_emissions?.length > 0 && (
  <div className="px-4 pb-3 space-y-2">
    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
      <Receipt className="w-3.5 h-3.5" /> Notas Fiscais
    </h4>
    {order.nfe_emissions.map((nfe: any) => (
      <div key={nfe.id} className="flex items-center justify-between gap-2 text-sm bg-muted/40 rounded-md px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant="outline" className={`text-[10px] ${nfeStatusColors[nfe.status] || ''}`}>
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
          <Button asChild variant="outline" size="sm" className="h-7 text-xs">
            <a href={`/api/download-danfe?key=${nfe.nfe_key || nfe.id}`} target="_blank" rel="noopener noreferrer">
              <Printer className="w-3 h-3 mr-1" /> DANFE
            </a>
          </Button>
        </div>
      </div>
    ))}
  </div>
)}
```

**Query**: adicionar `danfe_url` ao select de `nfe_emissions` no `loadOrders` (linha 1145):

```typescript
.select('id, order_id, nfe_number, nfe_key, nfe_xml_url, danfe_url, status, emitted_at, error_message')
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
- [ ] Card de pedido mostra badge NF-e quando há emissão associada
- [ ] Badge NF-e colorido corretamente por status (verde=autorizada, amarelo=pendente, vermelho=rejeitada)
- [ ] Card expandido mostra lista de NF-es com link DANFE e XML
- [ ] Pedido sem NF-e não mostra badge nem seção de notas fiscais
