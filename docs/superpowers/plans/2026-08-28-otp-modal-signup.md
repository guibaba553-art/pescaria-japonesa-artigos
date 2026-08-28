# OTP em modal no signup + remoção de /verificar-telefone — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir os redirects para `/verificar-telefone` (signup e recovery) pelo modal `OtpVerificationDialog` e remover a página, a rota e seus testes.

**Architecture:** Reutilizar o `OtpVerificationDialog` existente, adicionando a prop `alreadySent` (código já enviado pela origem — sem auto-send, cooldown ativo). `Auth.tsx` e `ForgotPassword.tsx` passam a abrir o dialog em vez de navegar; a página `VerificarTelefone` é deletada junto com sua rota e testes.

**Tech Stack:** React 18 + TypeScript 5 + Vite (SWC), Vitest + jsdom, shadcn/ui (Dialog), Supabase GoTrue (signInWithOtp auto-send no signUp/recover).

## Global Constraints

- TDD é obrigatório: teste que falha primeiro, depois a implementação (AGENTS.md).
- Alias `@/` = `src/`.
- Não adicionar comentários em código.
- Suíte frontend: `npx vitest run` (jsdom). Não rodar `npm run test:functions` (requer supabase start).
- Commits conventional: `feat(auth): ...`, `test(auth): ...`, `chore: ...`.
- Antes de atualizar o PR: `node scripts/pr-split-verify.mjs check` (bento) + `npm run lint` + `npx vitest run` completo.
- `useOtpVerification` (src/hooks/useOtpVerification.ts) já suporta `alreadySent` — NÃO alterar o hook.

---

### Task 1: Prop `alreadySent` + UX dos botões (seta Voltar e Reenviar centralizado) no OtpVerificationDialog

**Files:**
- Modify: `src/components/OtpVerificationDialog.tsx`
- Test: `src/components/__tests__/OtpVerificationDialog.test.tsx`

**Interfaces:**
- Consumes: `useOtpVerification` (src/hooks/useOtpVerification.ts) — já expõe `alreadySent`.
- Produces: `OtpVerificationDialog` com nova prop opcional `alreadySent?: boolean` (padrão `false`) — Tasks 2 e 3 usam `alreadySent` sem auto-send.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `src/components/__tests__/OtpVerificationDialog.test.tsx` (e incluir `sendRecoveryOtp` no mock de `useAuth` e `afterEach` com `vi.useRealTimers()`):

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendPhoneOtp: vi.fn(async () => ({ error: null })),
  sendRecoveryOtp: vi.fn(async () => ({ error: null })),
  verifyPhoneOtp: vi.fn(async () => ({ error: null })),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    sendPhoneOtp: mocks.sendPhoneOtp,
    sendRecoveryOtp: mocks.sendRecoveryOtp,
    verifyPhoneOtp: mocks.verifyPhoneOtp,
  }),
}));

