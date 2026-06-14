# Spec: Correções do Fluxo de Pagamento

> **Visão:** Negocial + Técnica
> **Público:** Desenvolvedores, product owners, revisores de código
> **Versão:** 1.0
> **Baseada em:** Auditoria do código-fonte em jul/2025

---

## Propósito

Corrigir problemas identificados no fluxo de pagamento unificado (AbacatePay + Asaas + MercadoPago legado), abrangendo desde validação de dados sensíveis (PCI-DSS) até condições de corrida, duplicação de registros e falhas na retentativa de cartão. Estas correções visam tornar o fluxo robusto, seguro e consistente entre os gateways.

---

## Problemas Identificados

### 🔴 Críticos — Impacto direto na experiência do usuário ou segurança

| ID | Problema | Onde | Risco |
|----|----------|------|:-----:|
| **P01** | **Cartão salvo não funciona na retentativa.** O frontend envia o `id` da tabela `saved_payment_methods` (UUID) como `creditCardToken`, mas a edge function espera o token Asaas (`asaas_credit_card_token`). Retentativa com cartão salvo sempre falha. | `src/components/CreditCardForm.tsx:365-367` + `supabase/functions/retry-payment-asaas/index.ts:166-188` | 🔴 Usuário não consegue pagar com cartão salvo |
| **P02** | **PIX expirado no dialog sem refresh.** `PixPaymentDialog` é renderizado sem a prop `onRefreshPix`. Se o PIX expirar durante a exibição do dialog, o usuário fica travado sem conseguir gerar um novo QR Code. | `src/pages/CheckoutEntrega.tsx:1199-1208` | 🔴 Usuário não consegue finalizar compra |
| **P03** | **Dupla subtração de estoque.** `verify-payment` (polling) chama `subtract-stock` quando detecta pagamento aprovado. O `asaas-webhook` também chama `subtract-stock` no mesmo evento. Se ambos processarem, o estoque é subtraído duas vezes. | `supabase/functions/verify-payment/index.ts:273-291` + `supabase/functions/asaas-webhook/index.ts:...` | 🔴 Estoque fica incorreto (subtraído em dobro) |
| **P04** | **Idempotência de webhook não atômica.** A verificação (`SELECT`) e o registro (`INSERT`) em `webhook_events` são operações separadas. Webhooks simultâneos podem ambos passar na verificação e processar o mesmo evento duas vezes. | `supabase/functions/asaas-webhook/index.ts:80-95,294-301` | 🔴 Ações pós-pagamento executadas múltiplas vezes |
| **P05** | **Fallback com dados brutos de cartão.** Se a tokenização Asaas falha, o código envia dados brutos do cartão (número, CVV) para a API. Isso viola princípios PCI-DSS e aumenta a superfície de ataque. | `supabase/functions/create-payment-asaas/index.ts:187-192` | 🔴 Risco de segurança PCI-DSS |
| **P25** | **Tokenização de cartão não funciona em "Minha Conta → Pagamento".** `MyPaymentMethods.tsx` insere cartão diretamente no banco (`INSERT saved_payment_methods`) sem chamar `POST /v3/creditCard/tokenizeCreditCard` do Asaas. O campo `asaas_credit_card_token` fica NULL. Cartões aparecem na lista mas são inutilizáveis porque o gateway não reconhece o token. Também não é possível tokenizar/adicionar um cartão novo a partir dessa tela. | `src/components/MyPaymentMethods.tsx:185-194` + `src/components/CreditCardForm.tsx:365-367` | 🔴 Usuário não pode pagar com cartão salvo; funcionalidade de gerenciamento de cartões quebrada |
| **P26** | **Usuário consegue fechar modal PIX e continuar no carrinho.** O `PixPaymentDialog` pode ser fechado livremente (clique fora, ESC, X) sem trava ou confirmação. O pedido já foi criado no banco com estoque reservado e o PIX já foi gerado no gateway. Após fechar, o usuário pode trocar para outra forma de pagamento e gerar um novo pagamento para o mesmo pedido — ou, após refresh da página, criar um segundo pedido. O pedido original fica órfão. | `src/pages/CheckoutEntrega.tsx:1199-1208` + `src/components/PixPaymentDialog.tsx:159` | 🔴 Múltiplos pedidos/pagamentos órfãos; estoque reservado sem necessidade; PIX gerado sem uso |
| **P29** | **Sem verificação de cobrança duplicada para cartão.** As edge functions `create-payment-asaas` e `retry-payment-asaas` não verificam se o pedido já possui um pagamento aprovado ou um PIX ativo antes de processar uma nova cobrança de cartão. Em cenários de concorrência (duplo clique, refresh, retorno após fechar modal PIX), o Asaas pode processar múltiplas cobranças de cartão para o mesmo pedido, gerando custo real de taxa de gateway e estorno. | `supabase/functions/create-payment-asaas/index.ts` + `retry-payment-asaas/index.ts` | 🔴 Cobranças duplicadas com custo real (taxa de gateway + estorno)

