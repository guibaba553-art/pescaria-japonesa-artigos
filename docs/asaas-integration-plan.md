# Plano de Integração: Asaas (Cartão de Crédito)

## Objetivo

Substituir o checkout hospedado do AbacatePay para **cartão de crédito** por um **checkout transparente Asaas**, permitindo que o cliente preencha os dados do cartão diretamente na página `/checkout/entrega` sem redirecionamento.

## Fluxo Atual

```
Usuário seleciona "Cartão de Crédito"
  → Clica "Finalizar pedido"
  → Pedido criado no banco
  → Redireciona para AbacatePay (checkout hospedado)
  → Cliente preenche dados lá
  → Volta ao site após pagamento
```

## Fluxo Desejado (com Asaas)

```
Usuário seleciona "Cartão de Crédito"
  → Página exibe formulário inline:
      ├─ Número do cartão (com detecção de bandeira)
      ├─ Nome do titular
      ├─ Validade (MM/AA)
      ├─ CVV
      └─ Parcelamento (1x a 12x)
  → Cliente preenche e clica "Finalizar pedido"
  → SDK Asaas tokeniza o cartão no frontend
  → Chama edge function create-payment-asaas
  → Edge function processa cobrança via API Asaas
  → Retorna resultado (aprovado/recusado)
  → Se aprovado: atualiza order, redireciona para /conta
  → Se recusado: mostra erro na tela
```

## Arquitetura

```
┌──────────────────────────┐     ┌──────────────────────────┐
│    Frontend (React)      │     │   Edge Function (Deno)    │
│                          │     │                          │
│  Load Asaas JS SDK       │     │  POST /v3/payments       │
│  mp.createCardToken()   │     │  Authorization: Bearer   │
│       → token           │     │  {                        │
│                          │     │    customer: "...",      │
│  Chama edge function     │     │    billingType: "CREDIT_CARD",│
│  com { token, ... }     │     │    value: 15000,          │
│                          │     │    creditCard: {...},     │
│  Resposta:               │     │    creditCardToken: token │
│  { success, payment }    │     │  }                        │
└──────────────────────────┘     └──────────────────────────┘
```

## Componentes a criar/modificar

### 1. Frontend — Formulário de Cartão (`CreditCardForm.tsx`) [novo]

Formulário inline com:

| Campo | Tipo | Validação |
|-------|------|-----------|
| Número do cartão | Input masked | Luhn + detecção bandeira |
| Nome do titular | Input | Mínimo 3 caracteres |
| Validade | Input MM/AA | Data futura |
| CVV | Input 3-4 dígitos | Obrigatório |
| Parcelas | Select (1x a 12x) | Conforme regra de negócio |

**Props:**
```ts
interface CreditCardFormProps {
  amount: number; // valor total em centavos
  onTokenGenerated: (token: string, installments: number) => void;
  onError: (error: string) => void;
  loading: boolean;
}
```

### 2. Frontend — CheckoutEntrega.tsx [modificar]

- Substituir o Card "Cartão de Crédito" atual (que lista cartões salvos) por um card que expande para mostrar `CreditCardForm`
- Remover `savedCards` e `SavedMethod` (não usaremos cartões salvos por enquanto)
- Adicionar lógica para carregar SDK Asaas
- Adicionar estado `cardToken` e `installments`
- Adaptar `handleFinalizeOrder` para:
  - Se `selectedPayment === 'credit_card'`:
    1. Validar formulário
    2. Tokenizar cartão via Asaas SDK
    3. Chamar edge function `create-payment-asaas`
    4. Processar resposta

### 3. Edge Function — `create-payment-asaas` [nova]

**Endpoint:** `POST /v3/payments` (API Asaas)

**Recebe:**
```json
{
  "orderId": "uuid",
  "creditCardToken": "token_do_asaas",
  "installmentCount": 3,
  "creditCardHolderName": "João Silva",
  "creditCardNumber": "4000...",
  "creditCardExpiryMonth": "12",
  "creditCardExpiryYear": "2030",
  "creditCardCcv": "123",
  "customerData": {
    "name": "João Silva",
    "email": "joao@email.com",
    "cpfCnpj": "123.456.789-01",
    "phone": "66999999999",
    "postalCode": "78556100",
    "address": "Rua X, 123",
    "addressNumber": "123",
    "complement": "Apto",
    "province": "Centro",
    "city": "Sinop",
    "state": "MT"
  }
}
```

