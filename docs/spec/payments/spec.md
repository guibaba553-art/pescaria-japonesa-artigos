# Spec: Integração de Pagamentos — AbacatePay + Asaas

> **Visão:** Negocial
> **Público:** Product owners, stakeholders, equipe de negócio
> **Versão:** 2.2

---

## Propósito

Unificar **AbacatePay** (gateway primário de PIX) e **Asaas** (gateway de cartão de crédito com checkout transparente e fallback PIX) em um único fluxo de pagamento no checkout. O cliente deve conseguir pagar com PIX via AbacatePay (principal) e, em caso de falha deste, com PIX via Asaas (fallback automático). Pagamentos com cartão de crédito são processados exclusivamente pelo Asaas com checkout transparente (formulário inline, sem redirecionamento), com opção de salvar cartão tokenizado para compras futuras.

---

## Decisões de Negócio

| Decisão | Escolha | Justificativa |
|---------|---------|---------------|
| PIX primário | AbacatePay (transparente) | Já implementado e funcionando; menor custo operacional |
| Fallback PIX | Asaas (automático) | Garantir disponibilidade mesmo se AbacatePay falhar |
| Cartão de crédito | Asaas checkout transparente | Evitar redirecionamento para página externa; melhor conversão |
| Cartões salvos | Sim, tokenizados no Asaas | Facilitar recompra; tokenização é PCI-compliant |
| Salvamento de cartão | **Opt-in explícito** (checkbox desligado) | LGPD e preferência do usuário |
| Momento do salvamento | **Após pagamento aprovado** | Segurança: nunca armazenar cartão de transação recusada |
| Múltiplos cartões | Sim | Usuário pode cadastrar quantos cartões quiser |
| Mercado Pago / carteiras digitais | Removido | Substituído por Asaas (fluxo único) |
| AbacatePay para cartão | Desativado | Checkout hospedado redireciona; prejudica conversão |
| Pedido recusado | **Não faz rollback** | Mantém pedido como `aguardando_pagamento` para retentativa |
| Pagamento fora do checkout | Possível via `/conta` | Usuário pode finalizar pagamento depois |
| NF-e pós-pagamento | Viável via webhook + banco local | `transparent.completed` dispara o gatilho; CPF completo vem do `profiles` (webhook mascara); `receiptUrl` pode ser anexado |
| Tokenização | **Server-side via API Asaas** | Asaas **não oferece SDK client-side** — tokenização via `POST /v3/creditCard/tokenizeCreditCard` no backend |
| Abordagem PCI-DSS | **SAQ-D** (nível do app) | Dados de cartão trafegam no backend até serem tokenizados pela API Asaas; exige HTTPS obrigatório e certificação SAQ-D |
| Captura de IP (`remoteIp`) | **Obrigatória** | Asaas exige o IP real do comprador no momento da transação (`remoteIp`) para processar cartão — campo indispensável no formulário |
| Limite de parcelas | **10x (definido pelo app)** | Asaas permite até 21x (Visa/Mastercard) / 12x (demais bandeiras); limite de 10x é comercial para controle de risco e inadimplência |
| Auto-cancelamento | Edge function `cancel-expired-orders` (reaproveitada) | Função já implementada e operacional na codebase atual com TTL de 24h; apenas estender com validações específicas do Asaas |
| Autenticação webhook Asaas | `asaas-access-token` (authToken) | Asaas **não usa HMAC** — envia token no header `asaas-access-token`; deve ser validado com string fixa (32-255 caracteres) |
| Idempotência de webhook | **Obrigatória** via event ID (`id`) | Asaas garante *at least once delivery* — eventos podem ser duplicados; deduplicar pelo campo `id` do payload |
| User-Agent | **Obrigatório** em toda chamada API | Desde 06/11/2024, toda request ao Asaas deve conter header `User-Agent` com nome do app |
| Timeout das funções | 60s para cartão, 30s demais | Recomendação oficial: mínimo de 60s em chamadas de cartão para evitar timeout + duplicatas |
| API limits (rate/quota) | 25k req/12h, 50 GETs simultâneos | Polling excessivo consome quota e pode bloquear a API key; webhooks são preferíveis |

---

