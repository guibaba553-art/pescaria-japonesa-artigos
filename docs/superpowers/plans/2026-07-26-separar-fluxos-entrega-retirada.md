# Separar Fluxos Entrega/Retirada — Plano de Implementação

> **Para agentes:** Use superpowers:subagent-driven-development ou superpowers:executing-plans para implementar task por task. Steps usam checkbox (`- [ ]`) para tracking.

**Goal:** Separar a gestão de pedidos em dois fluxos (Retirada/Entrega) com segmented control, reduzindo tabs de 8 para 6-7 por fluxo.

**Architecture:** Um estado `flow` controla qual conjunto de tabs é exibido. Cada fluxo tem seu próprio `<Tabs>` com apenas os status relevantes. O objeto `site` ganha o campo `retirados` e `entregues` é ajustado para não incluir mais `retirado`.

**Tech Stack:** React, TypeScript, Tailwind, Radix UI Tabs, lucide-react

## Global Constraints

- Alterar apenas `src/components/OrdersManagement.tsx`
- Manter compatibilidade com `TriagemSection`, `OrdersTable`, `MelhorEnvioLabelDialog`
- `tableProps` permanece idêntico
- Testes existentes em `src/components/__tests__/OrdersManagement.test.tsx` devem continuar passando

---

### Task 1: Ajustar dados — novo campo `retirados` e split de `entregues`

**Files:**
- Modify: `src/components/OrdersManagement.tsx:1597-1606`

**Interfaces:**
- Consumes: `siteOrders` (já definido na linha 1595)
- Produces: `site.retirados: Order[]`, `site.entregues` ajustado (só `entregado`, sem `retirado`)

- [ ] **Step 1: Adicionar `retirados` e ajustar `entregues`**

Substituir o bloco do objeto `site` (linhas 1597-1606):

```tsx
  const site = {
    semPagamento: siteOrders.filter(o => o.status === 'aguardando_pagamento'),
    emPreparacao: siteOrders.filter(o => o.status === 'em_preparo'),
    aguardandoEnvio: siteOrders.filter(o => o.status === 'aguardando_envio'),
    prontoRetirar: siteOrders.filter(o => o.status === 'pronto_retirada' && o.delivery_type === 'pickup'),
    emCaminho: siteOrders.filter(o => o.status === 'enviado'),
    entregues: siteOrders.filter(o => o.status === 'entregado'),
    retirados: siteOrders.filter(o => o.status === 'retirado'),
    devolucoes: siteOrders.filter(o => o.status === 'devolvido' || o.status === 'devolucao_solicitada'),
    cancelados: siteOrders.filter(o => o.status === 'cancelado'),
  };
```

- [ ] **Step 2: Rodar build de verificação**

```bash
npm run build
```

Esperado: sem erros de TypeScript.

- [ ] **Step 3: Commit**

```bash
git add src/components/OrdersManagement.tsx
git commit -m "refactor: split retirados from entregues in site orders data"
```

---

### Task 2: Substituir `renderSiteTabs` por segmented control + dois fluxos

**Files:**
- Modify: `src/components/OrdersManagement.tsx:1626-1718`

**Interfaces:**
- Consumes: `site` (Task 1), `tableProps` (linha 1608)
- Produces: componente com segmented control e dois blocos `<Tabs>`

- [ ] **Step 1: Adicionar import do `Store` no topo do arquivo (se não existir)**

Verificar linha 9. `Store` já está importado. Pular este step.

- [ ] **Step 2: Adicionar estado `flow` e indicadores de pendência**

Após a definição de `tableProps` (linha 1624), adicionar:

```tsx
  const [flow, setFlow] = useState<'retirada' | 'entrega'>('retirada');
  const hasPendingRetirada = site.prontoRetirar.length > 0;
  const hasPendingEntrega = site.aguardandoEnvio.length > 0;
```

- [ ] **Step 3: Substituir `renderSiteTabs` inteiro (linhas 1626-1718)**

Apagar toda a função `renderSiteTabs` e substituir pelo código abaixo, mantendo-o inline no local da chamada (linha 1759):

