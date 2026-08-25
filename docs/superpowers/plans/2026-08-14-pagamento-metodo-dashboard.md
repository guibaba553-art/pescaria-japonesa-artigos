# Exibir forma de pagamento escolhida no dashboard de pedidos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gravar `payment_method` + `payment_gateway` na criação do pedido em `CheckoutEntrega.tsx` para que o dashboard `/admin/pedidos` sempre exiba a forma de pagamento escolhida, mesmo sem pagamento confirmado.

**Architecture:** O pedido hoje é criado sem esses campos — as edge functions os gravam só quando o pagamento é iniciado. Vamos gravá-los no INSERT usando valores já determinados no checkout: `selectedPayment` (forma) e `selectPixGateway(total)` (gateway do PIX, mesma função que decide a edge function chamada em seguida). Cartão → gateway sempre `'asaas'`. O dashboard (`OrdersManagement.tsx:610`) já renderiza os dois campos — nenhuma alteração lá.

**Tech Stack:** React 18 + TypeScript + Vitest (jsdom) + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-14-pagamento-metodo-dashboard-design.md`

## Global Constraints

- TDD obrigatório (AGENTS.md): teste vermelho primeiro, depois implementação.
- Nenhuma alteração nas edge functions nem no dashboard.
- Nenhum comentário novo no código de produção.
- Comandos de verificação: `npx vitest run src/pages/__tests__/CheckoutEntrega.test.tsx` e `npm run lint`.

---

### Task 1: Testes — gravação de forma de pagamento na criação do pedido

**Files:**
- Modify: `src/pages/__tests__/CheckoutEntrega.test.tsx`

**Interfaces:**
- Produces: variável de módulo `mockCartTotal` (usada pela Task 2 para variar o total), captura `capturedOrdersInsert` do payload do INSERT em `orders`, e mock do `CreditCardForm` com handle `getData` via `forwardRef`. Nenhuma outra task consome essas interfaces — esta task e a Task 2 são o mesmo arquivo de teste + fonte.

- [ ] **Step 1: Tornar o total do carrinho mutável no mock de `useCart`**

No arquivo `src/pages/__tests__/CheckoutEntrega.test.tsx`, adicionar antes do `vi.mock('@/hooks/useCart', ...)` (após a linha 26):

```tsx
let mockCartTotal = 100;
```

E substituir o bloco `vi.mock('@/hooks/useCart', () => ({...}))` (linhas 27–41) por:

```tsx
vi.mock('@/hooks/useCart', () => ({
  useCart: () => ({
    items: [
      { cartItemKey: 'item-1', id: 'prod-1', name: 'Produto Teste', price: mockCartTotal, quantity: 1, image_url: null },
    ],
    total: mockCartTotal,
    itemCount: 1,
    clearCart: vi.fn(),
    addItem: vi.fn(),
    removeItem: vi.fn(),
    updateQuantity: vi.fn(),
    lastAddedKey: null,
    clearLastAdded: vi.fn(),
  }),
}));
```

- [ ] **Step 2: Adicionar captura do INSERT em `orders` ao mock do supabase**

Substituir o bloco `vi.mock('@/integrations/supabase/client', ...)` (linhas 47–60) por:

```tsx
// Mock do supabase
const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    functions: {
      invoke: vi.fn(),
    },
    rpc: (...args: any[]) => mockRpc(...args),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
  },
}));
```

**IMPORTANTE:** `capturedOrdersInsert` precisa ser visível nos `it()` — declarar como `let` **fora** do `beforeEach`, no escopo do módulo (junto de `const mockFrom = vi.fn();`):

```tsx
let currentFromTable = '';
let capturedOrdersInsert: any = null;
```

E dentro do `beforeEach`, substituir `mockFrom.mockReturnValue(mockChain);` (linha 156) por:

```tsx
  mockFrom.mockImplementation((table: string) => {
    currentFromTable = table;
    return mockChain;
  });
  mockChain.insert = vi.fn().mockImplementation((payload: any) => {
    if (currentFromTable === 'orders') capturedOrdersInsert = payload;
    return mockChain;
  });
  mockChain.single = vi.fn().mockResolvedValue({ data: { id: 'order-1' }, error: null });
  capturedOrdersInsert = null;
  mockCartTotal = 100;
```

E no mesmo `beforeEach`, definir o mock padrão de `functions.invoke` (após a linha 159 `mockRpc.mockResolvedValue({ data: 999, error: null });`):

```tsx
  (supabase.functions.invoke as any).mockResolvedValue({
    data: { success: true, data: { brCode: '000201...', brCodeBase64: 'iVBOR...', expiresAt: new Date().toISOString() } },
    error: null,
  });