## Limites de Tempo e Custos

| Parâmetro | Valor | Custa regerar? | Razão de Negócio |
|-----------|-------|:--------------:|-------------------|
| Reserva de estoque | 30 min | N/A | Evitar ocupação indefinida de estoque |
| Validade QR PIX (Asaas) | Até 12 meses (ou mesmo dia s/ chave) | **Não** — `GET /v3/payments/{id}/pixQrCode` re-consulta sem custo | QR é dinâmico; mesmo payment pode ser re-consultado |
| Validade QR PIX (AbacatePay) | 30 min | **Não** — só cobra quando pago | Fallback automático para Asaas |
| Refresh de PIX | Ilimitado, enquanto pedido ativo | **Grátis** — re-consulta mesmo payment | Se expirou no Asaas, cria-se novo payment (raro) |
| Retentativa de cartão | 3 tentativas em 10 min | **Não** — recusado não é persistido pelo Asaas | Limite é anti-fraude, não de custo |
| Auto-cancelamento | 24 h sem pagamento | N/A | Liberar estoque e evitar pedidos fantasmas |
| Polling de confirmação PIX | 5s por até 15 min | **Alerta:** consome API quota (2.5k req/h) | Feedback em tempo real com custo de quota; webhooks são a confirmação definitiva |
| Liquidação Pix (Asaas) | **Instantâneo** (status `RECEIVED`) | N/A | PIX confirma e liquida no mesmo momento |
| Liquidação Cartão (Asaas) | **30 dias** após `CONFIRMED` | N/A | Cartão é confirmado na hora mas o dinheiro só cai 30 dias depois |

> **Impacto financeiro:** Gerar ou re-consultar QR Code PIX não gera custo em nenhum dos gateways. A taxa é cobrada apenas quando a transação é concluída com sucesso. Cartão recusado também não gera custo (payment não é persistido).

> ⚠️ **Atenção — Liquidação de cartão de crédito:** No Asaas, cartão confirmado (`PAYMENT_CONFIRMED`) não significa dinheiro disponível. O repasse ocorre ~30 dias após a confirmação (`PAYMENT_RECEIVED`). PIX liquida instantaneamente. Essa diferença DEVE ser refletida no status do pedido e na comunicação com o usuário.

> 📘 **Plataform fee (AbacatePay):** A resposta do `POST /v2/transparents/create` inclui `platformFee` (taxa em centavos). Esse valor DEVE ser persistido para conciliação financeira — atualmente não está sendo salvo.

---

## Requisitos Técnicos de Integração (AbacatePay)

> Contrato da API AbacatePay v2. Endpoints relevantes para PIX transparente.

| Campo/Regra | Obrigatoriedade | Detalhe |
|-------------|:--------------:|---------|
| `Authorization: Bearer <api-key>` | ✅ | Autenticação em toda chamada; mesmo header para dev e produção (a chave define o ambiente) |
| `Content-Type: application/json` | ✅ | JSON em toda chamada |
| `method` | ✅ | `"PIX"` para QR Code, `"BOLETO"` para boleto |
| `data.amount` | ✅ | Valor em **centavos** (ex: `15000` = R\$ 150,00) |
| `data.externalId` | Recomendado | ID do pedido no seu sistema — garante **idempotência** (mesmo `externalId` = mesma cobrança) |
| `data.expiresIn` | Opcional | Expiração do PIX em **segundos** (default 3600 = 1h). Especificar `1800` para 30 min |
| `data.description` (máx. 500) | Opcional | Descrição visível no comprovante |
| `data.customer` | Opcional p/ PIX | Se informado, TODOS os campos são obrigatórios: `name`, `taxId`, `email` (opc), `cellphone` (opc) |
| `data.metadata` | Opcional | Objeto livre — enviar `orderId` + `userId` para rastreabilidade |
| `data.utm` | Opcional | `source`, `medium`, `campaign`, `term`, `content` — visíveis no dashboard |
| Resposta: `data.brCode` | — | Código copia-e-cola PIX |
| Resposta: `data.brCodeBase64` | — | Imagem QR Code em Base64 (data URI) |
| Resposta: `data.expiresAt` | — | Data/hora de expiração (ISO 8601) |
| Resposta: `data.platformFee` | — | Taxa da plataforma em centavos — **persistir para conciliação** |
| Resposta: `data.id` | — | ID da cobrança (formato `pix_char_...`) — salvar como `payment_id` na order |
| `GET /v2/transparents/check?id=` | Polling | Consulta status da cobrança PIX. Retorna: `PENDING`, `PAID`, `EXPIRED`, `CANCELLED`, `REFUNDED` |
| Webhook — `X-Webhook-Signature` | ✅ | Assinatura HMAC-SHA256 (Base64) usando a **chave pública** da AbacatePay |
| Webhook — `?webhookSecret=` | ✅ | Secret na query string da URL — validar antes de processar |
| Webhook — idempotência | ✅ | Usar `id` (ex: `log_abc123xyz`) para deduplicar eventos. Responder 200 em até 10s |
| Webhook — `taxId` mascarado | ⚠️ | CPF/CNPJ vem como `123.***.***-**` — **não serve para NF-e**. Usar `profiles.cpf` do banco |
| `GET /v2/store/get` | Opcional | Retorna `balance.available`, `balance.pending`, `balance.blocked` — útil para dashboard financeiro |

