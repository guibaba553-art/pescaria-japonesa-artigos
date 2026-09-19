# Filtro progressivo de produtos

## Objetivo
Substituir a lista aberta de marcas e subcategorias por um único botão **Filtros**, que abre uma janela organizada e guia a escolha por etapas.

## Fluxo
1. A janela começa mostrando as categorias principais, como **Varas**.
2. Depois da categoria, mostra somente as marcas disponíveis nela, como **Marine Sports**.
3. Depois, mostra grupos independentes compatíveis com os produtos restantes, como **libragem**, **tamanho**, **modelo** e outros conjuntos cadastrados.
4. As escolhas se combinam por interseção: **1,80 m** e **17 lb** podem coexistir, sem presumir que todo produto de 1,80 m tenha 17 lb.
5. Cada escolha reduz as opções seguintes aos produtos que realmente pertencem a todos os grupos marcados.
6. O caminho escolhido fica visível e clicável para remover qualquer escolha.
7. Os filtros ativos ficam resumidos perto do botão; a listagem aberta atual deixa de ocupar espaço na página.
8. Preço continua continuam disponíveis dentro da mesma janela, sem perder a busca e a ordenação existentes.

## Qualidade
- Criar primeiro testes do fluxo progressivo e da limpeza dos filtros.
- Manter o funcionamento em celular e computador.
- Preservar os parâmetros da página e os vínculos de produtos com vários grupos.
- Validar testes, compilação e o uso real no preview.
