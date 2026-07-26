# Separar Fluxos Entrega/Retirada na Gestão de Pedidos

**Data:** 2026-07-26
**Arquivo alvo:** `src/components/OrdersManagement.tsx`
**Protótipo:** `prototipo-tabs.html`

## Motivação

A gestão de pedidos do site exibia 8 tabs de status em uma única linha, causando sobreposição e ícones cortados. As tabs "Pronto para Retirada"/"Aguardando Envio" misturavam fluxos distintos (delivery vs. pickup).

## Design

### Segmented control principal

Dois botões no topo, estilo segmented control:

```
[ Retirada ] | [ Entrega ]
```

- "Retirada" à esquerda, selecionado por padrão
- Bolinha laranja (`w-2 h-2 bg-orange-500 rounded-full`, canto superior direito) quando há pendências naquele fluxo:
  - Retirada: bolinha visível se `site.prontoRetirar.length > 0`
  - Entrega: bolinha visível se `site.aguardandoEnvio.length > 0`

### Tabs por fluxo

Cada fluxo tem seu próprio `Tabs` com apenas os status relevantes:

**Retirada (6 tabs):**
1. Sem Pagamento (`aguardando_pagamento`, ambos os `delivery_type`)
2. Em Preparação (`em_preparo`, ambos os `delivery_type`)
3. Retirada (`pronto_retirada`, apenas `delivery_type === 'pickup'`)
4. Retirados (`retirado`, antes agrupado com `entregado`)
5. Devoluções (`devolvido` + `devolucao_solicitada`, ambos os `delivery_type`)
6. Cancelados (`cancelado`, ambos os `delivery_type`)

**Entrega (7 tabs):**
1. Sem Pagamento (mesmo filtro)
2. Em Preparação (mesmo filtro)
3. Envio (`aguardando_envio`, apenas `delivery_type !== 'pickup'`)
4. Em Transporte (`enviado`, ambos os `delivery_type`)
5. Entregues (`entregado`, ambos os `delivery_type`)
6. Devoluções (mesmo filtro)
7. Cancelados (mesmo filtro)

### Layout das tabs

- `TabsList` usa `flex flex-nowrap gap-1` (cada tab ocupa espaço do conteúdo, não colunas fixas)
- Wrapper com `overflow-x-auto` para fallback em telas muito estreitas
- Ícones `w-4 h-4 mr-2`, texto `text-sm`, badges normais — sem compactação forçada
- Todas as tabs visíveis em uma linha sem sobreposição

### Estrutura no componente

```tsx
const [flow, setFlow] = useState<'retirada' | 'entrega'>('retirada');
const hasPendingRetirada = site.prontoRetirar.length > 0;
const hasPendingEntrega = site.aguardandoEnvio.length > 0;
```

- Um bloco `Tabs` para o fluxo Retirada, outro para Entrega
- Ambos renderizados no DOM, visibilidade controlada por `flow` state
- `TriagemSection` continua apenas na tab "Em Preparação" (já existente)

### Dados

O objeto `site` atual é estendido com um novo campo:

```ts
retirados: siteOrders.filter(o => o.status === 'retirado')
```

O campo `entregues` existente é ajustado para filtrar apenas `entregado` (removendo `retirado`).

Os filtros compartilhados (`semPagamento`, `emPreparacao`, `devolucoes`, `cancelados`) permanecem como estão — incluem ambos os `delivery_type`.

### O que NÃO muda

- `TriagemSection` e `MelhorEnvioLabelDialog` continuam iguais
- Tabelas de pedidos (`OrdersTable`) sem alteração
- Lógica de cancelamento/estorno sem alteração
- `tableProps` mantido igual