---

## Requisitos Técnicos de Integração (Asaas)

> Contrato indispensável da API Asaas. Todo endpoint deve respeitar estes campos e regras.

| Campo/Regra | Obrigatoriedade | Detalhe |
|-------------|:--------------:|---------|
| `access_token` header | ✅ | API Key no header; produção `$aact_prod_...`, sandbox `$aact_hmlg_...` |
| `User-Agent` header | ✅ (desde 11/2024) | Ex: `JapasPesca/1.0.0` — obrigatório em toda chamada |
| `customer` (id Asaas) | ✅ | Obrigatório em POST `/v3/payments` — requer customer criado via `POST /v3/customers` |
| `billingType` | ✅ | `PIX`, `CREDIT_CARD`, `BOLETO`, ou `UNDEFINED` |
| `value` | ✅ | Em reais (ex: `150.00`), não centavos. Obrigatório para cobrança única |
| `dueDate` | ✅ | `YYYY-MM-DD`; para cartão a captura é imediata independente da data |
| `remoteIp` | ✅ (cartão) | IP real do comprador, nunca o IP do servidor |
| `creditCard.holderName` | ✅ (cartão) | Nome impresso no cartão |
| `creditCard.number` | ✅ (cartão) | Número completo do cartão |
| `creditCard.expiryMonth` | ✅ (cartão) | 2 dígitos (ex: `"06"`) |
| `creditCard.expiryYear` | ✅ (cartão) | 4 dígitos (ex: `"2026"`) |
| `creditCard.ccv` | ✅ (cartão) | Código de segurança |
| `creditCardHolderInfo.name` | ✅ (cartão) | Nome do titular conforme cadastro na operadora |
| `creditCardHolderInfo.email` | ✅ (cartão) | Email do titular |
| `creditCardHolderInfo.cpfCnpj` | ✅ (cartão) | CPF/CNPJ do titular |
| `creditCardHolderInfo.postalCode` | ✅ (cartão) | CEP do titular (ex: `"89223005"`) |
| `creditCardHolderInfo.addressNumber` | ✅ (cartão) | Número do endereço |
| `creditCardHolderInfo.phone` | ✅ (cartão) | Telefone fixo com DDD |
| `creditCardHolderInfo.mobilePhone` | Opcional | Celular do titular |
| `creditCardToken` | Opcional | Token reutilizável — substitui `creditCard` + `creditCardHolderInfo` |
| `installmentCount` | Somente parcelado | Número de parcelas (≥2) |
| `installmentValue` | Somente parcelado | Valor de cada parcela. Alternativa: enviar `totalValue` e Asaas calcula parcelas |
| `externalReference` | Recomendado | Campo livre para ID do pedido no seu sistema — facilita conciliação |
| `description` (máx. 500) | Recomendado | Descrição da cobrança; não usar para cartão single-use |
| POST `/v3/creditCard/tokenizeCreditCard` | Tokenização | Endpoint **server-side** que recebe `customer` + `creditCard` + `creditCardHolderInfo` + `remoteIp` e retorna `creditCardToken` + `creditCardBrand` + `creditCardNumber` (últimos 4 dígitos) |
| GET `/v3/payments/{id}/pixQrCode` | QR Code PIX | Retorna `encodedImage` (base64), `payload` (copia-cola), `expirationDate` — GET precisa de **body vazio** (403 se enviar body) |
| GET `/v3/payments/{id}` | Consulta status | Retorna status completo da cobrança |
| GET `/v3/payments?externalReference=` | Busca por referência | Permite localizar cobrança pelo `externalReference` enviado na criação |
| Webhook — `asaas-access-token` | ✅ | Autenticação do webhook: validar header contra `authToken` fixo cadastrado no painel Asaas |
| Webhook — idempotência | ✅ | Eventos podem ser enviados mais de uma vez; deduplicar pelo `id` do evento |
| Rate limit | Monitorar | 25k req/12h por conta; 50 GETs simultâneos; polling pesado pode bloquear API key |