### 🟡 Altos — Impacto moderado, afeta subset de usuários

| ID | Problema | Onde | Risco |
|----|----------|------|:-----:|
| **P06** | **Duplicação de cartões salvos.** Frontend (linhas 661-678) e backend (tokenização pós-pagamento) ambos salvam o cartão após pagamento aprovado, podendo gerar registros duplicados em `saved_payment_methods`. | `src/pages/CheckoutEntrega.tsx:661-678` | 🟡 Registros duplicados |
| **P07** | **CPF sem validação de dígitos verificadores.** A validação só verifica comprimento (11 dígitos). CPFs inválidos como `000.000.000-00` passam. | `src/components/CreditCardForm.tsx:248-252` | 🟡 Dados inválidos enviados ao gateway |
| **P08** | **Diferença de centavos no parcelamento.** `installmentValue` é calculado com `toFixed(2)` simples, podendo haver diferença entre a soma das parcelas e o total. Asaas pode rejeitar. | `supabase/functions/create-payment-asaas/index.ts:210` | 🟡 Parcelamento rejeitado |
| **P09** | **Validação superficial dos campos de cartão.** Só verifica se `creditCard` existe, sem validar formato de `number`, `ccv`, `holderName`, etc. Erros só aparecem na resposta genérica do Asaas. | `supabase/functions/create-payment-asaas/index.ts:46-55` | 🟡 Mensagens de erro genéricas |
| **P10** | **Ações pós-pagamento executadas antes de registrar idempotência.** O insert em `webhook_events` acontece **depois** de executar as ações de pós-pagamento. Se a função crashar entre executar as ações e registrar, um retry processará o mesmo evento. | `supabase/functions/asaas-webhook/index.ts:293-301` | 🟡 Ações pós-pagamento podem duplicar |
| **P11** | **Retentativa não tokeniza cartão.** Se `saveCard` for true na retentativa (`retry-payment-asaas`), o cartão não é tokenizado nem salvo, ao contrário do `create-payment-asaas`. | `supabase/functions/retry-payment-asaas/index.ts:152-188` | 🟡 Cartão não é salvo na retentativa |
| **P12** | **Polling pode disparar ações com dialog fechado.** Se o dialog for fechado enquanto uma requisição `checkPaymentStatus` está em voo, a resposta pode navegar para `/conta` e disparar toasts com o dialog já fechado. | `src/components/PixPaymentDialog.tsx:70-132` | 🟡 Comportamento inesperado |
| **P27** | **SavedMethod não inclui `asaas_credit_card_token`.** A interface `SavedMethod` em `CheckoutEntrega.tsx` (linhas 52-62) omite o campo `asaas_credit_card_token`, impedindo que o `CreditCardForm` envie o token correto do Asaas quando o usuário seleciona um cartão salvo. | `src/pages/CheckoutEntrega.tsx:52-62` | 🟡 Cartão salvo nunca funciona |
| **P28** | **Múltiplos PIX para o mesmo pedido sem limite de regeneração.** As edge functions `create-abacatepay-pix` e `create-asaas-pix` não verificam se o pedido já gerou PIX antes, e não há contador de regenerações. O usuário pode gerar PIX infinitamente ao alternar entre métodos. | `supabase/functions/create-abacatepay-pix/index.ts` + `create-asaas-pix/index.ts` | 🟡 Cobranças PIX ilimitadas; usuário pode gerar dezenas de PIX |
| **P30** | **Sem coluna `pix_attempts` na tabela `orders`.** A migration atual não criou campo para controlar quantas vezes o PIX foi regenerado para um pedido. Sem ele, não é possível limitar a regeneração de PIX a 3 tentativas. | `supabase/migrations/20260602000000_add_asaas_fields.sql` | 🟡 Impossível implementar limite de regeneração de PIX |

