
-- Balanças
UPDATE public.products SET ncm = '8423.81.10'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND UPPER(name) LIKE '%BALANC%';

-- Colchão inflável
UPDATE public.products SET ncm = '3926.90.90'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND UPPER(name) LIKE '%COLCH%INFL%';

-- Bolsa
UPDATE public.products SET ncm = '4202.92.00'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND UPPER(name) LIKE '%BOLSA%';

-- Capa de chuva / guarda-chuva
UPDATE public.products SET ncm = '6601.91.00'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND (UPPER(name) LIKE '%CAPA DE CHUVA%' OR UPPER(name) LIKE '%GUARDA CHUVA%' OR UPPER(name) LIKE '%GUARDA-CHUVA%');

-- CO2 / cápsula
UPDATE public.products SET ncm = '2811.21.00'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND UPPER(name) LIKE '%CO2%';

-- HDMI / cabos / conectores eletrônicos
UPDATE public.products SET ncm = '8544.42.00'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND (UPPER(name) LIKE '%HDMI%' OR UPPER(name) LIKE '%CONECTOR%');

-- Controle remoto
UPDATE public.products SET ncm = '8526.92.00'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND UPPER(name) LIKE '%CONTROLE REMOTO%';

-- Descascador / processador / batedor / desentupidor / rebitador / tesoura
UPDATE public.products SET ncm = '8205.51.00'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND (UPPER(name) LIKE '%DESCASCADOR%' OR UPPER(name) LIKE '%PROCESSADOR%' OR UPPER(name) LIKE '%BATEDOR%'
       OR UPPER(name) LIKE '%DESENTUPIDOR%' OR UPPER(name) LIKE '%REBITADOR%' OR UPPER(name) LIKE '%TESOURA%');

-- Esferas de aço (munição)
UPDATE public.products SET ncm = '9306.29.00'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND UPPER(name) LIKE '%ESFERA%';

-- Esmerilhadeiras
UPDATE public.products SET ncm = '8467.29.91'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND UPPER(name) LIKE '%ESMERILH%';

-- Espelho lupa
UPDATE public.products SET ncm = '7009.92.00'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND UPPER(name) LIKE '%ESPELHO%';

-- Fixador de lençol (plástico)
UPDATE public.products SET ncm = '3926.90.90'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND UPPER(name) LIKE '%FIXADOR%';

-- Fogareiro
UPDATE public.products SET ncm = '7321.11.00'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND UPPER(name) LIKE '%FOGAREIRO%';

-- Lixas
UPDATE public.products SET ncm = '6805.20.00'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND UPPER(name) LIKE '%LIXA%';

-- Fones / headset
UPDATE public.products SET ncm = '8518.30.00'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND UPPER(name) LIKE '%FONE%';

-- Lixeira
UPDATE public.products SET ncm = '3924.90.00'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND UPPER(name) LIKE '%LIXEIRA%';

-- Luminária LED
UPDATE public.products SET ncm = '9405.42.90'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND UPPER(name) LIKE '%LUMINARIA%';

-- Luvas
UPDATE public.products SET ncm = '6116.93.00'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND UPPER(name) LIKE '%LUVA%';

-- Memória SD
UPDATE public.products SET ncm = '8523.51.10'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND (UPPER(name) LIKE '%MEMORIA%' OR UPPER(name) LIKE '%MEMÓRIA%' OR UPPER(name) LIKE '%CARTAO SD%' OR UPPER(name) LIKE '%CARTÃO SD%');

-- Refil de gás butano
UPDATE public.products SET ncm = '2711.13.00'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND (UPPER(name) LIKE '%BUTANO%' OR UPPER(name) LIKE '%REFIL%GAS%' OR UPPER(name) LIKE '%REFIL%GÁS%');

-- Suporte notebook
UPDATE public.products SET ncm = '8473.30.99'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND UPPER(name) LIKE '%SUPORTE%NOTBOOK%' OR (category = 'Variedades' AND (ncm IS NULL OR ncm = '') AND UPPER(name) LIKE '%SUPORTE%NOTEBOOK%');

-- Tela mosquiteira
UPDATE public.products SET ncm = '6304.91.00'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND UPPER(name) LIKE '%MOSQUITEIRA%';

-- Garrafa térmica (incluindo "TERMICO GARRAFA")
UPDATE public.products SET ncm = '9617.00.10'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND (UPPER(name) LIKE '%GARRAFA%' OR UPPER(name) LIKE '%TERMIC%' OR UPPER(name) LIKE '%TÉRMIC%');

-- Fallback genérico para qualquer item restante
UPDATE public.products SET ncm = '9603.90.00'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '');