---

## Requisitos

### REQ-001: Pagamento PIX via AbacatePay (primário)

O sistema DEVE processar pagamentos PIX utilizando o gateway AbacatePay como opção primária. A chamada usa `POST /v2/transparents/create` com `method: "PIX"` e `amount` em centavos. O `externalId` (orderId) garante idempotência: chamadas repetidas retornam a mesma cobrança.

> ⚠️ **Campos não enviados atualmente:** `expiresIn` (default 3600s, ideal 1800s = 30min), `platformFee` (não está sendo salvo no banco), `receiptUrl` (comprovante não persistido).
>
> ⚠️ **Bug conhecido:** `verify-payment` (edge function de polling) só consulta MercadoPago. Para PIX AbacatePay, o polling deveria usar `GET /v2/transparents/check?id={payment_id}`. Atualmente a confirmação em tempo real depende **exclusivamente do webhook**.
>
> ⚠️ **Bug conhecido:** A verificação HMAC no `abacatepay-webhook` tem um erro: `crypto.subtle.sign()` é chamado sem `await`, retornando uma `Promise` não resolvida em vez do `ArrayBuffer`. A validação de assinatura falha em todos os casos.

#### Cenário: PIX AbacatePay bem-sucedido
- DADO que o usuário selecionou "PIX" como método de pagamento
- E clicou em "Finalizar pedido"
- E o gateway AbacatePay retornou sucesso (`POST /v2/transparents/create`)
- ENTÃO o sistema deve exibir o QR Code PIX (`brCode` + `brCodeBase64`)
- E o pedido deve ficar com status `aguardando_pagamento`
- E o campo `expiresAt` deve ser salvo em `orders.pix_expiration`
- E o campo `platformFee` deve ser salvo para conciliação
- E o QR Code deve ficar acessível na página `/conta`

#### Cenário: PIX AbacatePay com falha de gateway
- DADO que o usuário selecionou "PIX"
- E clicou em "Finalizar pedido"
- E o gateway AbacatePay retornou erro (HTTP ≠ 200 ou `success: false`)
- ENTÃO o sistema DEVE tentar automaticamente o fallback Asaas PIX
- E o usuário NÃO DEVE perceber a troca de gateway

### REQ-002: Fallback PIX via Asaas

O sistema DEVE processar pagamentos PIX via Asaas quando o AbacatePay estiver indisponível.

#### Cenário: Fallback ativado com sucesso
- DADO que o AbacatePay falhou
- E o Asaas retornou sucesso
- ENTÃO o QR Code PIX do Asaas deve ser exibido
- E o pedido continua `aguardando_pagamento`
- E o QR Code fica acessível em `/conta`

#### Cenário: Fallback também falha
- DADO que ambos os gateways falharam
- ENTÃO o sistema DEVE fazer rollback do pedido
- E exibir mensagem: "PIX temporariamente indisponível"

### REQ-003: Pagamento Cartão de Crédito via Asaas

