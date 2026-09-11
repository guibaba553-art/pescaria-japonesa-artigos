# Análise de produtos no Dashboard

## Objetivo
Adicionar uma nova aba **Produtos** no Dashboard para analisar vendas por produto específico ou por grupo/categoria, respeitando o período já selecionado no painel.

## O que será criado
- Nova aba principal **Produtos** ao lado das áreas atuais do Dashboard.
- Seletor de análise por **Produto** ou **Grupo**.
- Campo de busca e seleção do produto ou grupo desejado.
- Resumo com **quantidade vendida**, **receita**, **número de vendas** e **preço médio**.
- Gráfico da quantidade vendida ao longo do período.
- Tabela detalhada por produto; ao analisar um grupo, mostrará quais produtos mais venderam.
- Filtro por origem: **Todos**, **PDV** ou **Site**.
- Estado vazio claro quando não houver vendas no período.

## Regras dos dados
- Usar apenas vendas concluídas conforme as regras atuais do Dashboard.
- Considerar os vínculos muitos-para-muitos de produtos com grupos, incluindo produtos associados diretamente ao grupo selecionado.
- Somar as quantidades reais dos itens vendidos, incluindo variações no produto correspondente.
- Reutilizar o filtro global de datas do Dashboard.

## Qualidade
- Criar primeiro testes para a agregação por produto, grupo, período e origem.
- Manter a área adaptada para celular e computador.
- Validar testes, compilação e a tela funcionando no preview.

## Detalhes técnicos
- Isolar o cálculo em uma função pura testável.
- Criar um componente próprio para a nova análise, evitando aumentar ainda mais a lógica do Dashboard.
- Buscar pedidos, itens, produtos, categorias e vínculos paginados para não truncar resultados acima de 1.000 registros.
