## Mudança

No `src/components/Header.tsx`, substituir o texto fixo "Conta" do botão (linha 226) por uma saudação personalizada quando o usuário estiver logado: **"Olá, {primeiroNome}"**.

## Como obter o nome

1. Buscar o `full_name` da tabela `profiles` (mesma fonte usada em `MyProfile.tsx`) via `supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()` dentro de um `useEffect` no Header.
2. Fallbacks em ordem:
   - `user.user_metadata.full_name` (preenchido no signup e no login Google)
   - parte antes do `@` do e-mail
3. Exibir só o **primeiro nome** (`fullName.split(' ')[0]`) para caber bem no botão.
4. Em telas muito estreitas (`sm`), truncar com `max-w-[120px] truncate` para não quebrar layout.

## Onde NÃO mudar

- `MobileBottomNav.tsx` mantém o label curto "Conta" — o espaço da bottom nav é pequeno e "Olá, Fulano" não cabe. (Posso revisar isso se você quiser também.)
- A rota `/conta` e o restante do fluxo continuam iguais.

## Resultado visual

Antes: `👤 Conta`
Depois: `👤 Olá, Roberto`