### 🟢 Médios/Baixos — Impacto menor ou cosmético

| ID | Problema | Onde | Risco |
|----|----------|------|:-----:|
| **P13** | **`totalAmount` fixo em 0 na retentativa em `/conta`.** O `CreditCardForm` do diálogo de retentativa recebe `totalAmount={0}`, fazendo o cálculo de parcelas resultar em 0 parcelas. | `src/pages/Account.tsx:914` | 🟢 Parcelamento não exibido |
| **P14** | **Retentativa não envia token de cartão salvo.** `handleRetryCard` não extrai `asaas_credit_card_token` do cartão salvo para enviar no body. | `src/pages/Account.tsx:321-336` | 🟢 Cartão salvo não funciona na retentativa via `/conta` |
| **P15** | **Botões de retentativa escondidos quando há PIX.** A condição `payment_attempts > 0 && !order.qr_code` exclui pedidos que têm BOTH tentativas de cartão E QR Code PIX gerado. Usuário fica sem opções. | `src/pages/Account.tsx:532` | 🟢 Usuário sem ação disponível |
| **P16** | **Dados vazios do titular com cartão salvo.** Quando `mode === 'saved'`, `buildFormData()` (linha 342) sempre inclui campos vazios de `creditCardHolderInfo`, enviando dados vazios para a edge function. | `src/components/CreditCardForm.tsx:237-270,342` | 🟢 Dados inválidos enviados |
| **P17** | **Migração `payment_received_at` pode não estar aplicada.** Tratamento de erro silencioso "coluna pode não existir" indica migration pendente em produção. | `supabase/functions/asaas-webhook/index.ts:201-209` | 🟢 Log sem ação |
| **P18** | **URL de polling AbacatePay usa query parameter.** `GET /v2/transparents/check?id=...` em vez de path parameter. Pode estar incorreto conforme documentação. | `supabase/functions/verify-payment/index.ts:153` | 🟢 Polling pode falhar |
| **P19** | **Update sem guard contra concorrência.** `verify-payment` atualiza pedido para `em_preparo` sem verificar `status = 'aguardando_pagamento'`. Chamadas concorrentes fazem update desnecessário. | `supabase/functions/verify-payment/index.ts:256-260` | 🟢 Update redundante |
| **P20** | **Inconsistência no uso de toast.** `PixPaymentDialog` usa `@/hooks/use-toast` (objeto), `CheckoutEntrega.tsx` usa `sonner` (string). Comportamento visual diferente entre páginas. | `src/components/PixPaymentDialog.tsx:91-94` | 🟢 Inconsistência visual |
| **P21** | **Log de erro inseguro.** `console.error('AbacatePay PIX error, trying fallback:', abacatepayErr)` pode vazar detalhes da resposta da API. | `src/pages/CheckoutEntrega.tsx:552-553` | 🟢 Vazamento de informação |
| **P22** | **`setFinalizing(false)` redundante.** Chamado duas vezes durante o fluxo de erro no checkout (linhas 600 e finally 697). | `src/pages/CheckoutEntrega.tsx:597-600,697` | 🟢 Código confuso |
| **P23** | **Condição de corrida na limpeza de pedidos abandonados.** SELECT busca pedidos sem `payment_id`, mas entre SELECT e DELETE um webhook pode ter confirmado o pagamento. | `src/pages/CheckoutEntrega.tsx:424-435` | 🟢 Risco de cancelar pedido pago |
| **P24** | **Retentativa sem lookup do token Asaas.** Se `creditCardToken` é enviado, a função o usa diretamente, mas o frontend envia o `id` da tabela (UUID), não o token Asaas. | `supabase/functions/retry-payment-asaas/index.ts:166-188` | 🟢 (Mesmo problema do P01, duplicado intencional p/ mapear 2 arquivos) |

