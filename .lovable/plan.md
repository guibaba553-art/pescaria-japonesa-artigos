# Troco por cédulas no PDV

## Objetivo
Fazer o pagamento em dinheiro registrar as cédulas e moedas recebidas, calcular o troco usando apenas as quantidades realmente disponíveis no caixa e manter esse saldo atualizado durante o turno.

## Implementação
- Criar, com testes primeiro, o cálculo de troco exato limitado ao estoque de cada cédula/moeda.
- Manter no caixa aberto a quantidade atual de cada denominação, iniciada pela contagem de abertura.
- No PDV, substituir o valor digitado em dinheiro pela contagem das cédulas/moedas recebidas.
- Exibir a combinação sugerida para o troco e avisar quando não houver combinação exata no caixa.
- Bloquear a conclusão da venda quando o valor for insuficiente ou o caixa não conseguir formar o troco exato.
- Ao concluir, somar as cédulas recebidas e descontar as entregues como troco do saldo do caixa.
- Aplicar a mesma regra à parte em dinheiro de pagamentos divididos.
- Preservar os totais financeiros atuais: a venda continua entrando pelo valor líquido, sem descontar o troco duas vezes.

## Detalhes técnicos
- Reutilizar as denominações já usadas na abertura e no fechamento do caixa.
- Persistir a contagem corrente no registro do caixa aberto para sobreviver a recargas e outros terminais.
- Atualizar a contagem com proteção contra concorrência, evitando dois operadores consumirem as mesmas cédulas.
- Validar com testes unitários, checagem de tipos, diagnóstico do aplicativo e teste visual do fluxo no PDV.
