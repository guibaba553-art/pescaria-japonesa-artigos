-- Corrige clean install: a migration 20260715001618 popula public.brands a
-- partir de products.brand, mas nenhuma migration cria essa coluna (drift:
-- existia apenas via adição manual no banco). Nova migration preserva a
-- regra de não editar migrations existentes.
alter table public.products
  add column if not exists brand text;