---

## Decisões de Correção

| Decisão | Escolha | Justificativa |
|---------|---------|---------------|
| Responsabilidade de salvar cartão | **Apenas backend** (edge function) | Evita duplicação P06; frontend envia `saveCard=true/false` e backend gerencia |
| Subtração de estoque | **Apenas webhook** | Remove `subtract-stock` do `verify-payment` (P03). Polling só atualiza status; webhook é a fonte da verdade |
| Idempotência de webhook | **`INSERT ... ON CONFLICT DO NOTHING`** | Torna a operação atômica (P04/P10) |
| Fallback de tokenização | **Nunca enviar dados brutos** | Se tokenização falhar, retornar erro (P05). Segurança PCI-DSS > conveniência |
| Validação de cartão | **Zod schema** | Validar campos antes de chamar API Asaas (P09), retornando erros em português |
| Token de cartão salvo | **Lookup pelo `id` da tabela** | Edge function faz `SELECT asaas_credit_card_token WHERE id = $1` para traduzir UUID → token Asaas (P01/P18) |
| Tokenização em MyPaymentMethods | **Chamar edge function dedicada** | `MyPaymentMethods` não pode inserir cartão diretamente no banco sem tokenizar no Asaas. Criar edge function `tokenize-card` que chama `POST /v3/creditCard/tokenizeCreditCard` e salva token (P25) |
| `totalAmount` na retentativa | **Buscar do pedido** | Account.tsx deve passar `order.total_amount` (P13) |
| Bloqueio de cobrança duplicada (PIX e cartão) | **Guard unificado nas edge functions + PIX cancelado ao trocar método** | Impedir nova cobrança (PIX ou cartão) se o pedido já possui um pagamento ativo (P26/P28/P29). PIX é cancelado no gateway ao trocar para cartão. Cada método tem contador independente próprio com limite de 3: `pix_attempts` para regenerações de PIX, `payment_attempts` para tentativas de cartão. |
| Fechamento do dialog PIX | **Confirmação + rota de redirecionamento** | Ao fechar o dialog, exibir confirmação "Tem certeza? Seu pedido foi criado" e redirecionar para `/conta` em vez de voltar ao checkout (P26) |

---

## Requisitos

### REQ-C01: Corrigir fluxo de cartão salvo na retentativa

**Problemas resolvidos:** P01, P18, P14

**Cenário: Usuário retenta pagamento com cartão salvo**
- DADO que o usuário possui cartões salvos
- E selecionou um cartão salvo para pagar
- E clicou em "Finalizar pedido"
- QUANDO a requisição chega à edge function
- ENTÃO `CreditCardForm` deve enviar o `id` da `saved_payment_methods` como `creditCardToken`
- E `retry-payment-asaas` deve fazer lookup para obter o `asaas_credit_card_token` real
- E o pagamento deve ser processado com o token correto do Asaas

**Cenário: Retentativa em `/conta` com cartão salvo**
- DADO que o usuário acessa `/conta`
- E possui um pedido com cartão recusado
- E clica em "Tentar novamente" com cartão salvo
- ENTÃO `handleRetryCard` deve incluir `creditCardToken` no body da requisição
- E o `creditCardToken` deve ser o `asaas_credit_card_token` do método salvo

### REQ-C02: Adicionar refresh de PIX no dialog do checkout

**Problemas resolvidos:** P02

