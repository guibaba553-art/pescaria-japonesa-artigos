# Roadmap

- [x] Impedir exclusão de produtos/variações que apague itens vendidos ou movimentações de estoque — proteções e vínculos restritivos confirmados no banco
- [x] Corrigir total da triagem e validar a proteção do histórico — 29 testes passaram; pedido conferido na tela com R$ 322,21 e triagem bloqueada sem itens
- [ ] Recuperar itens apagados dos pedidos AZURA — depende de comprovante que confirme o item original

- [x] Trocar reforço por contagem de cédulas/moedas e atualizar o saldo atomicamente; 12 testes passando e tela conferida sem lançar dinheiro fictício

- [x] Criar cálculo testado de troco limitado às cédulas disponíveis
- [x] Persistir e atualizar atomicamente o saldo de cédulas do caixa
- [x] Integrar contagem recebida e troco ao PDV, inclusive pagamento dividido
- [x] Validar testes, tipos, build e fluxo visual
- [x] Criar armazenamento seguro de anotações diárias por canal
- [x] Permitir criar, editar e remover anotações clicando nos pontos
- [x] Exibir anotações ao passar o mouse nos gráficos de PDV, Site, Vendas Gerais e Tráfego
- [x] Validar testes, tipos, build e fluxo visual das anotações
- [x] Criar filtro progressivo por categoria com grupos independentes e combináveis (marca, libragem, tamanho e demais conjuntos)
- [x] Gravar a venda do PDV em uma única operação atômica (pedido, pagamentos, produtos, estoque, troco)
- [x] Disparar a nota fiscal automática só no fim da gravação da venda
- [x] Painel de vendas incompletas na página de Pedidos
- [x] Gravar o pedido da loja online em uma única operação atômica
- [ ] Recuperar as 98 vendas antigas incompletas (tela de baixa retroativa) — aguarda decisão do usuário sobre quais vendas corrigir
- [x] Separar Caixa diário e Saldo acumulado na agenda, iniciando pelo saldo real de 22/09/2026
- [x] Conferir os pagamentos do MOLINETE AZURA: Asaas confirmou cartão b4044a7a e PIX 2e387599 como aprovados
- [ ] Corrigir compra repetida do AZURA e conferir estoque — aguarda autorização explícita para cancelar e estornar o cartão b4044a7a, mantendo o PIX 2e387599