O sistema DEVE processar pagamentos com cartão de crédito através do checkout transparente Asaas, sem redirecionar o usuário para página externa. Os dados do cartão (`creditCard` + `creditCardHolderInfo`) e o `remoteIp` do comprador DEVEM ser enviados diretamente na edge function que chama `POST /v3/payments`. A tokenização ocorre apenas após pagamento aprovado, via endpoint `POST /v3/creditCard/tokenizeCreditCard`. As requisições DEVEM ter timeout mínimo de 60 segundos conforme recomendação oficial.

> ⚠️ **Atenção:** O status `CONFIRMED` no Asaas para cartão **não** significa dinheiro em conta. O repasse do cartão de crédito ocorre em ~30 dias (status `RECEIVED`). Apenas PIX liquida instantaneamente.

#### Cenário: Cartão aprovado na primeira compra
- DADO que o usuário selecionou "Cartão de Crédito"
- E preencheu os dados do cartão no formulário inline
- E clicou em "Finalizar pedido"
- E o Asaas aprovou a transação (status `CONFIRMED`)
- ENTÃO o pedido DEVE ser atualizado para `em_preparo`
- E o usuário DEVE ser redirecionado para `/conta` com toast de sucesso

#### Cenário: Cartão recusado na primeira compra
- DADO que o usuário preencheu os dados do cartão
- E o Asaas recusou a transação (HTTP 400 ou evento `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED`)
- ENTÃO o pedido NÃO DEVE ser deletado
- E o contador `payment_attempts` DEVE ser incrementado
- E o usuário DEVE ver a mensagem "Cartão recusado"
- E DEVE poder tentar novamente em `/conta`

#### Cenário: Cartão recusado após 3 tentativas
- DADO que o usuário já tem 3 tentativas de cartão recusadas
- ENTÃO o sistema DEVE exibir apenas a opção "Pagar com PIX"
- E NÃO DEVE permitir nova tentativa com cartão

### REQ-004: Cartões Salvos

O sistema DEVE permitir que o usuário salve cartões tokenizados para compras futuras.

#### Cenário: Salvar cartão após compra aprovada
- DADO que o usuário marcou "Salvar cartão para compras futuras"
- E o pagamento foi aprovado
- ENTÃO o sistema DEVE armazenar o token reutilizável do Asaas
- E o cartão DEVE aparecer na lista de cartões salvos nas próximas compras

#### Cenário: Não salvar cartão
- DADO que o usuário NÃO marcou "Salvar cartão para compras futuras"
- E o pagamento foi aprovado
- ENTÃO o sistema NÃO DEVE armazenar nenhum dado do cartão

#### Cenário: Usar cartão salvo em nova compra
- DADO que o usuário possui cartões salvos
- E selecionou um cartão existente
- E clicou em "Finalizar pedido"
- ENTÃO o sistema DEVE processar o pagamento com o token reutilizável
- E NÃO DEVE solicitar CVV novamente

### REQ-005: Parcelamento

O sistema DEVE oferecer parcelamento em até 10x sem juros para pagamentos com cartão de crédito. O limite de 10x é definido pelo aplicativo — o Asaas suporta até 21x para Visa/Mastercard e 12x para demais bandeiras.

#### Cenário: Parcelamento disponível
- DADO que o valor total é de R$ 150,00
- ENTÃO as opções de 1x a 10x DEVEM estar disponíveis
- E o valor da parcela DEVE ser R$ 150,00 / número de parcelas

#### Cenário: Parcelamento com valor mínimo
- DADO que o valor total é de R$ 7,00
- ENTÃO o máximo de parcelas DEVE ser 1 (valor mínimo de R$ 5 por parcela)

> **Nota técnica:** O Asaas processa parcelamento através dos campos `installmentCount` + `installmentValue` (ou `totalValue`) no POST `/v3/payments`. O app define o máximo de 10x como limite comercial; o gateway não impõe esse teto.

### REQ-006: Persistência e Retentativa em `/conta`

O sistema DEVE permitir que o usuário finalize o pagamento de um pedido pendente a partir da página `/conta`.

#### Cenário: Visualizar PIX pendente
- DADO que o usuário gerou um PIX mas fechou o dialog
- E acessa a página `/conta`
- ENTÃO o pedido DEVE aparecer na seção "Pedidos Pendentes"
- E o botão "Ver QR Code PIX" DEVE exibir o QR novamente

