import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

interface CustomerData {
  name: string;
  email: string;
  cpfCnpj: string;
  phone: string;
}

interface AsaasCustomerResult {
  id: string;
  created: boolean;
}

/**
 * Busca o Customer Asaas pelo CPF ou cria um novo.
 *
 * - Se profiles.asaas_customer_id já existe, revalida com GET /v3/customers/{id}
 * - Se não existe ou foi deletado no Asaas, cria via POST /v3/customers e salva o ID em profiles
 *
 * @param supabase - Supabase client autenticado (service role)
 * @param userId - ID do usuário no Supabase Auth
 * @param data - Dados do cliente (name, email, cpfCnpj, phone)
 * @param asaasApiKey - API Key do Asaas
 * @param asaasEnv - Ambiente do Asaas ('sandbox' | 'production')
 */
export async function findOrCreateCustomer(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  data: CustomerData,
  asaasApiKey: string,
  asaasEnv: string = 'sandbox',
): Promise<AsaasCustomerResult> {
  const baseUrl = asaasEnv === 'production'
    ? 'https://api.asaas.com'
    : 'https://api-sandbox.asaas.com';

  // Headers obrigatórios Asaas
  const headers: Record<string, string> = {
    'access_token': asaasApiKey,
    'Content-Type': 'application/json',
    'User-Agent': 'JapasPesca/1.0.0',
  };

  // 1. Busca asaas_customer_id no profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('asaas_customer_id')
    .eq('id', userId)
    .single();

  // 2. Se existe, revalida no Asaas
  if (profile?.asaas_customer_id) {
    const resp = await fetch(
      `${baseUrl}/v3/customers/${profile.asaas_customer_id}`,
      { headers },
    );

    if (resp.ok) {
      const existing = await resp.json();
      return { id: existing.id, created: false };
    }

    // Se 404, o customer foi deletado — criar novo
    if (resp.status !== 404) {
      console.error('Erro ao revalidar customer Asaas:', await resp.text());
      // Continua para criar novo
    }
  }

  // 3. Criar novo customer no Asaas
  const resp = await fetch(`${baseUrl}/v3/customers`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: data.name,
      cpfCnpj: data.cpfCnpj,
      email: data.email,
      phone: data.phone,
      notificationDisabled: true,
    }),
  });

  const customer = await resp.json();

  if (!resp.ok) {
    const errorMsg = customer?.errors?.[0]?.description || 'Erro desconhecido';
    throw new Error(`Erro ao criar customer Asaas: ${errorMsg}`);
  }

  // 4. Salvar ID no profile
  await supabase
    .from('profiles')
    .update({ asaas_customer_id: customer.id })
    .eq('id', userId);

  return { id: customer.id, created: true };
}
