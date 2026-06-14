# Tasks: Correções do Fluxo de Pagamento

> **Baseado no design:** `docs/design/payments/correcoes-fluxo-pagamento-design.md`
> **Total:** 31 tasks | **Estimativa:** 9-14 dias
> **Ordem:** Executar sequencialmente conforme numerado

---

## Setup — Pré-requisitos

> Estima: < 1h — pode ser executado em paralelo

### S1: Migration `pix_attempts`

- **Arquivo:** `supabase/migrations/<timestamp>_add_pix_attempts.sql`
- **Problemas:** P30
- **Descrição:** Criar migration adicionando coluna `pix_attempts integer DEFAULT 0` na tabela `orders` e índice para busca de pedidos PIX pendentes.
- **SQL:**
  ```sql
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS pix_attempts integer DEFAULT 0;
  CREATE INDEX IF NOT EXISTS idx_orders_pix_attempts ON orders (pix_attempts)
    WHERE status = 'aguardando_pagamento';
  ```

### S2: Centralizar tipos de pagamento

- **Arquivo:** `src/types/payment.ts` (NOVO)
- **Descrição:** Criar tipos centralizados `SavedMethod` (com `asaas_credit_card_token`) e `PaymentOrder`. Unificar as interfaces duplicadas entre `CheckoutEntrega.tsx`, `MyPaymentMethods.tsx`, `CreditCardForm.tsx`.
- **Conteúdo:**
  ```typescript
  export interface SavedMethod {
    id: string;
    payment_method: string;
    card_brand: string | null;
    card_last4: string | null;
    card_exp_month: string | null;
    card_exp_year: string | null;
    cardholder_name: string | null;
    is_default: boolean;
    asaas_credit_card_token: string | null;
    last_used_at: string | null;
  }

  export interface PaymentOrder {
    id: string;
    user_id: string;
    status: string;
    total_amount: number;
    payment_attempts: number;
    pix_attempts: number;
    asaas_payment_id: string | null;
    payment_id: string | null;
    qr_code: string | null;
    qr_code_base64: string | null;
    pix_expiration: string | null;
    payment_gateway: string | null;
  }
  ```

---

## Fase 1 🔥 — Críticos

> Problemas P01-P05, P25-P30 | Estima: 6-8 dias
> ⚠️ Ordem obrigatória: backend (edge functions) → frontend

### T1: Zod validation em `create-payment-asaas`

- **Arquivo:** `supabase/functions/create-payment-asaas/index.ts`
- **Problema:** P09
- **Descrição:** Adicionar schema Zod validando campos de cartão (`holderName`, `number`, `expiryMonth`, `expiryYear`, `ccv`), holder info (`name`, `email`, `cpfCnpj`), `installmentCount` e `saveCard` antes de chamar API Asaas. Retornar erros em português.
- **Schema:**
  ```typescript
  import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';
  
  const creditCardSchema = z.object({
    creditCard: z.object({
      holderName: z.string().min(3, 'Nome do titular inválido (mín. 3 caracteres)'),
      number: z.string().regex(/^\d{13,19}$/, 'Número do cartão inválido'),
      expiryMonth: z.string().regex(/^(0[1-9]|1[0-2])$/, 'Mês de validade inválido'),
      expiryYear: z.string().regex(/^\d{2,4}$/, 'Ano de validade inválido'),
      ccv: z.string().regex(/^\d{3,4}$/, 'CVV inválido'),
    }),
    creditCardHolderInfo: z.object({
      name: z.string().min(3, 'Nome do titular inválido'),
      email: z.string().email('Email inválido'),
      cpfCnpj: z.string().min(11, 'CPF/CNPJ inválido'),
      postalCode: z.string().optional(),
      addressNumber: z.string().optional(),
      phone: z.string().optional(),
    }),
    installmentCount: z.number().int().min(1).max(12),
    saveCard: z.boolean().optional(),
  });
  ```

### T2: Remover fallback inseguro em `create-payment-asaas`

- **Arquivo:** `supabase/functions/create-payment-asaas/index.ts`
- **Problema:** P05
- **Descrição:** Se a tokenização via Asaas falhar (e `saveCard=true`), NÃO enviar dados brutos do cartão. Retornar erro "Pagamento temporariamente indisponível. Tente novamente mais tarde." O pedido permanece `aguardando_pagamento`.
- **Mudança:** Linhas ~187-192 — substituir fallback que envia dados brutos por retorno de erro.

### T3: Ajustar cálculo de parcelamento

