# Venda gravada de uma vez só (fim das vendas sem produto)

## Problema

Hoje uma venda é gravada em 5 idas e voltas separadas: venda → pagamento → troco → produtos → baixa de estoque. Se algo interromper depois da primeira, a venda fica registrada e paga, sem produtos e sem baixa de estoque. Já aconteceu 98 vezes (R$ 13.575,33), e 74 dessas ainda tiveram nota fiscal emitida sem produto.

## Objetivo

A venda passa a ser gravada em uma única operação no servidor: ou tudo é salvo (venda, pagamentos, produtos, estoque, troco, promoções), ou nada é salvo. Nunca mais existe venda pela metade.

## Etapa 1 — Caixa (PDV)

- Uma única operação no servidor grava: a venda, as formas de pagamento (inclusive pagamento dividido), os produtos, a baixa de estoque (com variações), o troco em cédulas e o consumo de promoções com limite.
- Se qualquer parte falhar, nada fica gravado e o caixa vê a mensagem de erro com o carrinho intacto, podendo tentar de novo.
- O aviso "Venda já registrada" deixa de limpar o carrinho: se a venda existe e está completa, o sistema só mostra o comprovante; se ficou incompleta, ele a completa.
- A nota fiscal automática (cartão/PIX) só é disparada depois de a venda estar completa.
- Telas que leem o resultado da venda (comprovante, histórico de vendas, orçamento/venda a prazo) são ajustadas ao novo retorno.

## Etapa 2 — Vigilância no Admin

- Painel "Vendas incompletas": lista vendas pagas sem produtos ou sem baixa de estoque, com data, canal, valor e forma de pagamento.
- Aviso visível no admin quando aparecer qualquer caso novo, para corrigir no mesmo dia.

## Etapa 3 — Loja online

- Checkout de entrega e de retirada passam a usar a mesma gravação única: pedido, produtos, reserva de estoque e promoções.
- Quando o pagamento não sai, a reserva de estoque e as promoções são liberadas automaticamente.
- Cobrança por cartão e PIX continua igual; passa apenas a receber um pedido que já está completo.
- A limpeza de pedidos expirados e carrinhos abandonados é revista para o novo fluxo.

## Etapa 4 — Depois (opcional)

- Tela para recuperar as vendas antigas incompletas: informar o que foi vendido e dar baixa retroativa de estoque, começando pelas de maior valor. Nada é alterado sem sua confirmação.

## Ordem de entrega

1. Caixa (PDV) — resolve a origem do problema.
2. Painel de vendas incompletas — vigilância.
3. Loja online — mesmo padrão no site.
4. Recuperação das vendas antigas — quando você quiser.

## Detalhes técnicos

- Nova função no banco (`SECURITY DEFINER`) `create_pdv_sale(...)` recebendo venda, itens, pagamentos, troco e promoções, executando tudo em uma transação: `orders` → `order_items` → `order_payments` → `apply_stock_movement` → `apply_pdv_cash_exchange` → `consume_promo_limits`. Erro em qualquer passo faz `rollback` completo.
- Idempotência pela chave de venda já existente: chamada repetida com a mesma chave retorna a venda existente em vez de duplicar.
- `GRANT EXECUTE` para `authenticated` e validação de papel admin/employee dentro da função.
- `auto-emit-fiscal` passa a ser acionado só após retorno bem-sucedido da função.
- `PDV.tsx` (`finalizeSale`, linhas ~1940–2160) troca as 5 chamadas por uma única `supabase.rpc('create_pdv_sale', ...)`.
- Site: função equivalente `create_site_order(...)` cobrindo `orders` → `order_items` → `reserve_stock_for_order` → `consume_promo_limits`, usada em `CheckoutEntrega.tsx` e `Checkout.tsx`.
- TDD: testes das funções puras de montagem do payload e testes Deno/SQL dos casos de rollback e de chamada repetida antes da implementação.
