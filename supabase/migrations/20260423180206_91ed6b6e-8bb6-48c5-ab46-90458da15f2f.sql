
-- Atualizar NCMs por categoria + palavras-chave no nome
-- Regras baseadas nos NCMs fornecidos pelo usuário

-- ============ CATEGORIA: VARAS ============
UPDATE public.products SET ncm = '9507.10.00'
WHERE category = 'Varas' AND (ncm IS NULL OR ncm = '');

-- ============ CATEGORIA: MOLINETES E CARRETILHAS ============
UPDATE public.products SET ncm = '9507.30.00'
WHERE category = 'Molinetes e Carretilhas' AND (ncm IS NULL OR ncm = '');

-- ============ CATEGORIA: ANZÓIS ============
UPDATE public.products SET ncm = '9507.20.00'
WHERE category = 'Anzóis' AND (ncm IS NULL OR ncm = '');

-- ============ CATEGORIA: ISCAS ============
UPDATE public.products SET ncm = '9507.90.00'
WHERE category = 'Iscas' AND (ncm IS NULL OR ncm = '');

-- ============ CATEGORIA: LINHAS ============
-- Chumbada de chumbo
UPDATE public.products SET ncm = '7806.00.00'
WHERE category = 'Linhas'
  AND (ncm IS NULL OR ncm = '')
  AND (UPPER(name) LIKE '%CHUMBAD%' OR UPPER(name) LIKE '%CHUMBO%');
-- Demais linhas
UPDATE public.products SET ncm = '9507.90.00'
WHERE category = 'Linhas' AND (ncm IS NULL OR ncm = '');

-- ============ CATEGORIA: ACESSÓRIOS (regras por palavra-chave) ============
-- Alicates
UPDATE public.products SET ncm = '8203.20.10'
WHERE category = 'Acessórios' AND (ncm IS NULL OR ncm = '')
  AND UPPER(name) LIKE '%ALICATE%';

-- Facas e facões / canivetes
UPDATE public.products SET ncm = '8211.92.10'
WHERE category = 'Acessórios' AND (ncm IS NULL OR ncm = '')
  AND (UPPER(name) LIKE '%FACA%' OR UPPER(name) LIKE 'FAÇÃO%' OR UPPER(name) LIKE '%FACAO%' OR UPPER(name) LIKE '%CANIVETE%');

-- Lanternas
UPDATE public.products SET ncm = '8513.10.10'
WHERE category = 'Acessórios' AND (ncm IS NULL OR ncm = '')
  AND UPPER(name) LIKE '%LANTERNA%';

-- Balanças
UPDATE public.products SET ncm = '8423.81.10'
WHERE category = 'Acessórios' AND (ncm IS NULL OR ncm = '')
  AND UPPER(name) LIKE '%BALANC%';

-- Bússolas
UPDATE public.products SET ncm = '9014.10.00'
WHERE category = 'Acessórios' AND (ncm IS NULL OR ncm = '')
  AND (UPPER(name) LIKE '%BUSSOL%' OR UPPER(name) LIKE '%BÚSSOL%');

-- Guarda-sol
UPDATE public.products SET ncm = '6601.10.00'
WHERE category = 'Acessórios' AND (ncm IS NULL OR ncm = '')
  AND UPPER(name) LIKE '%GUARDA%SOL%';

-- Colchões infláveis
UPDATE public.products SET ncm = '3926.90.90'
WHERE category = 'Acessórios' AND (ncm IS NULL OR ncm = '')
  AND (UPPER(name) LIKE '%COLCH%INFLAV%' OR UPPER(name) LIKE '%COLCH%INFLÁV%');

-- Caixas e estojos plásticos
UPDATE public.products SET ncm = '3923.10.90'
WHERE category = 'Acessórios' AND (ncm IS NULL OR ncm = '')
  AND (UPPER(name) LIKE '%CAIXA%' OR UPPER(name) LIKE '%CAIZA%' OR UPPER(name) LIKE '%ESTOJO%');

-- Chumbadas / chumbos
UPDATE public.products SET ncm = '7806.00.00'
WHERE category = 'Acessórios' AND (ncm IS NULL OR ncm = '')
  AND (UPPER(name) LIKE '%CHUMBAD%' OR UPPER(name) LIKE '%CHUMBO%');

