# Design: OTP em modal no signup e remoção da página /verificar-telefone

Data: 2026-08-28
Status: aprovado (abordagem A)

## Objetivo

Substituir o redirecionamento para a página `/verificar-telefone` por modal OTP
em todos os fluxos que ainda usam a página, e remover a página, a rota e seus
testes.

## Contexto atual

Fluxos que redirecionam para `/verificar-telefone`:

| Origem | Arquivo:linha | ctx | Logado? | OTP já enviado? |
|--------|---------------|-----|---------|-----------------|
| Cadastro | `src/pages/Auth.tsx:95` | signup | não | sim (GoTrue envia no `signUp`) |
| Recuperação de senha | `src/pages/ForgotPassword.tsx:45` | recovery | não | sim (GoTrue envia no `sendRecoveryOtp`) |
| Checkout legado | `src/components/Checkout.tsx:543` | checkout | sim | não — **código morto, não importado** |

O modal `OtpVerificationDialog` (`src/components/OtpVerificationDialog.tsx`) já
existe e é usado por `CheckoutEntrega.tsx` (guarda do checkout) e
`AccountContactChannels.tsx` (troca de telefone). Ele **não suporta** o modo
"código já enviado pela origem", necessário em signup/recovery.

`ctx=login`, `ctx=reauth` e `ctx=phone_change` só existem em testes — não há
produção gerando esses redirects.

## Abordagem escolhida

Reutilizar `OtpVerificationDialog` em todos os fluxos e remover a página.

### 1. `OtpVerificationDialog.tsx` — nova prop `alreadySent`

- Adicionar `alreadySent?: boolean` em `OtpVerificationDialogProps` e em
  `OtpFormProps`, repassado a `useOtpVerification`.
- Semântica idêntica à da página atual: sem auto-send no mount, cooldown de
  reenvio (60s) já ativo. Reenvio de deslogado usa `sendRecoveryOtp` (comportamento
  já existente no hook `useOtpVerification.ts:70-74`).
- Padrão: `false` — nenhum caller existente (checkout, conta) muda de comportamento.

### 2. `Auth.tsx` (cadastro)

- Novo estado: `otpDialogOpen: boolean` e `otpPhone: string`.
- Em `handleSignup`, após `signUp` sem erro: `setOtpPhone(signupPhone)` +
  `setOtpDialogOpen(true)` — **sem** `navigate`.
- Dialog com `alreadySent` e `onSuccess={() => navigate(redirectTo)}`.
- Fechar sem verificar mantém o usuário na página `/auth` (sem redirect).
- O efeito existente `if (user) navigate(redirectTo, { replace: true })`
  continua ativo como redundância inofensiva quando o login efetiva.

### 3. `ForgotPassword.tsx` (recuperação)

- Novo estado: `otpDialogOpen: boolean` e `otpPhone: string`.
- Em `handlePhoneSubmit`, após `sendRecoveryOtp` sem erro: abrir o dialog em
  vez de `navigate`.
- Dialog com `alreadySent` e `onSuccess={() => navigate('/reset-password')}`.
- O tab de e-mail (`resetPassword`) não muda.

### 4. Remoções

- `src/pages/VerificarTelefone.tsx` — deletar.
- Rota `/verificar-telefone` em `src/App.tsx` (linha 123) e lazy import
  (linha 48) — remover.
- `src/pages/__tests__/VerificarTelefone.test.tsx` — deletar.
- `src/components/Checkout.tsx` (legado, não importado) — **fora de escopo**;
  fica como está.

## Testes (TDD)

1. `src/components/__tests__/OtpVerificationDialog.test.tsx`:
   - `alreadySent: true` → `sendPhoneOtp` **não** é chamado no mount; botão
     "Reenviar" começa desabilitado com cooldown.
2. `src/pages/__tests__/Auth.test.tsx`:
   - Signup com sucesso → dialog abre (não navega para `/verificar-telefone`);
     código de 6 dígitos → `verifyPhoneOtp` chamado com o telefone → `navigate`
     para `redirect`.
   - Mock de `useAuth` ganha `verifyPhoneOtp`.
3. `src/pages/__tests__/ForgotPassword.test.tsx`:
   - Recuperação via WhatsApp com sucesso → dialog abre; código → `navigate`
     para `/reset-password`.

## Fora de escopo

- `CheckoutEntrega`, `AccountContactChannels` (já usam o modal).
- `src/components/Checkout.tsx` (código morto).
- Fluxo de e-mail do `ForgotPassword`.
- Links antigos para `/verificar-telefone` (bookmarks) → página 404, aceitável.