**Cenário: PIX expira durante exibição do dialog**
- DADO que o usuário está vendo o QR Code PIX no `PixPaymentDialog`
- E o PIX expira
- ENTÃO o dialog deve exibir mensagem "PIX expirado"
- E o botão "Gerar novo QR Code" deve estar disponível
- E ao clicar, deve chamar `refresh-pix` e exibir o novo QR

### REQ-C03: Eliminar dupla subtração de estoque

**Problemas resolvidos:** P03

**Cenário: Pagamento confirmado via polling + webhook**
- DADO que um pagamento foi aprovado
- E o `verify-payment` (polling) detectou a aprovação
- E o `asaas-webhook` também processou o mesmo evento
- ENTÃO a subtração de estoque deve ocorrer **apenas uma vez**
- E `verify-payment` NÃO deve chamar `subtract-stock`
- E o webhook deve ser a única fonte de subtração de estoque

### REQ-C04: Idempotência atômica de webhook

**Problemas resolvidos:** P04, P10

**Cenário: Webhook simultâneo**
- DADO que dois webhooks com o mesmo `event_id` chegam simultaneamente
- QUANDO ambos tentam processar
- ENTÃO o primeiro deve processar com sucesso
- E o segundo deve detectar duplicata via `ON CONFLICT DO NOTHING`
- E o segundo deve retornar 200 sem processar

**Cenário: Crash pós-processamento**
- DADO que o webhook processou as ações de pós-pagamento
- E crashou antes de registrar o evento em `webhook_events`
- QUANDO o webhook é reenviado
- ENTÃO deve processar novamente (não há registro de idempotência ainda)
- E o pós-pagamento deve ser idempotente (ex: subtração de estoque com verificação)

### REQ-C05: Remover fallback inseguro de tokenização

**Problemas resolvidos:** P05

**Cenário: Tokenização Asaas indisponível**
- DADO que a tokenização via API Asaas falhou
- QUANDO `create-payment-asaas` tenta processar o pagamento
- ENTÃO NÃO deve enviar dados brutos do cartão para a API
- E deve retornar erro claro: "Pagamento temporariamente indisponível. Tente novamente mais tarde."
- E o pedido deve permanecer `aguardando_pagamento` para retentativa

### REQ-C06: Validar campos de cartão com Zod no backend

**Problemas resolvidos:** P09

**Cenário: Validação de campos do cartão**
- DADO que o frontend enviou dados de cartão inválidos
- QUANDO `create-payment-asaas` recebe a requisição
- ENTÃO deve validar o schema com Zod antes de chamar API Asaas
- E deve retornar erro específico em português para cada campo inválido:
  - `cardNumber`: "Número do cartão inválido"
  - `holderName`: "Nome do titular inválido (mín. 3 caracteres)"
  - `expiryMonth/expiryYear`: "Data de validade inválida"
  - `ccv`: "CVV inválido"

### REQ-C07: Ajustar cálculo de parcelamento

**Problemas resolvidos:** P08

**Cenário: Parcelamento com diferença de centavos**
- DADO que o valor total é R$ 100,00
- E o parcelamento é em 3x
- QUANDO `create-payment-asaas` calcula as parcelas
- ENTÃO `installmentValue` deve ser `Math.floor(total * 100 / installmentCount) / 100`
- E a última parcela deve absorver a diferença: `lastInstallment = total - installmentValue * (installmentCount - 1)`
- E a soma das parcelas deve ser exatamente igual ao total

### REQ-C08: Garantir tokenização na retentativa

**Problemas resolvidos:** P11

**Cenário: Retentativa com salvamento de cartão**
- DADO que o usuário está retentando pagamento em `/conta`
- E marcou "Salvar cartão para compras futuras"
- QUANDO `retry-payment-asaas` processa o pagamento com sucesso
- ENTÃO deve tokenizar o cartão via `POST /v3/creditCard/tokenizeCreditCard`
- E salvar o token em `saved_payment_methods`
- (mesmo comportamento do `create-payment-asaas`)

### REQ-C09: Corrigir `totalAmount` na retentativa em `/conta`