```tsx
  const renderSiteTabs = () => {
    const sharedTabs = {
      semPagamento: (
        <TabsTrigger key="sem-pagamento" value="sem-pagamento" className="shrink-0">
          <Clock className="w-4 h-4 mr-2" />
          Sem Pagamento
          {site.semPagamento.length > 0 && (
            <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{site.semPagamento.length}</Badge>
          )}
        </TabsTrigger>
      ),
      emPreparacao: (
        <TabsTrigger key="em-preparacao" value="em-preparacao" className="shrink-0">
          <Package className="w-4 h-4 mr-2" />
          Em Preparação
          {site.emPreparacao.length > 0 && (
            <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{site.emPreparacao.length}</Badge>
          )}
        </TabsTrigger>
      ),
      devolucoes: (
        <TabsTrigger
          key="devolucoes"
          value="devolucoes"
          className="shrink-0 data-[state=active]:bg-red-500/15 data-[state=active]:text-red-600 dark:data-[state=active]:text-red-400"
        >
          <Undo2 className="w-4 h-4 mr-2" />
          Devoluções
          {site.devolucoes.length > 0 && (
            <Badge className="ml-2 h-5 min-w-5 px-1 bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30">
              {site.devolucoes.length}
            </Badge>
          )}
        </TabsTrigger>
      ),
      cancelados: (
        <TabsTrigger
          key="cancelados"
          value="cancelados"
          className="shrink-0 data-[state=active]:bg-red-500/15 data-[state=active]:text-red-600 dark:data-[state=active]:text-red-400"
        >
          <XCircle className="w-4 h-4 mr-2" />
          Cancelados
          {site.cancelados.length > 0 && (
            <Badge className="ml-2 h-5 min-w-5 px-1 bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30">
              {site.cancelados.length}
            </Badge>
          )}
        </TabsTrigger>
      ),
    };

    return (
      <div className="space-y-4">
        {/* Segmented control */}
        <div className="inline-flex rounded-lg bg-muted p-1">
          <button
            onClick={() => setFlow('retirada')}
            className={`relative inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-all ${
              flow === 'retirada'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Store className="w-4 h-4" />
            Retirada
            {hasPendingRetirada && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-orange-500 rounded-full ring-2 ring-background" />
            )}
          </button>
          <button
            onClick={() => setFlow('entrega')}
            className={`relative inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-all ${
              flow === 'entrega'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Truck className="w-4 h-4" />
            Entrega
            {hasPendingEntrega && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-orange-500 rounded-full ring-2 ring-background" />
            )}
          </button>
        </div>

        {/* Fluxo Retirada */}
        {flow === 'retirada' && (
          <Tabs defaultValue="sem-pagamento">
            <div className="-mx-3 md:mx-0 px-3 md:px-0 overflow-x-auto">
              <TabsList className="inline-flex flex-nowrap w-max gap-1 mx-auto">
                {sharedTabs.semPagamento}
                {sharedTabs.emPreparacao}
                <TabsTrigger value="pronto-retirar" className="shrink-0">
                  <Store className="w-4 h-4 mr-2" />
                  Retirada
                  {site.prontoRetirar.length > 0 && (
                    <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{site.prontoRetirar.length}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="retirados" className="shrink-0">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Retirados
                  {site.retirados.length > 0 && (
                    <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{site.retirados.length}</Badge>
                  )}
                </TabsTrigger>
                {sharedTabs.devolucoes}
                {sharedTabs.cancelados}
              </TabsList>
            </div>

            <TabsContent value="sem-pagamento"><OrdersTable orders={site.semPagamento} {...tableProps} /></TabsContent>
            <TabsContent value="em-preparacao">
              <TriagemSection
                orders={site.emPreparacao}
                profiles={profiles}
                onStatusChanged={loadOrders}
                openLabelDialog={(o: Order) => setLabelOrder(o)}
                cancelOrder={cancelOrder}
                cancellingOrders={cancellingOrders}
              />
            </TabsContent>
            <TabsContent value="pronto-retirar"><OrdersTable orders={site.prontoRetirar} {...tableProps} /></TabsContent>
            <TabsContent value="retirados"><OrdersTable orders={site.retirados} {...tableProps} /></TabsContent>
            <TabsContent value="devolucoes"><OrdersTable orders={site.devolucoes} {...tableProps} /></TabsContent>
            <TabsContent value="cancelados"><OrdersTable orders={site.cancelados} {...tableProps} /></TabsContent>
          </Tabs>
        )}

        {/* Fluxo Entrega */}
        {flow === 'entrega' && (
          <Tabs defaultValue="sem-pagamento">
            <div className="-mx-3 md:mx-0 px-3 md:px-0 overflow-x-auto">
              <TabsList className="inline-flex flex-nowrap w-max gap-1 mx-auto">
                {sharedTabs.semPagamento}
                {sharedTabs.emPreparacao}
                <TabsTrigger value="aguardando-envio" className="shrink-0">
                  <PackageCheck className="w-4 h-4 mr-2" />
                  Envio
                  {site.aguardandoEnvio.length > 0 && (
                    <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{site.aguardandoEnvio.length}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="em-caminho" className="shrink-0">
                  <Truck className="w-4 h-4 mr-2" />
                  Em Transporte
                  {site.emCaminho.length > 0 && (
                    <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{site.emCaminho.length}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="entregues" className="shrink-0">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Entregues
                  {site.entregues.length > 0 && (
                    <Badge className="ml-2 h-5 min-w-5 px-1" variant="secondary">{site.entregues.length}</Badge>
                  )}
                </TabsTrigger>
                {sharedTabs.devolucoes}
                {sharedTabs.cancelados}
              </TabsList>
            </div>

            <TabsContent value="sem-pagamento"><OrdersTable orders={site.semPagamento} {...tableProps} /></TabsContent>
            <TabsContent value="em-preparacao">
              <TriagemSection
                orders={site.emPreparacao}
                profiles={profiles}
                onStatusChanged={loadOrders}
                openLabelDialog={(o: Order) => setLabelOrder(o)}
                cancelOrder={cancelOrder}
                cancellingOrders={cancellingOrders}
              />
            </TabsContent>
            <TabsContent value="aguardando-envio"><OrdersTable orders={site.aguardandoEnvio} {...tableProps} /></TabsContent>
            <TabsContent value="em-caminho"><OrdersTable orders={site.emCaminho} {...tableProps} /></TabsContent>
            <TabsContent value="entregues"><OrdersTable orders={site.entregues} {...tableProps} /></TabsContent>
            <TabsContent value="devolucoes"><OrdersTable orders={site.devolucoes} {...tableProps} /></TabsContent>
            <TabsContent value="cancelados"><OrdersTable orders={site.cancelados} {...tableProps} /></TabsContent>
          </Tabs>
        )}
      </div>
    );
  };
```

- [ ] **Step 4: Rodar build de verificação**

```bash
npm run build
```

Esperado: sem erros. Se houver erro de `CheckCircle` não importado, adicionar na linha 9 junto aos outros imports do lucide-react.

- [ ] **Step 5: Rodar testes existentes**

```bash
npm test -- --run src/components/__tests__/OrdersManagement.test.tsx
```

Esperado: testes relacionados a cancelamento/estorno continuam passando.

- [ ] **Step 6: Commit**

```bash
git add src/components/OrdersManagement.tsx
git commit -m "feat: separate order management into pickup/delivery flows with segmented control"
```

---

### Task 3: Verificação final e limpeza

**Files:**
- Modify: `src/components/OrdersManagement.tsx`

- [ ] **Step 1: Rodar build e testes completos**

```bash
npm run build && npm test -- --run src/components/__tests__/OrdersManagement.test.tsx
```

- [ ] **Step 2: Verificar visualmente**

Abrir `http://localhost:8080/admin/pedidos` e verificar:
- Segmented control "Retirada | Entrega" aparece no topo
- Retirada é o default selecionado
- Bolinhas laranja aparecem quando há pendências
- Tabs em cada fluxo cabem em uma linha sem sobreposição
- Trocar entre fluxos funciona corretamente

- [ ] **Step 3: Commit final (se houver ajustes)**

```bash
git add -A && git commit -m "chore: final adjustments for pickup/delivery flow separation"
```
