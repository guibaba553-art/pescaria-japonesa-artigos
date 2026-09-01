// Busca todas as linhas de uma query paginando com .range(),
// contornando o limite padrão de 1000 linhas do PostgREST.
export type PagedSource<T> = (
  from: number,
  to: number,
) => Promise<{ data: T[] | null; error: unknown }>;

export async function fetchAllPaged<T>(
  source: PagedSource<T>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  // Trava de segurança: no máximo 100 páginas (100k linhas).
  for (let page = 0; page < 100; page++) {
    const { data, error } = await source(from, from + pageSize - 1);
    if (error) return page === 0 ? [] : all;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
