import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Auth from '@/pages/Auth';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  signIn: vi.fn(async () => ({ error: null })),
  signUp: vi.fn(async () => ({ error: null })),
  sendPhoneOtp: vi.fn(async () => ({ error: null })),
  toastError: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mocks.navigate };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    signIn: mocks.signIn,
    signUp: mocks.signUp,
    sendPhoneOtp: mocks.sendPhoneOtp,
  }),
}));

vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }));

vi.mock('@/integrations/lovable/index', () => ({
  lovable: { auth: { signInWithOAuth: vi.fn(async () => ({ error: null, redirected: false })) } },
}));

function renderPage(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/auth${search}`]}>
      <Auth />
    </MemoryRouter>,
  );
}

const getIdentifierInput = () => screen.getByLabelText(/e-mail ou telefone/i) as HTMLInputElement;

async function fillSignupForm(phone = '66992110000') {
  await userEvent.type(screen.getByLabelText('Nome Completo'), 'Gus Anglers');
  await userEvent.type(screen.getByLabelText('CPF'), '52998224725');
  await userEvent.type(screen.getByLabelText('Telefone'), phone);
  await userEvent.type(screen.getByLabelText('Senha'), 'secret123');
  await userEvent.type(screen.getByLabelText('Confirmar Senha'), 'secret123');
  fireEvent.click(screen.getByLabelText(/li e aceito/i));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('Auth — login inteligente', () => {
  it('aceita e-mail e chama signIn com o identificador cru', async () => {
    renderPage();
    fireEvent.change(getIdentifierInput(), { target: { value: 'user@test.com' } });
    await userEvent.type(screen.getByLabelText('Senha'), 'secret123');
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledWith('user@test.com', 'secret123'));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/'));
  });

  it('mantém e-mail digitado caractere a caractere', async () => {
    renderPage();
    const input = getIdentifierInput();
    await userEvent.type(input, 'joao');
    expect(input).toHaveValue('joao');
    await userEvent.type(input, '@gmail.com');
    expect(input).toHaveValue('joao@gmail.com');
  });

  it('aceita telefone com máscara e preserva dígitos no estado', async () => {
    renderPage();
    await userEvent.type(getIdentifierInput(), '66992110000');
    expect(getIdentifierInput()).toHaveValue('(66) 99211-0000');
    await userEvent.type(screen.getByLabelText('Senha'), 'secret123');
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledWith('66992110000', 'secret123'));
  });

  it('"Entrar com WhatsApp" não aparece (login via WhatsApp desativado)', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: /entrar com whatsapp/i })).not.toBeInTheDocument();
  });

  it('"Esqueci minha senha" só aparece quando identificador é e-mail', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: /esqueci minha senha/i })).not.toBeInTheDocument();
    fireEvent.change(getIdentifierInput(), { target: { value: 'user@test.com' } });
    expect(screen.getByRole('button', { name: /esqueci minha senha/i })).toBeInTheDocument();
  });
});

describe('Auth — cadastro por telefone', () => {
  it('não renderiza campo de e-mail no signup', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('tab', { name: /criar conta/i }));
    expect(await screen.findByLabelText('Nome Completo')).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });

  it('chama signUp com telefone e navega para /verificar-telefone', async () => {
    renderPage('?redirect=/perfil');
    await userEvent.click(screen.getByRole('tab', { name: /criar conta/i }));
    await fillSignupForm();
    fireEvent.click(screen.getByRole('button', { name: /criar conta grátis/i }));
    await waitFor(() =>
      expect(mocks.signUp).toHaveBeenCalledWith('66992110000', 'secret123', 'Gus Anglers', '52998224725'),
    );
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith(
        '/verificar-telefone?ctx=signup&phone=66992110000&redirect=%2Fperfil',
      ),
    );
  });

  it('PHONE_ALREADY_EXISTS volta para login com telefone preenchido', async () => {
    mocks.signUp.mockResolvedValueOnce({ error: new Error('PHONE_ALREADY_EXISTS') });
    renderPage();
    await userEvent.click(screen.getByRole('tab', { name: /criar conta/i }));
    await fillSignupForm();
    fireEvent.click(screen.getByRole('button', { name: /criar conta grátis/i }));
    await screen.findByRole('tab', { name: 'Entrar' });
    expect(screen.getByRole('tab', { name: 'Entrar' })).toHaveAttribute('aria-selected', 'true');
    expect(getIdentifierInput()).toHaveValue('(66) 99211-0000');
    expect(mocks.navigate).not.toHaveBeenCalledWith(expect.stringContaining('/verificar-telefone'));
  });
});