- **Arquivo:** `supabase/functions/create-payment-asaas/index.ts` (linha 210)
- **Problema:** P08
- **Descrição:** Substituir `(total / count).toFixed(2)` por `Math.floor(total * 100 / count) / 100`. A última parcela absorve a diferença.
- **Código:**
  ```typescript
  const installmentValue = Math.floor(Number(total_amount) * 100 / Number(installmentCount)) / 100;
  paymentPayload.installmentValue = Number(installmentValue.toFixed(2));
  ```

### T4: Lookup de token Asaas em `create-payment-asaas`

- **Arquivo:** `supabase/functions/create-payment-asaas/index.ts`
- **Problema:** P01
- **Descrição:** Quando `creditCardToken` é recebido, fazer `SELECT asaas_credit_card_token FROM saved_payment_methods WHERE id = $1 AND user_id = $2`. Se encontrar token → usar. Se não encontrar ou for NULL → retornar erro.
- **Comportamento:** Frontend continua enviando UUID da `saved_payment_methods` como `creditCardToken` — edge function traduz.

### T5: Guard de duplicidade em `create-payment-asaas`

- **Arquivo:** `supabase/functions/create-payment-asaas/index.ts`
- **Problema:** P29
- **Descrição:** Antes de processar pagamento, verificar se pedido já possui `asaas_payment_id` preenchido (cobrança ativa). Se sim, retornar erro. Verificar também `payment_attempts >= 3`.
- **Guard:**
  ```typescript
  if (order.status !== 'aguardando_pagamento') {
    return { error: 'Este pedido já foi pago ou está cancelado' };
  }
  if (order.asaas_payment_id) {
    return { error: 'Este pedido já possui uma cobrança em processamento' };
  }
  if (order.payment_attempts >= 3) {
    return { error: 'Número máximo de tentativas de cartão excedido' };
  }
  ```

### T6: Zod + lookup + guard em `retry-payment-asaas`

- **Arquivo:** `supabase/functions/retry-payment-asaas/index.ts`
- **Problemas:** P01, P09, P29
- **Descrição:** Aplicar as mesmas correções de T1, T4 e T5 no `retry-payment-asaas`: Zod validation, lookup de token (UUID → token Asaas), guard de duplicidade.

### T7: Tokenização na retentativa

- **Arquivo:** `supabase/functions/retry-payment-asaas/index.ts`
- **Problema:** P11
- **Descrição:** Copiar lógica de tokenização de `create-payment-asaas`: se `saveCard=true` e `creditCardToken` não fornecido, tokenizar via API Asaas e salvar em `saved_payment_methods`.

### T8: Nova edge function `tokenize-card`

- **Arquivo:** `supabase/functions/tokenize-card/index.ts` (NOVO)
- **Problema:** P25
- **Descrição:** Edge function dedicada para adicionar cartão em "Minha Conta → Pagamento".
- **Fluxo:**
  1. Validar dados do cartão com Zod
  2. Chamar `POST /v3/creditCard/tokenizeCreditCard` no Asaas
  3. Salvar em `saved_payment_methods` com `asaas_credit_card_token`
  4. Retornar cartão salvo
- **Se falhar:** Exibir erro específico, não salvar no banco.

### T9: Guard duplicidade + `pix_attempts` em `create-abacatepay-pix`

- **Arquivo:** `supabase/functions/create-abacatepay-pix/index.ts`
- **Problemas:** P28, P29
- **Descrição:**
  1. Verificar se pedido já possui PIX ativo (`qr_code`) — se sim, retornar QR Code existente
  2. Verificar se `pix_attempts >= 3` — retornar erro se limite excedido
  3. Incrementar `pix_attempts` ao gerar novo PIX

### T10: Guard duplicidade + `pix_attempts` em `create-asaas-pix`

- **Arquivo:** `supabase/functions/create-asaas-pix/index.ts`
- **Problemas:** P28, P29
- **Descrição:** Mesma lógica de T9 para a edge function Asaas PIX.

### T11: Idempotência atômica de webhook

- **Arquivo:** `supabase/functions/asaas-webhook/index.ts`
- **Problemas:** P04, P10
- **Descrição:**
  1. Substituir SELECT + INSERT por `INSERT ... ON CONFLICT DO NOTHING`
  2. Registrar evento **antes** de processar (não depois)
  3. Se INSERT falhar (duplicata) → retornar 200 sem processar
  4. Ações pós-pagamento devem ser idempotentes

### T12: Remover `subtract-stock` de `verify-payment`

- **Arquivo:** `supabase/functions/verify-payment/index.ts`
- **Problema:** P03
- **Descrição:** Remover as chamadas a `subtract-stock` (linhas ~273-291) e `release_stock_reservation` (linhas ~294-296). A subtração de estoque passa a ser responsabilidade exclusiva do `asaas-webhook`.