-- Anzóis dentro de Acessórios
UPDATE public.products SET ncm = '9507.20.00'
WHERE category = 'Acessórios' AND (ncm IS NULL OR ncm = '')
  AND UPPER(name) LIKE '%ANZOL%';

-- Iscas/girador/snap/conector dentro de Acessórios → artigos de pesca
UPDATE public.products SET ncm = '9507.90.00'
WHERE category = 'Acessórios' AND (ncm IS NULL OR ncm = '')
  AND (UPPER(name) LIKE '%ISCA%' OR UPPER(name) LIKE '%GIRADOR%' OR UPPER(name) LIKE '%SNAP%'
       OR UPPER(name) LIKE '%CONECTOR%' OR UPPER(name) LIKE '%BOIA%' OR UPPER(name) LIKE '%EMPATE%'
       OR UPPER(name) LIKE '%LINHA%' OR UPPER(name) LIKE '%CARRETILHA%' OR UPPER(name) LIKE '%MOLINETE%');

-- Bolsas/capas/cadeiras/barracas/coletes etc → resto de plástico/têxtil → manter como artigo de pesca/camping genérico
UPDATE public.products SET ncm = '9507.90.00'
WHERE category = 'Acessórios' AND (ncm IS NULL OR ncm = '')
  AND (UPPER(name) LIKE '%BOLSA%' OR UPPER(name) LIKE '%CAPA%' OR UPPER(name) LIKE '%PORTA VARA%');

-- Demais acessórios sem match → fallback para artigos de pesca
UPDATE public.products SET ncm = '9507.90.00'
WHERE category = 'Acessórios' AND (ncm IS NULL OR ncm = '');

-- ============ CATEGORIA: VARIEDADES ============
-- Pilhas e baterias
UPDATE public.products SET ncm = '8506.10.10'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND (UPPER(name) LIKE '%PILHA%' OR UPPER(name) LIKE '%BATERIA%');

-- Discos de corte/desbaste
UPDATE public.products SET ncm = '6804.22.11'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND UPPER(name) LIKE '%DISCO%';

-- Fitas isolantes/crepe
UPDATE public.products SET ncm = '3919.10.10'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND UPPER(name) LIKE '%FITA%';

-- Carabinas e pistolas de pressão
UPDATE public.products SET ncm = '9304.00.00'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND (UPPER(name) LIKE '%CARABINA%' OR UPPER(name) LIKE '%PISTOLA%' OR UPPER(name) LIKE '%PRESSAO%' OR UPPER(name) LIKE '%PRESSÃO%');

-- Chumbinhos / projéteis
UPDATE public.products SET ncm = '9306.29.00'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND (UPPER(name) LIKE '%CHUMBINHO%' OR UPPER(name) LIKE '%PROJETIL%' OR UPPER(name) LIKE '%PROJÉTIL%');

-- Garrafas térmicas
UPDATE public.products SET ncm = '9617.00.10'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND (UPPER(name) LIKE '%GARRAFA%TERM%' OR UPPER(name) LIKE '%GARRAFA%TÉRM%' OR UPPER(name) LIKE '%TERMICA%' OR UPPER(name) LIKE '%TÉRMICA%');

-- SSD / Pendrives
UPDATE public.products SET ncm = '8523.51.10'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND (UPPER(name) LIKE '%SSD%' OR UPPER(name) LIKE '%PENDRIVE%' OR UPPER(name) LIKE '%PEN DRIVE%');

-- Facas/canivetes em variedades
UPDATE public.products SET ncm = '8211.92.10'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND (UPPER(name) LIKE '%FACA%' OR UPPER(name) LIKE '%CANIVETE%' OR UPPER(name) LIKE 'FAÇÃO%' OR UPPER(name) LIKE '%FACAO%');

-- Lanternas em variedades
UPDATE public.products SET ncm = '8513.10.10'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND UPPER(name) LIKE '%LANTERNA%';

-- Alicates em variedades
UPDATE public.products SET ncm = '8203.20.10'
WHERE category = 'Variedades' AND (ncm IS NULL OR ncm = '')
  AND UPPER(name) LIKE '%ALICATE%';
