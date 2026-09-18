# Identificação do banco no PDF de entradas

## Objetivo
Deixar cada transação do PDF claramente identificada pela conta de recebimento.

## Alterações
- Incluir em cada linha o nome da conta: Stone, Asaas, Mercado Pago ou Dinheiro.
- Usar a cor definida para cada conta na célula correspondente.
- No PDF geral, manter transações de todas as contas com cores individuais.
- Nos PDFs separados, exibir também a conta explicitamente, mesmo quando todas as linhas pertencem ao mesmo banco.

## Validação
- Criar primeiro testes para a associação entre transação, nome e cor da conta.
- Gerar um PDF de teste e revisar visualmente legibilidade, alinhamento e cores.
- Confirmar testes e compilação sem erros.

## Detalhes técnicos
As linhas do PDF receberão metadados da conta sem alterar os cálculos de bruto, taxa e líquido. A tabela ganhará uma coluna `Conta`, com texto colorido conforme a paleta já usada nos cartões financeiros.