#### Cenário: PIX expirado
- DADO que o QR Code PIX expirou
- ENTÃO o sistema DEVE exibir "PIX expirado"
- E o botão "Gerar novo PIX" DEVE criar um novo QR Code
- E NÃO DEVE recriar o pedido

#### Cenário: Retentar cartão recusado
- DADO que o cartão foi recusado
- E o usuário acessa `/conta`
- ENTÃO o sistema DEVE exibir o pedido com "Cartão recusado — X tentativa(s)"
- E DEVE oferecer as opções "Tentar novamente" e "Pagar com PIX"
- E "Tentar novamente" DEVE abrir o formulário de cartão para novo cartão

### REQ-007: Auto-cancelamento

O sistema DEVE cancelar automaticamente pedidos não pagos após 24 horas.

#### Cenário: Cancelamento por tempo
- DADO que um pedido está `aguardando_pagamento` há mais de 24h
- ENTÃO o sistema DEVE atualizar o status para `cancelado`
- E o estoque DEVE ser liberado

### REQ-008: Webhooks de Confirmação

O sistema DEVE processar notificações de pagamento dos gateways para atualizar status automaticamente.

> ⚠️ **Autenticação:** O webhook do AbacatePay usa HMAC-SHA256 (`x-signature`). O webhook do Asaas usa `asaas-access-token` (authToken).

> ⚠️ **Idempotência:** Asaas garante *at least once delivery*. O sistema DEVE deduplicar eventos pelo campo `id` do payload. Responder HTTP 200 em até 10s para evitar pausa da fila.

#### Cenário: Confirmação de PIX AbacatePay
- DADO que o AbacatePay enviou webhook `transparent.completed`
- E a assinatura HMAC (`X-Webhook-Signature`) foi validada com sucesso
- E o `webhookSecret` na query string confere
- ENTÃO o pedido DEVE ser atualizado para `em_preparo`
- E o `payment_id` DEVE ser atualizado com o ID da transação
- E o `receiptUrl` (comprovante) DEVE ser salvo

#### Cenário: Reembolso PIX AbacatePay
- DADO que o AbacatePay enviou webhook `transparent.refunded`
- ENTÃO o pedido DEVE ser atualizado para `cancelado`
- E o estoque DEVE ser restaurado

#### Cenário: Disputa PIX AbacatePay
- DADO que o AbacatePay enviou webhook `transparent.disputed`
- ENTÃO o pedido DEVE ser atualizado para `devolucao_solicitada`

#### Cenário: Polling de status PIX AbacatePay
- DADO que o usuário está vendo o QR Code PIX
- E o sistema está fazendo polling via `GET /v2/transparents/check?id={payment_id}`
- ENTÃO o status `PAID` DEVE acionar a confirmação do pedido
- E os status `PENDING`, `EXPIRED` DEVEM ser refletidos na UI

> ⚠️ **Correção necessária:** A edge function `verify-payment` atualmente só consulta MercadoPago. Precisa ser estendida para suportar AbacatePay via `GET /v2/transparents/check`.

#### Cenário: Confirmação de pagamento Asaas (PIX)
- DADO que o Asaas enviou webhook `PAYMENT_RECEIVED`
- E o `billingType` é `PIX`
- ENTÃO o pedido DEVE ser atualizado para `em_preparo`
- E as ações pós-pagamento DEVEM ser executadas (estoque, NF-e, etiqueta, e-mail)

#### Cenário: Confirmação de pagamento Asaas (Cartão)
- DADO que o Asaas enviou webhook `PAYMENT_CONFIRMED`
- E o `billingType` é `CREDIT_CARD`
- ENTÃO o pedido DEVE ser atualizado para `em_preparo`
- E as ações pós-pagamento DEVEM ser executadas
- E o sistema DEVE aguardar `PAYMENT_RECEIVED` (~30 dias) para considerar o valor efetivamente liquidado

#### Cenário: Cartão recusado via webhook
- DADO que o Asaas enviou webhook `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED`
- ENTÃO o sistema DEVE incrementar `payment_attempts`
- E NOTIFICAR o usuário sobre a recusa