### T13: Guard de concorrência em `verify-payment`

- **Arquivo:** `supabase/functions/verify-payment/index.ts`
- **Problema:** P19
- **Descrição:** Antes de atualizar status do pedido para `em_preparo`, verificar se status atual é `aguardando_pagamento`. Usar `WHERE status = 'aguardando_pagamento'` no UPDATE.

### T14: `asaas_credit_card_token` na interface SavedMethod

- **Arquivos:** `src/pages/CheckoutEntrega.tsx`, `src/components/CreditCardForm.tsx`
- **Problema:** P27
- **Descrição:**
  1. Adicionar `asaas_credit_card_token: string | null` à interface `SavedMethod` em `CheckoutEntrega.tsx`
  2. No `CreditCardForm`, quando `mode === 'saved'`, usar `savedCard.asaas_credit_card_token` como `creditCardToken`
  3. O `CreditCardFormData.creditCardToken` continua sendo string opcional

### T15: Trava de fechamento do PixPaymentDialog

- **Arquivo:** `src/components/PixPaymentDialog.tsx`
- **Problema:** P26
- **Descrição:** Quando usuário tenta fechar modal PIX (clique fora, ESC, X) sem pagamento confirmado:
  1. Exibir `AlertDialog` de confirmação: "Seu pedido foi criado e está aguardando pagamento. Deseja acompanhá-lo em /conta?"
  2. Se confirmar: fechar modal e navegar para `/conta`
  3. Se cancelar: manter modal aberto
- **Implementação:** Usar estado `pendingClose` controlado por `AlertDialog`

### T16: Refresh de PIX no dialog

- **Arquivos:** `src/components/PixPaymentDialog.tsx`, `src/pages/CheckoutEntrega.tsx`
- **Problema:** P02
- **Descrição:**
  1. `CheckoutEntrega.tsx`: criar `handleRefreshPixDialog()` que chama edge function PIX e atualiza state do dialog
  2. Passar `onRefreshPix` como prop para `PixPaymentDialog`
  3. `PixPaymentDialog`: quando PIX expirar e `onRefreshPix` estiver definido, exibir botão "Gerar novo QR Code"

### T17: Validação de CPF com dígitos verificadores

- **Arquivos:** `src/components/CreditCardForm.tsx`, `src/lib/creditCardValidation.ts`
- **Problema:** P07
- **Descrição:** Criar função `validateCPF` no frontend com algoritmo oficial dos dígitos verificadores. Rejeitar sequências iguais (`000.000.000-00`, `111.111.111-11`, etc.). Aplicar no campo CPF do `CreditCardForm`.
- **Algoritmo:** Ver design doc seção 4.2 (validar 1º e 2º dígitos verificadores).

---

## Fase 2 🟡 — Altos

> Problemas P06, P12, P15 | Estima: 1-2 dias

### T18: Remover salvamento de cartão duplicado no frontend

- **Arquivo:** `src/pages/CheckoutEntrega.tsx` (linhas ~661-678)
- **Problema:** P06
- **Descrição:** Remover o bloco que insere em `saved_payment_methods` após pagamento aprovado. O salvamento é responsabilidade exclusiva da edge function (`create-payment-asaas`). Frontend apenas envia `saveCard=true/false`.

### T19: Polling seguro com dialog fechado

- **Arquivo:** `src/components/PixPaymentDialog.tsx`
- **Problema:** P12
- **Descrição:** Em `checkPaymentStatus`, ao receber resposta de pagamento aprovado, verificar novamente se `open` ainda é `true` antes de navegar ou exibir toast. Adicionar guard no callback de sucesso.

### T20: Lógica combinada de botões em Account.tsx

- **Arquivo:** `src/pages/Account.tsx` (linha ~532)
- **Problema:** P15
- **Descrição:** Substituir condição `payment_attempts > 0 && !order.qr_code` por lógica que considera ambos os contadores:
  - Exibir "Tentar novamente" se `payment_attempts < 3`
  - Exibir "Pagar com PIX" se QR Code existe OU `pix_attempts < 3`
  - Exibir ambas as opções quando ambas disponíveis
- **Detalhes:** Ver design doc seção 5.3

---

## Fase 3 🟢 — Médios

> Problemas P13-P14, P16-P17, P19-P23 | Estima: 2-3 dias

### T21: Corrigir `totalAmount` na retentativa