afterEach(() => {
  vi.useRealTimers();
});
```

Novo teste:

```tsx
it('alreadySent: não envia código ao abrir e cooldown de reenvio começa ativo', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  renderDialog({ alreadySent: true });
  expect(mocks.sendPhoneOtp).not.toHaveBeenCalled();
  const resend = screen.getByRole('button', { name: /reenviar/i });
  expect(resend).toBeDisabled();
  await vi.advanceTimersByTimeAsync(61_000);
  await waitFor(() => expect(resend).not.toBeDisabled());
  await userEvent.click(resend);
  expect(mocks.sendRecoveryOtp).toHaveBeenCalledWith('66992110000');
  expect(mocks.sendPhoneOtp).not.toHaveBeenCalled();
  vi.useRealTimers();
});
```

Novos testes de UX (posicionamento dos botões):

```tsx
it('seta Voltar no topo-esquerdo fecha o modal', () => {
  const onOpenChange = vi.fn();
  renderDialog({ onOpenChange });
  fireEvent.click(screen.getByRole('button', { name: /voltar/i }));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it('botão Reenviar fica centralizado abaixo do campo de código', () => {
  renderDialog({ alreadySent: true });
  const resend = screen.getByRole('button', { name: /reenviar/i });
  const wrapper = resend.closest('div');
  expect(wrapper?.className).toContain('justify-center');
});
```

Incluir `fireEvent` no import do testing-library do arquivo de teste:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/components/__tests__/OtpVerificationDialog.test.tsx`
Expected: FAIL — `sendRecoveryOtp` não chamado (prop `alreadySent` inexistente → auto-send dispara `sendPhoneOtp` no mount); botão "Voltar" inexistente; wrapper do Reenviar sem `justify-center`.

- [ ] **Step 3: Implementar**

Em `src/components/OtpVerificationDialog.tsx`, propagar a prop até o hook e adicionar a seta Voltar:

```tsx
import { ArrowLeft } from 'lucide-react';
```

```tsx
interface OtpFormProps {
  phone: string;
  autoSend: boolean;
  alreadySent: boolean;
  onSuccess: () => void;
}

function OtpForm({ phone, autoSend, alreadySent, onSuccess }: OtpFormProps) {
  const { code, setCode, loading, canResendNow, cooldownLeft, handleResend } = useOtpVerification({
    phone,
    autoSend,
    alreadySent,
    onSuccess,
  });
```

Botão Reenviar centralizado — dentro do `return` do `OtpForm`, envolver o botão:

```tsx
      <div className="flex justify-center">
        <Button variant="ghost" size="sm" onClick={handleResend} disabled={!canResendNow}>
          {cooldownLeft > 0 ? `Reenviar em ${cooldownLeft}s` : 'Reenviar código'}
        </Button>
      </div>
```

E no componente:

```tsx
export interface OtpVerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Telefone em dígitos (10-11) — exibido formatado e normalizado internamente */
  phone: string;
  title?: string;
  description?: string;
  /** Dispara o OTP automaticamente ao abrir (checkout/phone_change/reauth) */
  autoSend?: boolean;
  /** Código já enviado pela origem (signup/recovery): sem auto-send, cooldown ativo */
  alreadySent?: boolean;
  onSuccess?: () => void;
}

export function OtpVerificationDialog({
  open,
  onOpenChange,
  phone,
  title = 'Confirme seu telefone',
  description,
  autoSend = false,
  alreadySent = false,
  onSuccess,
}: OtpVerificationDialogProps) {
  const handleSuccess = () => {
    // Fecha ANTES do onSuccess: o caller pode reabrir encadeando o próximo
    // passo (ex.: reauth → OTP do novo número) no mesmo tick.
    onOpenChange(false);
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 -mt-1 w-fit text-muted-foreground hover:text-foreground"
            onClick={() => onOpenChange(false)}
            aria-label="Voltar"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ??
              `Enviamos um código de 6 dígitos para ${formatPhone(toLocalDigits(phone))} no WhatsApp.`}
          </DialogDescription>
        </DialogHeader>
        {/* Remount a cada abertura: estado limpo + auto-send novo */}
        {open && <OtpForm key={phone} phone={phone} autoSend={autoSend} alreadySent={alreadySent} onSuccess={handleSuccess} />}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run src/components/__tests__/OtpVerificationDialog.test.tsx`
Expected: PASS (todos os testes do arquivo, incluindo os existentes).

- [ ] **Step 5: Commit**

```bash
git add src/components/OtpVerificationDialog.tsx src/components/__tests__/OtpVerificationDialog.test.tsx
git commit -m "feat(auth): OtpVerificationDialog com alreadySent e UX de botões (seta Voltar, reenviar centralizado)"
```

---

### Task 2: Signup abre modal OTP em vez de redirecionar

**Files:**
- Modify: `src/pages/Auth.tsx` (import + estado + handleSignup + JSX do dialog)
- Test: `src/pages/__tests__/Auth.test.tsx`

**Interfaces:**
- Consumes: `OtpVerificationDialog` com `alreadySent` (Task 1).
- Produces: Comportamento — signup sem erro abre o dialog; código válido navega para `redirect`.

- [ ] **Step 1: Escrever o teste que falha**

Em `src/pages/__tests__/Auth.test.tsx`, adicionar `verifyPhoneOtp` aos mocks e ao mock de `useAuth`:

```tsx
const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  signIn: vi.fn(async () => ({ error: null })),
  signUp: vi.fn(async () => ({ error: null })),
  sendPhoneOtp: vi.fn(async () => ({ error: null })),
  verifyPhoneOtp: vi.fn(async () => ({ error: null })),
  toastError: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    signIn: mocks.signIn,
    signUp: mocks.signUp,
    sendPhoneOtp: mocks.sendPhoneOtp,
    verifyPhoneOtp: mocks.verifyPhoneOtp,
  }),
}));
```

Substituir o teste existente `chama signUp com telefone e navega para /verificar-telefone` por:

```tsx
it('chama signUp com telefone e abre modal OTP; código verifica e navega para o redirect', async () => {
  renderPage('?redirect=/perfil');
  await userEvent.click(screen.getByRole('tab', { name: /criar conta/i }));
  await fillSignupForm();
  fireEvent.click(screen.getByRole('button', { name: /criar conta grátis/i }));
  await waitFor(() =>
    expect(mocks.signUp).toHaveBeenCalledWith('66992110000', 'secret123', 'Gus Anglers', '52998224725'),
  );
  expect(mocks.navigate).not.toHaveBeenCalledWith(expect.stringContaining('/verificar-telefone'));

  const codeInput = await screen.findByLabelText(/código/i);
  expect(codeInput).toBeInTheDocument();
  await userEvent.type(codeInput, '123456');
  await waitFor(() => expect(mocks.verifyPhoneOtp).toHaveBeenCalledWith('66992110000', '123456'));
  await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/perfil'));
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/pages/__tests__/Auth.test.tsx`
Expected: FAIL — nenhum campo "Código" aparece (`signUp` atual navega para `/verificar-telefone`).

- [ ] **Step 3: Implementar**

Em `src/pages/Auth.tsx`:

```tsx
import { OtpVerificationDialog } from '@/components/OtpVerificationDialog';
```

Estado (junto aos demais `useState`):

```tsx
const [otpDialogOpen, setOtpDialogOpen] = useState(false);
const [otpPhone, setOtpPhone] = useState('');
```

`handleSignup` — substituir o `navigate`:

```tsx
    if (!error) {
      setOtpPhone(signupPhone);
      setOtpDialogOpen(true);
    }
```

Dialog ao final do JSX retornado (antes do `</div>` final):

```tsx
      <OtpVerificationDialog
        open={otpDialogOpen}
        onOpenChange={setOtpDialogOpen}
        phone={otpPhone}
        alreadySent
        onSuccess={() => navigate(redirectTo)}
      />
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/pages/__tests__/Auth.test.tsx`
Expected: PASS (todos os testes do arquivo, incluindo `PHONE_ALREADY_EXISTS`).

- [ ] **Step 5: Commit**

```bash
git add src/pages/Auth.tsx src/pages/__tests__/Auth.test.tsx
git commit -m "feat(auth): signup abre modal OTP em vez de redirecionar para /verificar-telefone"
```

---

### Task 3: Recuperação de senha abre modal OTP em vez de redirecionar

**Files:**
- Modify: `src/pages/ForgotPassword.tsx` (import + estado + handlePhoneSubmit + JSX do dialog)
- Test: `src/pages/__tests__/ForgotPassword.test.tsx`

**Interfaces:**
- Consumes: `OtpVerificationDialog` com `alreadySent` (Task 1).
- Produces: Comportamento — recuperação via WhatsApp abre o dialog; código válido navega para `/reset-password`.

- [ ] **Step 1: Escrever o teste que falha**

Em `src/pages/__tests__/ForgotPassword.test.tsx`, atualizar mocks e o teste da aba WhatsApp:

```tsx
const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  resetPassword: vi.fn(async () => ({ error: null })),
  sendRecoveryOtp: vi.fn(async () => ({ error: null })),
  verifyPhoneOtp: vi.fn(async () => ({ error: null })),
  toastError: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    resetPassword: mocks.resetPassword,
    sendRecoveryOtp: mocks.sendRecoveryOtp,
    verifyPhoneOtp: mocks.verifyPhoneOtp,
  }),
}));
```

Substituir o teste `aba WhatsApp envia OTP e navega para verificação com redirect ao reset` por:

```tsx
it('aba WhatsApp envia OTP, abre modal e navega para /reset-password após verificar', async () => {
  renderPage();
  await userEvent.click(screen.getByRole('tab', { name: /whatsapp/i }));
  await userEvent.type(screen.getByPlaceholderText('(00) 00000-0000'), '66992110000');
  fireEvent.click(screen.getByRole('button', { name: /recuperar via whatsapp/i }));
  await waitFor(() => expect(mocks.sendRecoveryOtp).toHaveBeenCalledWith('66992110000'));
  expect(mocks.navigate).not.toHaveBeenCalledWith(expect.stringContaining('/verificar-telefone'));

  const codeInput = await screen.findByLabelText(/código/i);
  expect(codeInput).toBeInTheDocument();
  await userEvent.type(codeInput, '123456');
  await waitFor(() => expect(mocks.verifyPhoneOtp).toHaveBeenCalledWith('66992110000', '123456'));
  await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/reset-password'));
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/pages/__tests__/ForgotPassword.test.tsx`
Expected: FAIL — nenhum campo "Código" aparece.

- [ ] **Step 3: Implementar**

Em `src/pages/ForgotPassword.tsx`:

```tsx
import { OtpVerificationDialog } from "@/components/OtpVerificationDialog";
```

Estado:

```tsx
const [otpDialogOpen, setOtpDialogOpen] = useState(false);
const [otpPhone, setOtpPhone] = useState("");
```

`handlePhoneSubmit` — substituir o `navigate`:

```tsx
    setLoading(false);
    if (!error) {
      setOtpPhone(digits);
      setOtpDialogOpen(true);
    }
```

Dialog ao final do JSX retornado (após `</Card>`, antes do `</div>` final):

```tsx
      <OtpVerificationDialog
        open={otpDialogOpen}
        onOpenChange={setOtpDialogOpen}
        phone={otpPhone}
        alreadySent
        onSuccess={() => navigate("/reset-password")}
      />
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/pages/__tests__/ForgotPassword.test.tsx`
Expected: PASS (todos os testes do arquivo, incluindo e-mail e telefone inválido).

- [ ] **Step 5: Commit**

```bash
git add src/pages/ForgotPassword.tsx src/pages/__tests__/ForgotPassword.test.tsx
git commit -m "feat(auth): recuperação de senha abre modal OTP em vez de redirecionar"
```

---

### Task 4: Remover página /verificar-telefone, rota e testes

**Files:**
- Delete: `src/pages/VerificarTelefone.tsx`
- Delete: `src/pages/__tests__/VerificarTelefone.test.tsx`
- Modify: `src/App.tsx` (lazy import linha 48 + rota linha 123)

**Interfaces:**
- Nenhum caller restante (Tasks 2 e 3 eliminaram os redirects; `ctx=login/reauth/phone_change` só existiam em testes).

- [ ] **Step 1: Remover o código**

Em `src/App.tsx`:

```diff
-const VerificarTelefone = lazy(() => import("./pages/VerificarTelefone"));
```

```diff
-                <Route path="/verificar-telefone" element={<VerificarTelefone />} />
```

Deletar os arquivos:

```bash
git rm src/pages/VerificarTelefone.tsx src/pages/__tests__/VerificarTelefone.test.tsx
```

- [ ] **Step 2: Confirmar que nenhum caller restante referencia a página**

Run: `rg "verificar-telefone" src --type ts --type tsx -l`
Expected: nenhum resultado em `src/` (apenas o spec markdown em `docs/` e referências de teste já removidas).

- [ ] **Step 3: Rodar suíte frontend completa**

Run: `npx vitest run`
Expected: PASS — 559 testes, zero referências a `VerificarTelefone`.

- [ ] **Step 4: Lint + typecheck**

Run: `npm run lint`
Run: `npx tsc --noEmit`
Expected: ambos sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "refactor(auth): remove página /verificar-telefone (OTP agora em modal)"
```

---

### Task 5: Verificação final do PR (bento + suíte)

- [ ] **Step 1: Bento check**

Run: `node scripts/pr-split-verify.mjs check`
Expected: OK (sem bloqueio de diff). Se o diff ultrapassar `.pr-limits.yaml`, parar e avisar o usuário para decidir sobre split.

- [ ] **Step 2: Suíte completa + lint**

Run: `npx vitest run && npm run lint`
Expected: PASS + sem erros.

- [ ] **Step 3: Push da branch**

Run: `git push`
Expected: branch `feat/auth-whatsapp-otp-pr` atualizada — PR #44 ganha os novos commits.