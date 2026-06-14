# Design: Correções do Fluxo de Pagamento

> **Baseado na spec:** `docs/spec/payments/correcoes-fluxo-pagamento.md`
> **Versão:** 1.0
> **Público:** Desenvolvedores implementando as correções

---

## Sumário

1. [Visão Geral da Arquitetura](#1-visão-geral-da-arquitetura)
2. [Estratégia de Implementação](#2-estratégia-de-implementação)
3. [Fase 1: 🔥 Críticos](#3-fase-1--críticos)
4. [Fase 2: 🟡 Altos](#4-fase-2--altos)
5. [Fase 3: 🟢 Médios](#5-fase-3--médios)
6. [Glossário](#6-glossário)

---

## 1. Visão Geral da Arquitetura

### Diagrama de Fluxo (Pós-Correção)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CHECKOUT (CheckoutEntrega.tsx)               │
│                                                                     │
│  ┌──────────────────────────────┐   ┌────────────────────────────┐  │
│  │  PIX                         │   │  Cartão de Crédito         │  │
│  │  create-abacatepay-pix       │   │  create-payment-asaas      │  │
│  │  (fallback create-asaas-pix) │   │  (com Zod validation)      │  │
│  └───────────┬──────────────────┘   └──────────┬─────────────────┘  │
│              │                                  │                    │
│              ▼                                  ▼                    │
│  ┌──────────────────────────┐      ┌──────────────────────────┐    │
│  │ PixPaymentDialog         │      │ CreditCardForm           │    │
│  │ - polling (verify-payment│      │ - valida CPF dígitos     │    │
│  │ - refresh PIX expirado   │      │ - envia savedCardId      │    │
│  │ - trava fechamento       │      │ - envia saveCard flag    │    │
│  └──────────┬───────────────┘      └──────────┬───────────────┘    │
└──────────────┼──────────────────────────────────┼───────────────────┘
               │                                  │
               ▼                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                    EDGE FUNCTIONS                                │
│                                                                  │
│  create-payment-asaas     retry-payment-asaas                    │
│  ┌─────────────────────┐  ┌─────────────────────┐               │
│  │ ✓ Guard duplicidade │  │ ✓ Guard duplicidade │               │
│  │ ✓ Zod validação     │  │ ✓ Lookup UUID→token │               │
│  │ ✓ Tokenização só    │  │ ✓ Tokenização       │               │
│  │   (nunca raw card)  │  │   (saveCard=true)   │               │
│  │ ✓ Parcelamento c/   │  │ ✓ Parcelamento c/   │               │
│  │   última parcela    │  │   última parcela    │               │
│  └─────────────────────┘  └─────────────────────┘               │
│                                                                  │
│  create-abacatepay-pix     create-asaas-pix                      │
│  ┌─────────────────────┐  ┌─────────────────────┐               │
│  │ ✓ Guard duplicidade │  │ ✓ Guard duplicidade │               │
│  │ ✓ Limite pix_attempts│  │ ✓ Limite pix_attempts│              │
│  └─────────────────────┘  └─────────────────────┘               │
│                                                                  │
│  asaas-webhook                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ ✓ Idempotência: INSERT ON CONFLICT DO NOTHING             │  │
│  │ ✓ Única subtração de estoque                              │  │
│  │ ✓ Post-payment actions ANTES de registrar evento          │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  verify-payment (polling)                                        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ ✓ NÃO subtrai estoque (só atualiza status)                │  │
│  │ ✓ Guard concorrência (só update se aguardando_pagamento)  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  tokenize-card (NOVA)                                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ ✓ Chama POST /v3/creditCard/tokenizeCreditCard            │  │
│  │ ✓ Salva token em saved_payment_methods                    │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    PÓS-PAGAMENTO (Account.tsx)                    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ ✓ Retentativa com cartão (retry-payment-asaas)           │   │
│  │ ✓ "Pagar com PIX" após cartão recusado                   │   │
│  │ ✓ Ver QR Code PIX existente                              │   │
│  │ ✓ Refresh PIX expirado                                   │   │
│  │ ✓ Botões visíveis conforme combo (PIX+cartão)            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  MyPaymentMethods                                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ ✓ Adicionar cartão → chama tokenize-card edge fn        │   │
│  │ ✓ Lista cartões com token Asaas válido                  │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### Decisões Arquiteturais

| Decisão | Escolha | Justificativa |
|---------|---------|---------------|
| Responsabilidade de salvar cartão | **Apenas backend** (edge function) | Evita duplicação P06; frontend envia `saveCard=true/false` e backend gerencia |
| Subtração de estoque | **Apenas webhook** | Remove `subtract-stock` do `verify-payment` (P03). Webhook é a fonte da verdade |
| Idempotência de webhook | **`INSERT ... ON CONFLICT DO NOTHING`** | Torna a operação atômica (P04/P10) |
| Fallback de tokenização | **Nunca enviar dados brutos** | Se tokenização falhar, retornar erro (P05). Segurança PCI-DSS |
| Validação de cartão | **Zod schema na edge function** | Validar campos antes de chamar API Asaas (P09), retornando erros em português |
| Token de cartão salvo | **Lookup pelo `id` da tabela** | Edge function faz `SELECT asaas_credit_card_token WHERE id = $1` para traduzir UUID → token Asaas (P01) |
| Controle de duplicidade | **Guard unificado em cada edge function** | Cada edge function verifica se o pedido já possui cobrança ativa antes de processar |
| Bloqueio modal PIX | **Confirmação + redirect para `/conta`** | Ao fechar o dialog, exibir confirmação e redirecionar para `/conta` |
| Limite de regeneração PIX | **Nova coluna `pix_attempts` + verificação** | Contador independente de `payment_attempts`, limite de 3 |

---

## 2. Estratégia de Implementação

### Ordem de Implementação

1. **Primeiro as migrações de banco** (novas colunas, constraints)
2. **Depois as edge functions** (backend puro, testável isoladamente)
3. **Por último o frontend** (componentes React)

### Migration 20260602000001: Novos campos

```sql
-- orders: contador independente de regeneração de PIX
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pix_attempts integer DEFAULT 0;

-- saved_payment_methods: já tem asaas_credit_card_token da migration anterior

-- webhook_events: já existe com event_id UNIQUE
```

### Shared Types (a serem centralizados em `src/types/`)

```typescript
// src/types/payment.ts
export interface SavedMethod {
  id: string;
  payment_method: string;
  card_brand: string | null;
  card_last4: string | null;
  card_exp_month: string | null;
  card_exp_year: string | null;
  cardholder_name: string | null;
  is_default: boolean;
  asaas_credit_card_token: string | null;  // ← ADICIONADO
  last_used_at: string | null;
}

export interface PaymentOrder {
  id: string;
  user_id: string;
  status: string;
  total_amount: number;
  payment_attempts: number;
  pix_attempts: number;  // ← NOVO
  asaas_payment_id: string | null;
  payment_id: string | null;
  qr_code: string | null;
  qr_code_base64: string | null;
  pix_expiration: string | null;
  payment_gateway: string | null;
}
```

---

## 3. Fase 1: 🔥 Críticos

### 3.1 P01+P24: Lookup de token Asaas na edge function

**Arquivos:** `supabase/functions/retry-payment-asaas/index.ts`, `supabase/functions/create-payment-asaas/index.ts`, `src/components/CreditCardForm.tsx`

**Problema:** Frontend envia UUID de `saved_payment_methods` como `creditCardToken`, mas edge function espera token Asaas real.

**Solução:**

**Backend (`retry-payment-asaas` e `create-payment-asaas`):**

```
1. No início da função, se creditCardToken for recebido:
   a. Tentar fazer lookup: SELECT asaas_credit_card_token FROM saved_payment_methods WHERE id = $1 AND user_id = $2
   b. Se encontrar um token válido → usar como creditCardToken
   c. Se não encontrar → retornar erro "Cartão salvo não encontrado"
   d. Se o campo asaas_credit_card_token for NULL → retornar erro "Cartão salvo não possui token Asaas"
```

**Frontend (`CreditCardForm.tsx`):**

```
1. CreditCardFormData.creditCardToken continua sendo o id UUID da saved_payment_methods
2. Quando mode === 'saved', creditCardToken = savedCard.id
```

### 3.2 P02: Refresh de PIX no dialog

**Arquivos:** `src/components/PixPaymentDialog.tsx`, `src/pages/CheckoutEntrega.tsx`

**Problema:** `PixPaymentDialog` não recebe `onRefreshPix`, usuário fica travado se PIX expirar.

**Solução:**

**`CheckoutEntrega.tsx` (linha ~1200):**

```
1. Criar função handleRefreshPixDialog():
   a. Chamar create-abacatepay-pix ou create-asaas-pix
   b. Atualizar pixDialog state com novo qrCode, qrCodeBase64, expiresAt
2. Passar onRefreshPix={handleRefreshPixDialog} para PixPaymentDialog
```

**`PixPaymentDialog.tsx`:**

```
1. Quando PIX expirar (isExpired = true) E onRefreshPix estiver definido:
   a. Exibir mensagem "PIX expirado"
   b. Exibir botão "Gerar novo QR Code"
   c. Botão chama onRefreshPix()
2. Quando isExpired = true E onRefreshPix NÃO estiver definido:
   a. Exibir apenas mensagem de expirado (sem botão de refresh)
```

### 3.3 P03: Dupla subtração de estoque

**Arquivos:** `supabase/functions/verify-payment/index.ts`, `supabase/functions/asaas-webhook/index.ts`

**Problema:** Tanto `verify-payment` (polling) quanto `asaas-webhook` chamam `subtract-stock`.

**Solução:**

**`verify-payment/index.ts` (linhas ~272-296):**

```
1. REMOVER o bloco que chama subtract-stock (linhas 273-291)
2. REMOVER o bloco que chama release_stock_reservation (linhas 294-296)
3. verify-payment passa a ser apenas leitura + atualização de status
```

**`asaas-webhook/index.ts`:**

```
1. Manter subtração de estoque como única fonte da verdade
2. As ações pós-pagamento (executePostPaymentActions) são idempotentes
```

### 3.4 P04+P10: Idempotência atômica de webhook

**Arquivos:** `supabase/functions/asaas-webhook/index.ts`

**Problema:** Verificação (SELECT) e registro (INSERT) são operações separadas.

**Solução:**

```
1. Mover registro de webhook_events para ANTES do processamento (não depois)
2. Usar INSERT ON CONFLICT DO NOTHING para atomicidade:
   - Se o INSERT falhar (duplicata) → retornar 200 sem processar
   - Se o INSERT suceder → processar o evento
3. Se a função crashar entre executar ações e finalizar:
   - O evento já está registrado → retry não processa novamente
   - Mas ações pós-pagamento precisam ser idempotentes
4. Para ações pós-pagamento idempotentes:
   - subtract-stock: verificar se estoque já foi subtraído
   - email: verificar se já foi enviado
```

**Fluxo novo:**

```
1. Gerar eventId = `${payment.id}_${event}`
2. Tentar INSERT INTO webhook_events (event_id, event_type) VALUES ($1, $2)
3. Se duplicata (erro unique) → retornar 200 { success: true, duplicate: true }
4. Processar evento normalmente
5. Se crashar: na próxima tentativa, INSERT falha (já existe), retorna 200
```

### 3.5 P05: Remover fallback inseguro de tokenização

**Arquivos:** `supabase/functions/create-payment-asaas/index.ts`

**Problema:** Se tokenização falha, dados brutos do cartão são enviados para API.

**Solução:**

```
1. Se saveCard = true e creditCardToken NÃO foi fornecido:
   a. Chamar POST /v3/creditCard/tokenizeCreditCard
   b. Se falhar → retornar erro "Pagamento temporariamente indisponível. Tente novamente mais tarde."
   c. NUNCA enviar dados brutos do cartão
2. Se creditCardToken foi fornecido (cartão salvo):
   a. Usar o token diretamente (após lookup)
3. Se saveCard = false e creditCardToken NÃO foi fornecido:
   a. Pode enviar dados brutos (PCI-DSS permite se não armazenar)
   b. Mas ainda assim tokenizar se possível para reduzir superfície
```

**Observação:** A decisão de "nunca enviar dados brutos" é severa. PCI-DSS permite tráfego de dados brutos entre o merchant e o gateway (estamos em canal HTTPS). O risco real é baixo, mas a spec decide por essa abordagem conservadora.

### 3.6 P25: Tokenização de cartão em MyPaymentMethods

**Arquivos:** `src/components/MyPaymentMethods.tsx`, `supabase/functions/tokenize-card/index.ts` (NOVA)

**Problema:** `MyPaymentMethods` insere cartão diretamente no banco sem tokenizar.

**Solução:**

**Nova Edge Function `tokenize-card`:**

```typescript
// POST /tokenize-card
// Body: { creditCard, creditCardHolderInfo }
// 1. Validar com Zod
// 2. Chamar POST /v3/creditCard/tokenizeCreditCard
// 3. Salvar em saved_payment_methods com asaas_credit_card_token
// 4. Retornar o cartão salvo
```

**Frontend (`MyPaymentMethods.tsx`):**

```
1. No submit do formulário, chamar supabase.functions.invoke('tokenize-card')
2. Se sucesso: adicionar cartão à lista
3. Se erro: exibir mensagem específica
```

### 3.7 P26: Impedir fechamento livre do modal PIX

**Arquivos:** `src/components/PixPaymentDialog.tsx`, `src/pages/CheckoutEntrega.tsx`

**Problema:** Usuário pode fechar modal PIX livremente, gerando pedidos órfãos.

**Solução:**

**`PixPaymentDialog.tsx`:**

```
1. Quando open = false e usuário tentou fechar (via onOpenChange):
   a. Em vez de fechar diretamente, exibir AlertDialog de confirmação
   b. "Seu pedido foi criado e está aguardando pagamento. Deseja acompanhá-lo em /conta?"
   c. Se confirmar: navegar para /conta
   d. Se cancelar: manter modal aberto
2. Clique fora, ESC, X → todos passam pelo mesmo fluxo
3. Após pagamento confirmado: fechar normalmente e navegar para /conta
```

**`CheckoutEntrega.tsx`:**

```
1. Após fechar modal PIX (com confirmação), fetch orders pendentes
2. Na próxima renderização, exibir warning se houver pedido pendente
```

**Implementação:** Usar React state `pendingClose` para controlar o AlertDialog:

```typescript
const [pendingClose, setPendingClose] = useState(false);

// No onOpenChange(false):
if (open && !newOpen && !isPaid) {
  setPendingClose(true);  // Mostrar confirmação
} else {
  onOpenChange(newOpen);  // Fechar normalmente (qdo pago)
}

// AlertDialog:
<AlertDialog open={pendingClose} onOpenChange={setPendingClose}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
      <AlertDialogDescription>
        Seu pedido foi criado e está aguardando pagamento.
        Deseja acompanhá-lo em seus pedidos?
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel onClick={() => setPendingClose(false)}>
        Continuar aqui
      </AlertDialogCancel>
      <AlertDialogAction onClick={() => { onOpenChange(false); navigate('/conta'); }}>
        Ir para meus pedidos
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### 3.8 P27: Incluir `asaas_credit_card_token` na interface SavedMethod

**Arquivos:** `src/pages/CheckoutEntrega.tsx`, `src/components/CreditCardForm.tsx`

**Problema:** Interface `SavedMethod` não inclui `asaas_credit_card_token`.

**Solução:**

```
1. Adicionar asaas_credit_card_token: string | null à interface SavedMethod
2. No CreditCardForm, quando mode === 'saved', creditCardToken = savedCard.asaas_credit_card_token
3. O CreditCardForm envia creditCardToken (que pode ser UUID ou token Asaas)
4. A edge function faz lookup de UUID→token se necessário
```

**Interface atualizada:**

```typescript
interface SavedMethod {
  id: string;
  payment_method: string;
  card_brand: string | null;
  card_last4: string | null;
  card_exp_month: string | null;
  card_exp_year: string | null;
  cardholder_name: string | null;
  is_default: boolean;
  asaas_credit_card_token: string | null;  // NOVO
  last_used_at: string | null;
}
```

### 3.9 P28+P29+P30: Guard de cobrança duplicada + limite de PIX

**Arquivos:** `supabase/functions/create-payment-asaas/index.ts`, `supabase/functions/retry-payment-asaas/index.ts`, `supabase/functions/create-abacatepay-pix/index.ts`, `supabase/functions/create-asaas-pix/index.ts`

**Problema:** Edge functions não verificam se pedido já tem cobrança ativa.

**Migration nova:** Adicionar `pix_attempts` na tabela `orders`.

**Guard unificado para TODAS as edge functions de cobrança:**

```typescript
// Guard: verificar duplicidade de cobrança
const { data: order } = await supabase
  .from('orders')
  .select('status, asaas_payment_id, payment_id, qr_code, payment_attempts, pix_attempts')
  .eq('id', orderId)
  .single();

// 1. Pedido já pago?
if (order.status !== 'aguardando_pagamento') {
  return { error: 'Este pedido já foi pago ou está cancelado' };
}

// 2. Já tem cartão ativo? (create-payment-asaas / retry-payment-asaas)
if (order.asaas_payment_id && isCardPayment) {
  return { error: 'Este pedido já possui uma cobrança em processamento' };
}

// 3. Já tem PIX ativo? (create-abacatepay-pix / create-asaas-pix)
if (order.qr_code && isPixPayment) {
  // Retornar QR Code existente em vez de criar novo
  return { qrCode: order.qr_code, qrCodeBase64: order.qr_code_base64 };
}

// 4. Limite de regeneração de PIX (create-abacatepay-pix / create-asaas-pix)
if (isPixPayment && order.pix_attempts >= 3) {
  return { error: 'Número máximo de regenerações de PIX excedido' };
}

// 5. Limite de tentativas de cartão (create-payment-asaas / retry-payment-asaas)
if (isCardPayment && order.payment_attempts >= 3) {
  return { error: 'Número máximo de tentativas de cartão excedido' };
}
```

**Incremento de `pix_attempts`:**

```typescript
// Após gerar PIX com sucesso
await supabase
  .from('orders')
  .update({ 
    pix_attempts: supabase.rpc('increment', { x: 1 }), // ou (current + 1)
    ...
  })
  .eq('id', orderId);
```

**Nota:** Como Supabase JS não suporta `increment()` diretamente, fazer:

```typescript
const { data: order } = await supabase
  .from('orders')
  .select('pix_attempts')
  .eq('id', orderId)
  .single();

const newPixAttempts = (order?.pix_attempts ?? 0) + 1;

await supabase
  .from('orders')
  .update({ pix_attempts: newPixAttempts })
  .eq('id', orderId);
```

---

## 4. Fase 2: 🟡 Altos

### 4.1 P06: Duplicação de cartões salvos

**Problema:** Frontend e backend ambos salvam cartão.

**Solução:** Já resolvido pela decisão arquitetural de "apenas backend salva cartão".

**Frontend (`CheckoutEntrega.tsx` linhas ~661-678):** Remover salvamento de cartão no frontend. Manter apenas o envio de `saveCard=true/false` para a edge function.

### 4.2 P07: Validação de CPF com dígitos verificadores

**Arquivos:** `src/lib/creditCardValidation.ts` (ou similar)

**Problema:** Validação atual só verifica comprimento.

**Solução:** Criar função `validateCPF` com algoritmo oficial:

```typescript
export function validateCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  
  // Rejeitar sequências iguais
  if (/^(\d)\1{10}$/.test(digits)) return false;
  
  // Validar 1º dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(digits[9])) return false;
  
  // Validar 2º dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== parseInt(digits[10])) return false;
  
  return true;
}
```

**Aplicar em:** `src/components/CreditCardForm.tsx` (validação de CPF no formulário).

### 4.3 P08: Ajustar cálculo de parcelamento

**Arquivos:** `supabase/functions/create-payment-asaas/index.ts` (linha 210), `supabase/functions/create-payment/index.ts` (legado)

**Problema:** `(total / count).toFixed(2)` pode fazer soma ≠ total.

**Solução:**

```typescript
const installmentValue = Math.floor(Number(total_amount) * 100 / Number(installmentCount)) / 100;
const lastInstallmentValue = Number(total_amount) - installmentValue * (installmentCount - 1);
```

**No payload para o Asaas:**

```typescript
paymentPayload.installmentValue = Number(installmentValue.toFixed(2));
// A última parcela será ajustada pelo Asaas automaticamente,
// mas o cálculo correto garante aprovação
```

### 4.4 P09: Validar campos de cartão com Zod no backend

**Arquivos:** `supabase/functions/create-payment-asaas/index.ts`, `supabase/functions/retry-payment-asaas/index.ts`

**Problema:** Validação superficial dos campos de cartão.

**Solução:** Adicionar schema Zod no início de cada edge function:

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

### 4.5 P11: Garantir tokenização na retentativa

**Arquivos:** `supabase/functions/retry-payment-asaas/index.ts`

**Problema:** `retry-payment-asaas` não tokeniza cartão se `saveCard=true`.

**Solução:** Copiar lógica de tokenização de `create-payment-asaas`:

```
1. Se saveCard = true e creditCardToken não fornecido:
   a. Chamar POST /v3/creditCard/tokenizeCreditCard
   b. Salvar token em saved_payment_methods
   c. Usar token no payload
2. Se saveCard = true e creditCardToken fornecido:
   a. Token já existe, usar diretamente (já foi salvo anteriormente)
```

### 4.6 P12: Polling seguro com dialog fechado

**Arquivos:** `src/components/PixPaymentDialog.tsx`

**Problema:** Resposta de polling pode chegar com dialog já fechado.

**Solução:**

```typescript
const checkPaymentStatus = useCallback(async () => {
  if (!open || !orderId || isPaid) return;  // ← já verifica open
  
  // ... requisição ...
  
  // Ao receber resposta, verificar novamente
  if (result?.status === 'approved' && !hasNotified) {
    // Verificar se dialog ainda está aberto
    if (!open) return;  // ← nova verificação
    
    setHasNotified(true);
    toast({ ... });
    // ...
  }
}, [open, orderId, isPaid, hasNotified, gateway, onOpenChange, navigate, toast]);
```

### 4.7 P30: Migration para `pix_attempts`

**Arquivo:** `supabase/migrations/<timestamp>_add_pix_attempts.sql`

```sql
-- Adicionar coluna pix_attempts na tabela orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pix_attempts integer DEFAULT 0;

-- Índice para busca de pedidos com PIX
CREATE INDEX IF NOT EXISTS idx_orders_pix_attempts ON orders (pix_attempts)
  WHERE status = 'aguardando_pagamento';
```

---

## 5. Fase 3: 🟢 Médios

### 5.1 P13: Corrigir `totalAmount` na retentativa em `/conta`

**Arquivo:** `src/pages/Account.tsx` (linha 914)

**Problema:** `CreditCardForm` recebe `totalAmount={0}`.

**Solução:** Buscar `order.total_amount` do pedido selecionado.

```typescript
// Account.tsx linha ~914
<CreditCardForm
  totalAmount={selectedOrder?.total_amount || 0}  // ← buscar do pedido
  onInstallmentChange={() => {}}
  loading={retryLoading}
/>
```

### 5.2 P14: Retentativa não envia token de cartão salvo

**Arquivo:** `src/pages/Account.tsx`

**Problema:** `handleRetryCard` não extrai `asaas_credit_card_token`.

**Solução:**

```typescript
const handleRetryCard = async () => {
  // ... capturar dados ...
  
  const body: Record<string, any> = {
    orderId: retryCardOrderId,
    installmentCount: retryCardData.installmentCount,
    saveCard: retryCardData.saveCard,
    remoteIp,
    customerData: { ... },
  };
  
  // Se tem cartão salvo, enviar creditCardToken
  if (retryCardData.creditCardToken) {
    body.creditCardToken = retryCardData.creditCardToken;
  } else {
    body.creditCard = retryCardData.creditCard;
    body.creditCardHolderInfo = retryCardData.creditCardHolderInfo;
  }
  
  const { data: result, error } = await supabase.functions.invoke('retry-payment-asaas', { body });
};
```

### 5.3 P15: Botões de retentativa com PIX existente

**Arquivo:** `src/pages/Account.tsx` (linha 532)

**Problema:** Condição `payment_attempts > 0 && !order.qr_code` esconde botões quando há PIX.

**Solução:**

```typescript
// Mostrar opções baseado no estado combinado
const hasCardAttempts = (order as any).payment_attempts > 0;
const hasQrCode = !!order.qr_code;
const cardAttemptsRemaining = PAYMENT_CONFIG.CARD_RETRY_MAX_ATTEMPTS - ((order as any).payment_attempts || 0);
const pixAttemptsRemaining = 3 - ((order as any).pix_attempts || 0);

// Mostrar PIX se: 
// - Tem QR Code válido (ver PIX), OU
// - Tentativas de cartão disponíveis E pix_attempts < 3 (gerar novo PIX)
if (hasQrCode || (hasCardAttempts && pixAttemptsRemaining > 0)) {
  // Exibir "Pagar com PIX"
}

// Mostrar cartão se: payment_attempts > 0 E cardAttemptsRemaining > 0
if (hasCardAttempts && cardAttemptsRemaining > 0) {
  // Exibir "Tentar novamente com cartão"
}
```

### 5.4 P16: Dados vazios do titular com cartão salvo

**Arquivo:** `src/components/CreditCardForm.tsx`

**Problema:** `creditCardHolderInfo` sempre incluído mesmo vazio.

**Solução:**

```typescript
function buildFormData(): CreditCardFormData | null {
  // ...
  
  if (creditCardToken) {
    // Cartão salvo: não enviar creditCardHolderInfo vazio
    // A edge function deve tratar creditCardHolderInfo como opcional
    // quando creditCardToken está presente
  }
  
  // ...
}
```

**Backend:** Tornar `creditCardHolderInfo` opcional quando `creditCardToken` está presente.

### 5.5 P17: Migration `payment_received_at`

**Arquivo:** `supabase/functions/asaas-webhook/index.ts`

**Problema:** Tratamento de erro silencioso.

**Solução:** Criar migration para adicionar a coluna e remover try/catch silencioso.

```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_received_at timestamptz;
```

### 5.6 P18: URL de polling AbacatePay

**Arquivo:** `supabase/functions/verify-payment/index.ts` (linha 153)

**Problema:** Query parameter em vez de path parameter.

**Solução:** Verificar documentação da AbacatePay e ajustar.

```
// URL atual: GET /v2/transparents/check?id=${payment_id}
// Verificar se deve ser: GET /v2/transparents/${payment_id}/check
```

**Nota:** Isso requer verificação na documentação da AbacatePay. Manter query parameter se funcionar, ajustar se necessário.

### 5.7 P19: Update sem guard contra concorrência

**Arquivo:** `supabase/functions/verify-payment/index.ts` (linhas 256-260)

**Problema:** Update do pedido sem verificar status atual.

**Solução:**

```typescript
// Antes de atualizar para em_preparo
const { data: currentOrder } = await supabase
  .from('orders')
  .select('status')
  .eq('id', orderId)
  .single();

if (currentOrder?.status !== 'aguardando_pagamento') {
  // Pedido já foi processado por outro fluxo (webhook)
  return;
}

// Agora pode atualizar
await supabase
  .from('orders')
  .update({ status: 'em_preparo' })
  .eq('id', orderId)
  .eq('status', 'aguardando_pagamento');  // guard na query
```

### 5.8 P20: Inconsistência no uso de toast

**Arquivos:** `src/components/PixPaymentDialog.tsx` (use-toast), `src/pages/CheckoutEntrega.tsx` (sonner)

**Problema:** Dois sistemas de toast diferentes.

**Solução:** Padronizar para `sonner` (usado no CheckoutEntrega). 

**Nota:** A escolha entre `use-toast` e `sonner` é cosmética. A spec sugere `sonner` como padrão.

### 5.9 P21: Log de erro inseguro

**Arquivo:** `src/pages/CheckoutEntrega.tsx` (linha 552)

**Problema:** `console.error` pode vazar detalhes da API.

**Solução:** Sanitizar ou remover log detalhado.

```typescript
// Antes:
console.error('AbacatePay PIX error, trying fallback:', abacatepayErr);

// Depois:
console.error('AbacatePay PIX error, trying fallback');
// Ou com sanitização:
console.error('AbacatePay PIX error:', sanitizeError(abacatepayErr));
```

### 5.10 P22: `setFinalizing(false)` redundante

**Arquivo:** `src/pages/CheckoutEntrega.tsx`

**Problema:** Chamado duas vezes.

**Solução:** Remover chamada redundante.

### 5.11 P23: Condição de corrida na limpeza de pedidos abandonados

**Arquivo:** `src/pages/CheckoutEntrega.tsx`

**Problema:** SELECT e DELETE separados.

**Solução:**

```typescript
// Usar uma única consulta com condição
const { error } = await supabase
  .from('orders')
  .delete()
  .is('payment_id', null)
  .eq('status', 'aguardando_pagamento')
  .lt('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString());
```

---

## 6. Glossário

| Termo | Definição |
|-------|-----------|
| **Token Asaas** | Token reutilizável do Asaas (`asaas_credit_card_token`) vinculado ao customer, usado para pagamentos sem redigitar dados |
| **Idempotência atômica** | Garantia de que uma operação é processada exatamente uma vez, usando `INSERT ON CONFLICT DO NOTHING` |
| **Lookup de token** | Tradução do UUID da tabela `saved_payment_methods` para o token Asaas real |
| **Guard de duplicidade** | Verificação no início de cada edge function que impede processamento de cobranças duplicadas |
| **Pedido órfão** | Pedido criado com status `aguardando_pagamento` e PIX gerado, mas abandonado pelo usuário |

---

## Apêndice: Tasks Detalhadas

### Setup
- [ ] T01: Criar migration `add_pix_attempts.sql`
- [ ] T02: Centralizar tipos em `src/types/payment.ts`

### Fase 1 (🔥 Críticos)
- [ ] T03: Criar `supabase/functions/tokenize-card/index.ts` (P25)
- [ ] T04: Adicionar Zod schema de validação de cartão em `create-payment-asaas` (P09)
- [ ] T05: Remover fallback inseguro em `create-payment-asaas` (P05)
- [ ] T06: Ajustar cálculo de parcelamento em `create-payment-asaas` (P08)
- [ ] T07: Adicionar lookup de token Asaas em `create-payment-asaas` (P01)
- [ ] T08: Adicionar guard de duplicidade em `create-payment-asaas` (P29)
- [ ] T09: Adicionar Zod + lookup + guard em `retry-payment-asaas` (P01/P09/P29)
- [ ] T10: Adicionar tokenização na retentativa em `retry-payment-asaas` (P11)
- [ ] T11: Implementar idempotência atômica com `INSERT ON CONFLICT` no webhook (P04)
- [ ] T12: Remover `subtract-stock` de `verify-payment` (P03)
- [ ] T13: Adicionar guard de duplicidade + `pix_attempts` nas PIX edge functions (P28/P29)
- [ ] T14: Adicionar `pix_attempts` incremento em PIX edge functions (P30)
- [ ] T15: Adicionar `asaas_credit_card_token` na interface SavedMethod (P27)
- [ ] T16: Implementar confirmação de fechamento no PixPaymentDialog (P26)
- [ ] T17: Implementar refresh de PIX no PixPaymentDialog (P02)
- [ ] T18: Adicionar validação de CPF com dígitos verificadores (P07)

### Fase 2 (🟡 Altos)
- [ ] T19: Remover salvamento de cartão duplicado no frontend (P06)
- [ ] T20: Adicionar polling seguro com verificação de `open` (P12)
- [ ] T21: Implementar lógica combinada de botões em Account.tsx (P15)

### Fase 3 (🟢 Médios)
- [ ] T22: Corrigir `totalAmount` na retentativa em Account.tsx (P13)
- [ ] T23: Adicionar `creditCardToken` no body de handleRetryCard (P14)
- [ ] T24: Tratar `creditCardHolderInfo` opcional para cartão salvo (P16)
- [ ] T25: Corrigir guard de concorrência em verify-payment (P19)
- [ ] T26: Padronizar toast para sonner (P20)
- [ ] T27: Sanitizar logs de erro (P21)
- [ ] T28: Remover `setFinalizing` redundante (P22)
- [ ] T29: Corrigir condição de corrida na limpeza de pedidos (P23)
- [ ] T30: Criar migration para `payment_received_at` (P17)