```

- [ ] **Step 3: Atualizar o mock do `CreditCardForm` para expor o handle `getData`**

Substituir o bloco `vi.mock('@/components/CreditCardForm', ...)` (linhas 91–108) por:

```tsx
vi.mock('@/components/CreditCardForm', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  const mockCardData = {
    installmentCount: 1,
    saveCard: false,
    creditCard: { number: '4111111111111111', holderName: 'Teste', expiry: '12/30', cvv: '123' },
    creditCardHolderInfo: { name: 'Teste', cpfCnpj: '12345678901', email: 'teste@test.com', phone: '11999999999' },
  };
  const CreditCardForm = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ getData: () => mockCardData, validate: () => [] }));
    return (
      <div data-testid="credit-card-form">
        <span>Cartão de Crédito (mock)</span>
        <button
          data-testid="mock-submit"
          onClick={() => props.onInstallmentChange?.(1)}
          disabled={props.loading}
        >
          Pagar
        </button>
        {props.error && <span data-testid="card-error">{props.error}</span>}
      </div>
    );
  });
  return { CreditCardForm, CreditCardFormHandle: {} };
});
```

- [ ] **Step 4: Adicionar os 3 testes novos no fim do arquivo**

Adicionar após o último `describe` (após a linha 260):

```tsx
describe('CheckoutEntrega — grava forma de pagamento na criação do pedido', () => {
  it('PIX < R$ 201: grava payment_method=pix e payment_gateway=mercadopago', async () => {
    render(
      <MemoryRouter>
        <CheckoutEntrega />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Finalizar pedido'));

    await waitFor(() => {
      expect(screen.getByTestId('pix-dialog')).toBeInTheDocument();
    });

    expect(capturedOrdersInsert).toMatchObject({
      payment_method: 'pix',
      payment_gateway: 'mercadopago',
    });
  });

  it('PIX >= R$ 201: grava payment_method=pix e payment_gateway=asaas', async () => {
    mockCartTotal = 300;

    render(
      <MemoryRouter>
        <CheckoutEntrega />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Finalizar pedido'));

    await waitFor(() => {
      expect(screen.getByTestId('pix-dialog')).toBeInTheDocument();
    });

    expect(capturedOrdersInsert).toMatchObject({
      payment_method: 'pix',
      payment_gateway: 'asaas',
    });
  });

  it('Cartão: grava payment_method=credit_card e payment_gateway=asaas', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: { success: true, paymentStatus: 'PENDING' },
      error: null,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ ip: '127.0.0.1' }) }));

    render(
      <MemoryRouter>
        <CheckoutEntrega />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Cartão de Crédito'));
    await waitFor(() => {
      expect(screen.getByTestId('credit-card-form')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Finalizar pedido'));

    await waitFor(() => {
      expect(capturedOrdersInsert).not.toBeNull();
    });

    expect(capturedOrdersInsert).toMatchObject({
      payment_method: 'credit_card',
      payment_gateway: 'asaas',
    });
  });
});
```

- [ ] **Step 5: Rodar os testes e verificar que falham (vermelho)**

Run: `npx vitest run src/pages/__tests__/CheckoutEntrega.test.tsx`
Expected: os 3 testes novos FALHAM (o INSERT ainda não contém `payment_method`/`payment_gateway` → `toMatchObject` não bate), os testes existentes PASSAM.

- [ ] **Step 6: Commit**

```bash
git add src/pages/__tests__/CheckoutEntrega.test.tsx
git commit -m "test: gravação de forma de pagamento na criação do pedido (vermelho)"
```

---

### Task 2: Gravar `payment_method` + `payment_gateway` no INSERT do pedido

**Files:**
- Modify: `src/pages/CheckoutEntrega.tsx:552-575` (INSERT em `orders`)

**Interfaces:**
- Consumes: `selectPixGateway` (já importado e usado na linha 634), estado `selectedPayment: 'pix' | 'credit_card'` (linha 101), `total` e `displayFreteValor` (já usados na linha 556).

- [ ] **Step 1: Rodar o teste novo para confirmar o estado vermelho (se a Task 1 não foi executada nesta sessão)**

Run: `npx vitest run src/pages/__tests__/CheckoutEntrega.test.tsx`
Expected: os 3 testes de "grava forma de pagamento" FALHAM.

- [ ] **Step 2: Implementar — adicionar os campos ao INSERT**

Em `src/pages/CheckoutEntrega.tsx`, no objeto passado a `.from('orders').insert({...})` (linhas 554–573), adicionar antes do fechamento do objeto, após `shipping_service_id: meServiceId,`:

```tsx
          payment_method: selectedPayment === 'pix' ? 'pix' : 'credit_card',
          payment_gateway: selectedPayment === 'pix'
            ? selectPixGateway(total + displayFreteValor)
            : 'asaas',
```

- [ ] **Step 3: Rodar os testes e verificar que passam (verde)**

Run: `npx vitest run src/pages/__tests__/CheckoutEntrega.test.tsx`
Expected: 3 testes de "grava forma de pagamento" PASSAM; nenhuma regressão nos demais testes do arquivo.

- [ ] **Step 4: Rodar a suíte completa e o lint**

Run: `npm test`
Expected: todos os testes passam.

Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/pages/CheckoutEntrega.tsx
git commit -m "feat: grava forma de pagamento escolhida na criação do pedido"
```

---

## Self-Review

- **Spec coverage:** "Gravar payment_method + payment_gateway no INSERT" → Task 2; "Testes TDD" → Task 1 (3 testes: PIX mercadopago, PIX asaas, cartão); "Sem alteração no dashboard" → fora de escopo (nada a fazer); "Sem backfill" → nada a fazer. Coberto.
- **Placeholder scan:** nenhum TBD/TODO; todos os steps têm código completo.
- **Type consistency:** `selectPixGateway` retorna `'mercadopago' | 'asaas'`; `selectedPayment` é `'pix' | 'credit_card'`; `payment_method`/`payment_gateway` aceitos pelo tipo Insert de `orders` (`payment_method?: string | null` em `src/integrations/supabase/types.ts:1084`). Nomes de variáveis de teste (`mockCartTotal`, `capturedOrdersInsert`) consistentes entre Steps.
