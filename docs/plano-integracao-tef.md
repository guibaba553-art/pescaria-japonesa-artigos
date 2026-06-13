# Plano de Integração TEF (Stone) — PDV

> Documento de referência sobre a arquitetura TEF já implementada no sistema.
> Criado em: 2025-06-30

---

## 1. Visão Geral

O **TEF** (Transferência Eletrônica de Fundos) já está integrado ao PDV via Stone (Ton/Stone).
O fluxo é:

```
Caixa → seleciona crédito/débito → finaliza venda →
    Edge Function TEF → maquininha processa →
    aprovação → pedido finalizado com dados da transação
```

---

## 2. Arquitetura

### 2.1 Tabelas no Supabase

| Tabela | Função |
|--------|--------|
| `tef_settings` | Configuração ativada pelo admin (modo, código filiação, ambiente) |
| `tef_transactions` | Registro de cada transação (NSU, autorização, bandeira, status) |
| `orders.tef_transaction_id` | FK ligando o pedido à transação TEF |

### 2.2 Arquivos do sistema

| Arquivo | Função |
|---------|--------|
| `src/components/TEFSettings.tsx` | Tela de admin para configurar TEF (habilitar, modo, URL agente, ambiente) |
| `src/components/TefChargeDialog.tsx` | Diálogo modal que exibe status da transação (idle → charging → approved/declined) |
| `src/pages/PDV.tsx` (linhas ~342-345, ~531-537, ~1472-1482, ~3231-3248) | Aciona o diálogo TEF quando o método é crédito/débito com TEF habilitado |
| `src/utils/pdvPricing.ts` | Fórmulas de markup: débito = PIX + 2%, crédito = PIX + 3% |
| `supabase/functions/tef-stone-charge/index.ts` | Edge Function que orquestra toda a transação |

### 2.3 Modos de operação

#### Modo Connect (Stone Connect / PayGo)

- Maquininha conectada via USB/Bluetooth ao computador do caixa
- Um **agente local** (Stone Connect) roda em `localhost:9999`
- O PDV faz `fetch(agent_url + '/charge')` com os dados da transação
- **Requer:** instalar o agente Stone Connect no Windows do caixa

#### Modo API (Stone Open API)

- Comunicação direta com a API na nuvem (`api.openbank.stone.com.br`)
- Funciona em qualquer dispositivo (inclusive tablet)
- **Requer:** credenciais OAuth `CLIENT_ID` + `CLIENT_SECRET`

#### Modo Simulação (mock)

- Ativado automaticamente enquanto `STONE_CLIENT_ID` e `STONE_CLIENT_SECRET` não estiverem configurados
- Aprova todas as transações com dados fictícios (bandeira VISA, NSU gerado, cartão 1234)
- Permite testar o fluxo completo do PDV sem maquininha real

---

## 3. Fluxo detalhado

```
PDV.tsx — finalizeSale()
  │
  ├─ Se TEF habilitado AND método for crédito/débito AND ainda não foi aprovado:
  │     → setShowTefDialog(true)
  │     → return (interrompe finalização)
  │
  ├─ TefChargeDialog renderizado (lazy loaded via React.lazy + Suspense)
  │
  └─ Ao abrir, useEffect() dispara:
       │
       └─ supabase.functions.invoke('tef-stone-charge', { amount, payment_method, installments })
            │
            ├─ Edge Function:
            │   1. Valida autenticação (JWT)
            │   2. Carrega tef_settings
            │   3. Cria tef_transactions com status 'pending'
            │
            ├─ Modo Connect:
            │   4. Retorna { mode:'connect', agent_url, payload, transaction_id }
            │      → PDV faz fetch(agent_url + '/charge')
            │      → Se approved: atualiza DB, fecha dialog, finaliza venda
            │
            └─ Modo API:
                 4a. Sem credenciais → MOCK (aprovado automático)
                 4b. Com credenciais:
                     - OAuth client_credentials → access_token
                     - POST /api/v1/charges → processa pagamento
                     - Atualiza DB com resultado
                  → Retorna approved/declined
```

---

## 4. Checklist de implementação (para quando for ativar)

### 🔲 Pré-requisitos