**Problemas resolvidos:** P13, P14

**Cenário: Diálogo de retentativa com parcelamento correto**
- DADO que o usuário clica em "Tentar novamente" em `/conta`
- QUANDO o `CreditCardForm` é exibido
- ENTÃO o `totalAmount` deve ser o valor real do pedido (`order.total_amount`)
- E as opções de parcelamento devem refletir o valor correto

### REQ-C10: Alternar de cartão recusado para PIX

**Problemas resolvidos:** P15

**Cenário: Cartão recusado sem PIX gerado — exibir "Pagar com PIX"**
- DADO que o usuário tentou cartão e foi recusado
- E está em `/conta` com o pedido pendente (sem PIX gerado, `qr_code` nulo)
- E `pix_attempts < 3` (ainda não excedeu o limite de regenerações de PIX)
- QUANDO a seção de pedidos pendentes é renderizada
- ENTÃO deve exibir o botão **"💳 Pagar com PIX"** junto com "Tentar novamente" (se `attempts < 3`)
- E ao clicar em "Pagar com PIX", DEVE:
  1. Chamar `create-abacatepay-pix` (com fallback automático para Asaas se falhar), que incrementa `pix_attempts`
  2. Exibir o `PixPaymentDialog` com o QR Code gerado
  3. O pedido permanece `aguardando_pagamento`

**Cenário: Cartão recusado E PIX já gerado — exibir ambas as opções**
- DADO que o usuário tentou cartão (recusado)
- E depois gerou um PIX para o mesmo pedido
- QUANDO acessa `/conta`
- ENTÃO deve ver AMBAS as opções:
  - "Tentar novamente com cartão" (se `attempts < 3`)
  - "Ver QR Code PIX"

**Cenário: Gerar PIX a partir de `/conta` não cria cobrança duplicada**
- DADO que o pedido já teve cartão recusado
- E `payment_attempts > 0`
- QUANDO `create-abacatepay-pix` ou `create-asaas-pix` é chamado para este pedido
- ENTÃO a edge function deve processar normalmente (PIX é compatível com pedidos que tiveram cartão recusado)
- E o contador `payment_attempts` NÃO deve ser alterado (é exclusivo para cartão)

### REQ-C11: Preencher `creditCardHolderInfo` para cartão salvo

**Problemas resolvidos:** P16

**Cenário: Pagamento com cartão salvo**
- DADO que o usuário selecionou um cartão salvo
- QUANDO `buildFormData()` é chamado
- ENTÃO `creditCardHolderInfo` deve ser populado com os dados do cartão salvo (se disponíveis)
- OU a edge function deve tratar campos vazios como não obrigatórios quando `creditCardToken` está presente

### REQ-C12: Validar CPF com dígitos verificadores

**Problemas resolvidos:** P07

**Cenário: CPF inválido**
- DADO que o usuário preencheu um CPF com dígitos verificadores inválidos
- QUANDO o formulário valida o CPF
- ENTÃO deve rejeitar CPFs como `000.000.000-00`, `111.111.111-11`
- E deve validar os dígitos verificadores conforme algoritmo oficial

### REQ-C13: Implementar tokenização de cartão em "Minha Conta → Pagamento"

**Problemas resolvidos:** P25

**Cenário: Adicionar cartão pela tela de métodos de pagamento**
- DADO que o usuário acessa "Minha Conta → Pagamento"
- E clica em "Adicionar cartão"
- QUANDO o modal de novo cartão é exibido
- ENTÃO deve conter formulário completo de cartão (número, titular, validade, CVV, CPF)
- E o frontend deve chamar uma edge function que tokeniza o cartão no Asaas via `POST /v3/creditCard/tokenizeCreditCard`
- E o token retornado deve ser salvo em `saved_payment_methods.asaas_credit_card_token`
- E o cartão deve aparecer na lista com "Visa final 0010"

**Cenário: Tokenização falha**
- DADO que a API Asaas retornou erro durante tokenização
- QUANDO o usuário tenta adicionar o cartão
- ENTÃO deve exibir mensagem de erro específica
- E o cartão NÃO deve ser salvo no banco

