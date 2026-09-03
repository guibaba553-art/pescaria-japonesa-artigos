export interface CostGroup {
  id: string;
  name: string;
  cost: number;
}

type Client = {
  from: (table: string) => any;
};

let cache: CostGroup[] | null = null;
let inflight: Promise<CostGroup[]> | null = null;

/**
 * Busca os grupos de custo UMA única vez por sessão.
 *
 * Antes, cada `ProductEdit` montado no catálogo disparava seu próprio SELECT
 * em `cost_groups` — com centenas de produtos na lista isso gerava centenas de
 * requisições simultâneas, o navegador estourava o limite de conexões
 * (ERR_INSUFFICIENT_RESOURCES) e chamadas legítimas (ex.: carregar as variações
 * do produto) falhavam com "Failed to fetch".
 */
export async function loadCostGroups(client: Client): Promise<CostGroup[]> {
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    const { data, error } = await client
      .from('cost_groups')
      .select('id, name, cost')
      .order('name');
    if (error || !data) {
      inflight = null;
      return [];
    }
    cache = data as CostGroup[];
    inflight = null;
    return cache;
  })();

  return inflight;
}

/** Limpa o cache (usado após criar/editar grupos de custo e nos testes). */
export function resetCostGroupsCache() {
  cache = null;
  inflight = null;
}