#### Cenário: Estorno de pagamento
- DADO que o Asaas enviou webhook `PAYMENT_REFUNDED`
- ENTÃO o pedido DEVE ser atualizado para `cancelado`
- E o estoque DEVE ser restaurado

#### Eventos Asaas relevantes e esperados

| Evento | Significado | Ação no sistema |
|--------|------------|-----------------|
| `PAYMENT_CREATED` | Cobrança criada | Log; pedido permanece `aguardando_pagamento` |
| `PAYMENT_CONFIRMED` | Pagamento confirmado (cartão: autorizado na operadora) | Atualizar para `em_preparo`; disparar pós-pagamento |
| `PAYMENT_RECEIVED` | Dinheiro efetivamente creditado (PIX: imediato; cartão: ~30 dias) | Atualizar `payment_received_at`; conciliação financeira |
| `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED` | Cartão recusado na captura | Incrementar `payment_attempts`; notificar usuário |
| `PAYMENT_OVERDUE` | Cobrança vencida sem pagamento | Log; PIX expirado no caso de QR Code sem chave |
| `PAYMENT_REFUNDED` | Estorno concluído | Atualizar para `cancelado`; liberar estoque |
| `PAYMENT_DELETED` | Cobrança removida | Se pedido ativo, reavaliar; se cancelado, ignorar |
| `PAYMENT_AUTHORIZED` | Pré-autorização de cartão aprovada | Não utilizado (não usamos `authorizeOnly`) |
| `PAYMENT_AWAITING_RISK_ANALYSIS` | Pagamento em análise de risco | Log; aguardar outcome (`APPROVED`/`REPROVED`) |
| `PAYMENT_APPROVED_BY_RISK_ANALYSIS` | Aprovado na análise manual | Tratar como `CONFIRMED` |
| `PAYMENT_REPROVED_BY_RISK_ANALYSIS` | Reprovado na análise manual | Incrementar `payment_attempts`; notificar usuário |

> 📘 **Fluxo PIX no Asaas:** `PAYMENT_CREATED` → `PAYMENT_RECEIVED` (sem `CONFIRMED` intermediário).

> 📘 **Fluxo Cartão no Asaas:** `PAYMENT_CREATED` → `PAYMENT_CONFIRMED` → `PAYMENT_RECEIVED` (30 dias depois). Se houver atraso no pagamento: `PAYMENT_OVERDUE` entre `CREATED` e os demais. Se houver chargeback: fluxo específico de disputa.

---

## Bugs Conhecidos na Codebase Atual

> Descobertos durante a auditoria da integração existente. Devem ser corrigidos **antes** ou **durante** a implementação do Asaas.

| ID | Bug | Severidade | Arquivo | Correção |
|----|-----|:----------:|---------|----------|
| **BUG-001** | **HMAC não funciona**: `crypto.subtle.sign("HMAC", ...)` chamado sem `await` — retorna `Promise` não resolvida em vez de `ArrayBuffer`. Assinatura sempre falha. | 🔴 Crítica | `supabase/functions/abacatepay-webhook/index.ts:19` | Adicionar `await` na linha 19 |
| **BUG-002** | **`verify-payment` só consulta MercadoPago**: polling de PIX AbacatePay não funciona porque a função chama `api.mercadopago.com/v1/payments/{id}` com o ID da cobrança AbacatePay. | 🔴 Crítica | `supabase/functions/verify-payment/index.ts:108` | Adicionar branch `if (gateway === 'abacatepay')` → `GET /v2/transparents/check?id=` |
| **BUG-003** | **Extração de `externalId` incompleta**: para eventos `transparent.*`, o código tenta `data?.checkout?.externalId || data?.externalId`, mas o payload real tem `data.transparent.externalId`. | 🟡 Alta | `supabase/functions/abacatepay-webhook/index.ts:80` | Adicionar `data?.transparent?.externalId` na cadeia de fallback |
| **BUG-004** | **`platformFee` não salvo**: resposta da AbacatePay inclui `platformFee` (centavos) mas não é persistido na order. | 🟡 Média | `supabase/functions/create-abacatepay-pix/index.ts:125-134` | Adicionar `platform_fee` na migration + salvar no update |
| **BUG-005** | **`receiptUrl` não salvo**: webhook envia `receiptUrl` (comprovante) mas não é persistido. | 🟢 Baixa | `supabase/functions/abacatepay-webhook/index.ts:110-112` | Salvar `receipt_url` na order durante `transparent.completed` |
| **BUG-006** | **`expiresIn` não configurado**: AbacatePay usa default 3600s (1h). Spec define 30 min (1800s). | 🟢 Baixa | `supabase/functions/create-abacatepay-pix/index.ts:87-99` | Adicionar `expiresIn: 1800` no body |
| **BUG-007** | **Sem idempotência no webhook**: eventos duplicados do AbacatePay processam a mesma confirmação múltiplas vezes. | 🟡 Média | `supabase/functions/abacatepay-webhook/index.ts:68` | Armazenar `payload.id` e checar antes de processar |