### REQ-C14: Impedir fechamento livre do modal PIX

**Problemas resolvidos:** P26

**Cenário: Usuário tenta fechar modal PIX**
- DADO que o usuário gerou um PIX e está vendo o QR Code
- QUANDO tenta fechar o modal (clique fora, ESC, X)
- ENTÃO deve exibir diálogo de confirmação: "Seu pedido foi criado e está aguardando pagamento. Deseja acompanhá-lo em /conta?"
- E se confirmar: fechar modal e **redirecionar para `/conta`** (não voltar ao checkout)
- E se cancelar: permanecer no modal

**Cenário: Refresh da página após fechar modal**
- DADO que o usuário fechou o modal sem finalizar o PIX
- QUANDO a página de checkout é recarregada
- ENTÃO o pedido anterior deve ser exibido como pendente em `/conta`
- E o checkout não deve criar um novo pedido sem antes exibir warning

### REQ-C15: Impedir cobranças duplicadas (PIX e cartão)

**Problemas resolvidos:** P27, P28, P29, P30

**Cenário: Tentativa de gerar segunda cobrança para o mesmo pedido**
- DADO que um pedido já possui uma cobrança ativa (`asaas_payment_id` preenchido ou PIX gerado)
- QUANDO `create-payment-asaas`, `retry-payment-asaas`, `create-abacatepay-pix` ou `create-asaas-pix` recebem uma requisição
- ENTÃO a edge function DEVE verificar se o pedido já possui `asaas_payment_id` OU `payment_id` preenchido
- E se já existir uma cobrança ativa, DEVE:
  - Se PIX: retornar o QR Code existente em vez de criar outro
  - Se cartão: retornar erro "Este pedido já possui uma cobrança em processamento. NÃO é possível gerar uma nova."
  - Em ambos: NÃO criar uma segunda cobrança no gateway

**Cenário: Mudança de método de pagamento após gerar PIX**
- DADO que o usuário gerou um PIX
- E fechou o modal
- QUANDO tenta selecionar "Cartão de Crédito" no checkout
- ENTÃO o sistema deve detectar que já existe um PIX ativo
- E deve exibir: "Este pedido já possui um PIX gerado. Deseja cancelá-lo e pagar com cartão?"
- E se confirmar: o PIX deve ser **cancelado no gateway** (via API Asaas) — o contador `pix_attempts` NÃO é alterado, apenas o PIX é invalidado
- E então o formulário de cartão deve ser exibido para uma nova tentativa
- E se o cartão for recusado: `payment_attempts` é incrementado e o usuário volta para `/conta` onde pode gerar um **novo PIX** (limitado a 3 regenerações via `pix_attempts`)
- E se o cartão for aprovado: o pedido muda para `em_preparo`

**Cenário: Duplo clique em "Finalizar pedido" com cartão**
- DADO que o usuário clicou em "Finalizar pedido" com cartão
- E `finalizing = true` (botão desabilitado) ainda não foi refletido no estado
- QUANDO duas requisições `create-payment-asaas` chegam quase simultaneamente
- ENTÃO a edge function deve verificar se `payment_attempts` já foi incrementado e se o pedido ainda está `aguardando_pagamento`
- E a segunda requisição deve retornar erro "Pagamento já está sendo processado"

**Cenário: Retentativa de cartão após pedido já aprovado**
- DADO que um pedido foi pago com sucesso (status `em_preparo`)
- QUANDO o usuário tenta retentar o cartão via `retry-payment-asaas`
- ENTÃO a edge function deve verificar o status atual do pedido
- E retornar erro "Este pedido já foi pago" se o status não for `aguardando_pagamento`

