# Filtro progressivo de produtos

## Objetivo
Substituir a lista aberta de marcas e subcategorias por um único botão **Filtros**, que abre uma janela organizada e guia a escolha por etapas.

## Fluxo
1. A janela começa mostrando as categorias principais, como **Varas**.
2. Depois da categoria, mostra somente as marcas disponíveis nela, como **Marine Sports**.
3. Em seguida, mostra somente as subcategorias do próximo nível, como **15–17 lb**.
4. Após cada escolha, avança para os filhos diretos do nível selecionado, como **1,80 m**, até não haver outro nível.
5. O caminho escolhido fica visível e clicável para voltar a qualquer etapa.
6. Os filtros ativos ficam resumidos perto do botão; a listagem aberta atual deixa de ocupar espaço na página.
7. Preço e libragem continuam disponíveis dentro da mesma janela, sem perder a busca e a ordenação existentes.

## Qualidade
- Criar primeiro testes do fluxo progressivo e da limpeza dos filtros.
- Manter o funcionamento em celular e computador.
- Preservar os parâmetros da página e os vínculos de produtos com vários grupos.
- Validar testes, compilação e o uso real no preview.