- [ ] Conta Stone/Ton ativa (comercial)
- [ ] Credenciais de API (CLIENT_ID + CLIENT_SECRET) — solicitar no [Portal Stone](https://app.stone.co)
- [ ] Decidir entre modo Connect (agente local no Windows) ou API (nuvem)
- [ ] Homologar no ambiente Sandbox antes de Produção

### 🔲 Configurar ambiente de homologação

1. Acessar Admin → Configurações TEF (`/admin/tef`)
2. Habilitar TEF
3. Selecionar modo **Stone Open API**
4. Inserir **Stone Code** (código de afiliação)
5. Ambiente: **Homologação**

### 🔲 Configurar env vars no Supabase

No painel Supabase → Edge Functions → `tef-stone-charge`:

| Env Var | Valor | Obrigatório? |
|---------|-------|-------------|
| `STONE_CLIENT_ID` | Client ID da sua app Stone | Sim (senão cai em mock) |
| `STONE_CLIENT_SECRET` | Client Secret da sua app Stone | Sim |
| `STONE_ENVIRONMENT` | `sandbox` (homologação) ou `production` | Sim |
| `STONE_MERCHANT_ID` | Código de afiliação (se não estiver em tef_settings) | Não |

### 🔲 Testar no PDV

- [ ] Abrir `/pdv`
- [ ] Adicionar produto, selecionar **Crédito**, finalizar
- [ ] Verificar diálogo TEF abrir
- [ ] Transação ser processada (mock = aprovado automático)
- [ ] Pedido criado com `tef_transaction_id` preenchido
- [ ] Repetir com **Débito**
- [ ] Verificar `tef_transactions` no banco com status correto
- [ ] Testar recusa (simular erro) — diálogo exibe mensagem e botão "Fechar"

### 🔲 Migrar para produção

1. Trocar `STONE_ENVIRONMENT` para `production`
2. Trocar ambiente nas configurações TEF para **Produção**
3. Fazer um teste real com maquininha (modo Connect ou API)
4. Verificar nota fiscal NFC-e gerada com meios de pagamento corretos

### 🔲 Opcional — modo Connect (agente local)

- [ ] Instalar [Stone Connect](https://www.stone.com.br/stone-connect/) ou [PayGo](https://www.ton.com.br/paygo) no Windows do caixa
- [ ] Configurar `agent_url` como `http://localhost:9999` no TEFSettings
- [ ] Verificar comunicação: PDV → agente local → maquininha

---

## 5. Manutenção futura

### Expandir para outras adquirentes

Para adicionar outra(s) adquirente(s) (Rede, Cielo, GetNet), o padrão é:

1. Criar nova Edge Function (ex: `tef-rede-charge`)
2. Adicionar campo `provider` em `tef_settings`
3. Estender `TefChargeDialog` para rotear conforme o provider
4. Estender `TEFSettings` para configurar múltiplos providers

### Logs e debugging

- Toda transação fica registrada em `tef_transactions` com `raw_response`
- A Edge Function loga no console do Supabase
- O `TefChargeDialog` exibe erros textualmente para o operador

---

## 6. Diagrama de componentes

```
┌─────────────────────────────────────────────────────────────┐
│                        PDV (React)                          │
│  ┌─────────────┐    ┌──────────────────┐   ┌─────────────┐  │
│  │ Carrinho     │    │ FinalizeSale()   │   │ TefDialog   │  │
│  │ + produtos   │───→│                  │──→│ (lazy)      │  │
│  └─────────────┘    │ detecta tef on   │   └──────┬──────┘  │
│                     │ crédito/débito   │          │         │
│                     └──────────────────┘          │         │
│              ┌──────────────────────┐              │         │
│              │ pdvPricing.ts        │              │         │
│              │ (markup 2% / 3%)     │              │         │
│              └──────────────────────┘              │         │
└────────────────────────────────────────────────────┼─────────┘
                                                     │
                                                     ▼
                            ┌──────────────────────────────────┐
                            │   Edge Function                  │
                            │   tef-stone-charge               │
                            │                                  │
                            │  ┌──────────┐  ┌──────────────┐  │
                            │  │ auth JWT │  │ tef_settings │  │
                            │  └──────────┘  └──────────────┘  │
                            │                                  │
                            │  ┌──────────────────────────┐    │
                            │  │ modo Connect?            │    │
                            │  │   → retorna URL agente   │    │
                            │  │ modo API?                │    │
                            │  │   → mock (sem creds)     │    │
                            │  │   → Stone OAuth + charge │    │
                            │  └──────────────────────────┘    │
                            └──────────────────────────────────┘
                                         │
                            ┌────────────┴────────────┐
                            ▼                         ▼
                    ┌──────────────┐        ┌──────────────────┐
                    │ Stone OAuth  │        │ Stone Connect    │
                    │ (nuvem)      │        │ (agente local    │
                    │              │        │  :9999)          │
                    └──────────────┘        └──────────────────┘
                            │                         │
                            ▼                         ▼
                    ┌──────────────────────────────────────┐
                    │           Maquininha Stone/Ton       │
                    │   (chip + senha ou aproximação)      │
                    └──────────────────────────────────────┘
```

---

## 7. Dados técnicos das tabelas

### `tef_settings`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | uuid | PK |
| `enabled` | boolean | TEF ativado |
| `mode` | `'connect' \| 'api'` | Modo de operação |
| `stone_code` | text | Código de afiliação Stone |
| `agent_url` | text | URL do agente local (modo connect) |
| `environment` | `'sandbox' \| 'production'` | Ambiente |
| `auto_print_receipt` | boolean | Imprimir comprovante automático |

### `tef_transactions`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | uuid | PK |
| `order_id` | uuid | FK para orders |
| `amount` | numeric | Valor da transação |
| `installments` | int | Parcelas |
| `payment_method` | text | credit/debit/pix/voucher |
| `status` | text | pending/approved/declined/error |
| `nsu` | text | NSU da transação |
| `authorization_code` | text | Código de autorização |
| `card_brand` | text | Bandeira (VISA, MASTERCARD, etc) |
| `card_last_digits` | text | Últimos 4 dígitos do cartão |
| `error_message` | text | Mensagem de erro (se houver) |
| `raw_response` | jsonb | Resposta completa da Stone |
| `performed_by` | uuid | FK para profiles (quem operou) |