**Processo:**
1. Verifica autenticação (JWT)
2. Verifica ownership do pedido
3. Verifica preços
4. Cria/obtém customer no Asaas (por CPF)
5. Cria payment com `billingType: CREDIT_CARD`
6. Se aprovado → atualiza order para `em_preparo`
7. Se recusado → retorna erro

**Resposta:**
```json
{
  "success": true,
  "data": {
    "id": "pay_...",
    "status": "CONFIRMED" | "RECEIVED" | "DECLINED",
    "installments": 3,
    "value": 15000,
    "netValue": 14250
  }
}
```

### 4. Edge Function — `asaas-webhook` [nova]

**Eventos Asaas:**
| Evento | Ação |
|--------|------|
| `PAYMENT_CONFIRMED` | Atualiza order para `em_preparo` |
| `PAYMENT_RECEIVED` | Atualiza order para `em_preparo` |
| `PAYMENT_OVERDUE` | Marca como atrasado (opcional) |
| `PAYMENT_REFUNDED` | Atualiza order para `cancelado` |

## Configuração

### Variáveis de ambiente

**`supabase/functions/.env`:**
```
ASAAS_API_KEY=seu_token_asaas
ASAAS_ENVIRONMENT=sandbox  # sandbox | production
```

**`src/config/constants.ts`:**
```ts
ASAAS_PUBLIC_KEY: '...',
ASAAS_ENVIRONMENT: import.meta.env.VITE_ASAAS_ENVIRONMENT ?? 'sandbox',
```

### Ambiente de teste

Asaas oferece ambiente sandbox em `https://sandbox.asaas.com/api/v3/` com cartões de teste:

| Bandeira | Número | Resultado |
|----------|--------|-----------|
| Visa | `4000000000000010` | Aprovado |
| Mastercard | `5555666677778884` | Aprovado |
| Visa | `4000000000000002` | Recusado |

Qualquer data futura, CVV 123, nome qualquer.

## Fluxo completo

```
1. Usuário seleciona "Cartão de Crédito"
2. Formulário inline aparece:
   ┌──────────────────────────────────┐
   │ 💳 Cartão de Crédito            │
   │                                  │
   │ Número do cartão                 │
   │ ┌────────────────────────────┐   │
   │ │ 4242 4242 4242 4242        │   │
   │ └────────────────────────────┘   │
   │ Nome do titular                  │
   │ ┌────────────────────────────┐   │
   │ │ João Silva                  │   │
   │ └────────────────────────────┘   │
   │ Validade         CVV             │
   │ ┌────────┐  ┌──────┐            │
   │ │ 12/30  │  │ 123  │            │
   │ └────────┘  └──────┘            │
   │ Parcelamento                    │
   │ ┌────────────────────────────┐   │
   │ │ 3x de R$ 50,00 ▼          │   │
   │ └────────────────────────────┘   │
   │                                  │
   │ [ 💳 Finalizar pedido ]          │
   └──────────────────────────────────┘
3. Cliente clica Finalizar
4. SDK Asaas tokeniza cartão
5. Edge function processa pagamento
6. Se aprovado → redirect /conta
7. Se recusado → "Cartão recusado. Tente outro."
```

## Dependências

- Conta Asaas (sandbox + produção)
- SDK JS do Asaas: `<script src="https://assets.asaas.com/assets/asaas.js"></script>`
- Chave de API Asaas (gerada no dashboard)

## Riscos

- **Alto**: Processar cartão no frontend exige PCI SAQ (Security Assessment Questionnaire) — Asaas reduz isso com tokenização (não armazenamos número completo)
- **Médio**: Prevenir fraudes — Asaas oferece análise antifraude integrada
- **Baixo**: Concorrência com fluxo PIX + AbacatePay — os 3 métodos (PIX, Cartão Asaas, Checkout AbacatePay) coexistem

## Ordem de implementação

1. Criar conta Asaas sandbox + obter chaves
2. Implementar edge function `create-payment-asaas`
3. Criar componente `CreditCardForm` com tokenização Asaas
4. Adaptar `CheckoutEntrega.tsx` para exibir formulário
5. Testar fluxo completo com cartões de teste
6. Implementar `asaas-webhook` para confirmação automática
7. Configurar produção
8. Remover opção "Cartão de Crédito" do AbacatePay (manter só PIX + Checkout)