**Cenário: Looping infinito entre métodos de pagamento**
- DADO que o usuário está alternando entre PIX e cartão para o mesmo pedido
- QUANDO qualquer edge function de cobrança recebe uma requisição
- ENTÃO as seguintes travas se aplicam:
  1. **PIX é cancelado ao trocar para cartão** — o PIX anterior é invalidado no gateway via API Asaas. O contador `payment_attempts` só é incrementado se o cartão for efetivamente processado e recusado
  2. **Regeneração de PIX é limitada a 3x** — novo contador `pix_attempts` (coluna na tabela `orders`) controla quantas vezes o PIX foi gerado/regenerado para este pedido. Ao atingir 3, o botão "Gerar novo PIX" desaparece
  3. **Tentativas de cartão são limitadas a 3x** — `payment_attempts >= 3` bloqueia novas tentativas de cartão
  4. **Os contadores são independentes** — `pix_attempts` conta regenerações de PIX; `payment_attempts` conta tentativas de cartão. Cada um tem limite de 3
  5. **Após 3 tentativas de cartão E 3 regenerações de PIX**, o pedido só pode ser cancelado manualmente ou aguardar auto-cancelamento de 24h
- E NÃO deve ser possível para o usuário gerar mais de **3 cobranças PIX** nem **3 cobranças de cartão** por pedido (total máximo de 6 tentativas de pagamento combinadas)

### REQ-C16: Incluir `asaas_credit_card_token` na interface SavedMethod

**Problemas resolvidos:** P27

**Cenário: Carregamento de cartões salvos**
- DADO que o usuário possui cartões salvos com token Asaas
- QUANDO `CheckoutEntrega.tsx` carrega `savedCards`
- ENTÃO a interface `SavedMethod` deve incluir `asaas_credit_card_token: string | null`
- E o `CreditCardForm` deve usar este campo como `creditCardToken` quando `mode === 'saved'`

### REQ-C17: Polling seguro com dialog fechado

**Problemas resolvidos:** P12

**Cenário: Dialog fechado durante polling**
- DADO que o usuário fechou o `PixPaymentDialog`
- E havia uma requisição de polling em voo
- QUANDO a resposta chega
- ENTÃO `checkPaymentStatus` deve verificar se `open` ainda é true
- E se não for, deve abortar sem navegar nem exibir toasts

---

## Cronograma Sugerido

| Prioridade | Correções | Esforço Estimado |
|:----------:|-----------|:----------------:|
| 🥇 **Fase 1** (🔥 Críticos) | P01, P02, P03, P04, P05, **P25, P26, P29** | 8-11 dias |
| 🥈 **Fase 2** (🟡 Altos) | P06, P07, P08, P09, P10, P11, P12, **P27, P28, P30** | 5-7 dias |
| 🥉 **Fase 3** (🟢 Médios) | P13, P14, P15, P16, P17, P18, P19, P20, P21, P22, P23 | 3-5 dias |

> **Total estimado:** 16-23 dias para correção completa de todos os **29 problemas**.

---

## Glossário

| Termo | Definição |
|-------|-----------|
| **Token Asaas** | Token reutilizável do Asaas (`asaas_credit_card_token`) vinculado ao customer, usado para pagamentos recorrentes sem redigitar dados do cartão |
| **Idempotência atômica** | Garantia de que uma operação é processada exatamente uma vez mesmo sob concorrência, usando `INSERT ... ON CONFLICT DO NOTHING` |
| **Subtraction de estoque** | Operação que reduz o estoque de produtos após confirmação de pagamento |
| **Polling** | Mecanismo de consulta periódica ao status do pagamento (5s por até 15 min) |
| **PCI-DSS** | Padrão de segurança para dados de cartão de pagamento. Dados brutos de cartão NUNCA devem trafegar sem tokenização |
| **Lookup de token** | Tradução do UUID da tabela `saved_payment_methods` para o token Asaas real através de consulta SQL |
| **Pedido órfão** | Pedido criado no banco com status `aguardando_pagamento` e PIX gerado no gateway, mas abandonado pelo usuário sem conclusão do pagamento |
| **Lock de pedido** | Mecanismo que impede a criação de múltiplos pagamentos para o mesmo pedido, seja verificando a existência de PIX ativo ou bloqueando alteração de método de pagamento |
