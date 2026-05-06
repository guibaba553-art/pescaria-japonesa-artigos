-- Conceder leitura nas colunas públicas faltantes da tabela products
GRANT SELECT (
  pdv_only,
  short_description,
  price_credit_percent,
  price_debit_percent,
  price_pix_percent,
  price_cash_percent
) ON public.products TO anon, authenticated;