---

## Glossário

| Termo | Definição |
|-------|-----------|
| **Checkout transparente** | Formulário de pagamento exibido inline no site, sem redirecionar o usuário para página externa |
| **Tokenização** | Processo de substituir dados sensíveis do cartão por um token seguro. Será implementada **server-side** (via API Asaas `POST /v3/creditCard/tokenizeCreditCard`), não via SDK client-side — o Asaas não oferece essa opção |
| **Token single-use** | Token de cartão válido para uma única transação |
| **Token reutilizável** | Token de cartão armazenado no Asaas, vinculado ao customer, válido para múltiplas transações |
| **Gateway** | Serviço terceiro que processa transações financeiras |
| **Fallback** | Mecanismo automático de contingência quando o serviço primário falha |
| **Customer Asaas** | Entidade no Asaas que representa o cliente final, vinculada a CPF/CNPJ |
| **Opt-in** | Ação explícita do usuário para consentir com algo (checkbox desmarcado por padrão) |
| **SAQ-D** | Nível de autovalidação PCI-DSS exigido quando dados de cartão trafegam pelo backend do app — aplica-se a esta integração pois a tokenização é server-side |
| **remoteIp** | Campo obrigatório na API Asaas contendo o IP real do comprador no momento da transação; indispensável para autorização e antifraude |
| **authToken** | Token de autenticação do webhook Asaas (32-255 caracteres), enviado no header `asaas-access-token` — diferente de HMAC, é uma string fixa validada por comparação |
| **encodedImage** | Imagem do QR Code PIX em Base64 retornada pelo Asaas via `GET /v3/payments/{id}/pixQrCode` |
| **payload (PIX)** | Código copia-cola PIX retornado pelo Asaas |
| **externalReference** | Campo livre do Asaas para referenciar o ID do pedido no sistema; permite busca por `GET /v3/payments?externalReference=` |
| **PAYMENT_CONFIRMED vs PAYMENT_RECEIVED** | `CONFIRMED` = pagamento autorizado (cartão) ou bloqueio cautelar (PIX PF). `RECEIVED` = dinheiro efetivamente creditado. PIX: imediato. Cartão: ~30 dias |
| **Idempotência de webhook** | Capacidade de processar o mesmo evento múltiplas vezes sem efeitos colaterais; implementada deduplicando pelo `id` do evento |
| **externalId (AbacatePay)** | Campo opcional no `POST /v2/transparents/create` que garante idempotência: chamadas com o mesmo `externalId` retornam a mesma cobrança em vez de criar duplicatas |
| **platformFee** | Taxa da plataforma em centavos, retornada na resposta da criação de cobrança — deve ser persistida para conciliação financeira |
| **receiptUrl** | URL do comprovante de pagamento, disponível após confirmação — pode ser exibida ao usuário ou vinculada à NF-e |
| **PayerInformation** | Objeto no payload do webhook `transparent.completed` contendo dados do pagador real (pode diferir do `customer`). Contém `name`, `taxId` (mascarado), `method`. Para cartão inclui `number` (últimos 4 dígitos) e `brand` |
| **NF-e via AbacatePay** | Viável: o webhook `transparent.completed` dispara o gatilho de pagamento. Dados do pagador vêm do `profiles` (CPF completo — o webhook mascara). Valores vêm da `order`. `receiptUrl` pode ser anexado à NF-e |