- **Arquivo:** `src/pages/Account.tsx` (linha ~914)
- **Problema:** P13
- **Descrição:** O `CreditCardForm` do diálogo de retentativa recebe `totalAmount={0}`. Buscar `order.total_amount` do pedido selecionado: `totalAmount={selectedOrder?.total_amount || 0}`.

### T22: Enviar `creditCardToken` no `handleRetryCard`

- **Arquivo:** `src/pages/Account.tsx` (linhas ~321-336)
- **Problema:** P14
- **Descrição:** Incluir `creditCardToken` no body da requisição `retry-payment-asaas` quando o usuário estiver usando cartão salvo. O valor deve ser o `asaas_credit_card_token`.

### T23: `creditCardHolderInfo` opcional para cartão salvo

- **Arquivo:** `src/components/CreditCardForm.tsx`
- **Problema:** P16
- **Descrição:** Quando `mode === 'saved'` e `creditCardToken` está presente, não incluir `creditCardHolderInfo` com campos vazios no `buildFormData()`. Tornar opcional no backend também.

### T24: Padronizar toast — usar `sonner`

- **Arquivo:** `src/pages/Account.tsx` (e outros que usam `use-toast`)
- **Problema:** P20
- **Descrição:** Substituir chamadas a `toast({ title, description, variant })` do `@/hooks/use-toast` por `toast(message)` do `sonner` para consistência com o resto da aplicação.

### T25: Sanitizar logs de erro

- **Arquivo:** `src/pages/CheckoutEntrega.tsx` (linha ~552)
- **Problema:** P21
- **Descrição:** Substituir `console.error('AbacatePay PIX error, trying fallback:', abacatepayErr)` por `console.error('AbacatePay PIX error, trying fallback')` (sem vazar detalhes da resposta da API).

### T26: Remover `setFinalizing(false)` redundante

- **Arquivo:** `src/pages/CheckoutEntrega.tsx` (linhas ~597-600 e 697)
- **Problema:** P22
- **Descrição:** `setFinalizing(false)` é chamado duas vezes durante o fluxo de erro. Manter apenas uma chamada (no `finally`).

### T27: Condição de corrida na limpeza de pedidos

- **Arquivo:** `src/pages/CheckoutEntrega.tsx` (linhas ~424-435)
- **Problema:** P23
- **Descrição:** Unificar SELECT + DELETE em um único `DELETE` com condição `payment_id IS NULL AND status = 'aguardando_pagamento'` para evitar race condition.

### T28: Migration `payment_received_at`

- **Arquivos:** `supabase/migrations/<timestamp>_add_payment_received_at.sql`, `supabase/functions/asaas-webhook/index.ts`
- **Problema:** P17
- **Descrição:**
  1. Criar migration: `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_received_at timestamptz;`
  2. No webhook, remover try/catch silencioso (a coluna agora existe garantidamente)

### T29: URL de polling AbacatePay

- **Arquivo:** `supabase/functions/verify-payment/index.ts` (linha 153)
- **Problema:** P18
- **Descrição:** Verificar documentação da AbacatePay para URL correta de polling. Atualmente usa query parameter `?id=` — confirmar se deve ser path parameter. Ajustar conforme documentação.

---

## Resumo Executivo

| Fase | Tasks | Problemas | Estima | Complexidade |
|------|:-----:|:---------:|:------:|:------------:|
| Setup | 2 | P30 | < 1h | Baixa |
| 🔥 Fase 1 | 17 | P01-P05, P25-P30 | 6-8 dias | Alta (backend + frontend) |
| 🟡 Fase 2 | 3 | P06, P12, P15 | 1-2 dias | Média (só frontend) |
| 🟢 Fase 3 | 9 | P13-P14, P16-P23 | 2-3 dias | Baixa (cosméticos + bugs) |
| **Total** | **31** | **23 problemas** | **9-14 dias** | |

### Ordem de Implementação

```
S1 → S2                                    # Setup
T1 → T2 → T3 → T4 → T5                    # create-payment-asaas completo
T6 → T7                                   # retry-payment-asaas completo
T8                                       # tokenize-card (nova edge function)
T9 → T10                                  # PIX edge functions
T11 → T12 → T13                           # webhook + verify-payment
T14 → T15 → T16 → T17                     # frontend fase 1
T18 → T19 → T20                           # frontend fase 2
T21 → T22 → T23 → T24 → T25 → T26 → T27  # frontend fase 3
T28 → T29                                  # migrations finais + URL fix
```

### Convenções

- **Tasks começam em `pending`**, viram `in_progress` quando estou executando, `completed` quando finalizadas
- Uso `todo_write` para trackear progresso geral e `complete_step` com evidências ao finalizar cada task
- Cada task contém links para a seção correspondente no design doc
