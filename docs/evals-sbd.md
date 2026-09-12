# Evals de busca na tabela SBD

A suíte em `evals/sbd/` verifica se a IA encontra a linha correta do CSV da SBD, usa a medida
correta, multiplica a porção, soma os itens e pergunta quando a variedade ou a quantidade é
ambígua. Os casos são fictícios e não contêm dados de pacientes.

## Duas camadas

- `node --test evals/sbd/eval.test.mjs`: grátis, sem chave e obrigatório na CI. Confere hash da
  tabela aceita pelo backend, integridade dos casos, aritmética e comportamento do avaliador.
- `OPENAI_API_KEY=... OPENAI_MODEL=... node evals/sbd/run.mjs`: consulta o modelo real com as
  mesmas instruções e o mesmo schema JSON da Edge Function. Gera custos de API. Não usa o banco
  nem a conta de uma pessoa; envia somente os casos fictícios. `--case <id>` limita a execução.
  Se a API retornar HTTP 429, rode casos separados ou use `--delay-ms 60000` para espaçar as
  chamadas. Cada chamada envia novamente a tabela completa e consome tokens de entrada.

O runner imprime `PASS`/`FAIL` por caso e retorna código 1 se algum falhar. Não grava respostas nem
imprime a chave. Antes de trocar prompt, modelo ou CSV, execute a camada real em staging e revise
manualmente os casos reprovados. Repetir a execução ajuda a observar variação do modelo.

Os valores esperados vêm do CSV, não de números duplicados no fixture. A tolerância numérica é de
0,01 g; o nome do alimento deve corresponder à linha de origem, e casos ambíguos exigem pergunta
e CHO nulo. A suíte mede esses cenários, mas não prova
correção clínica de todas as refeições possíveis. O schema atual não devolve o identificador da
linha consultada; por isso o eval confere nome e CHO, mas não consegue comprovar a proveniência
de cada valor. Uma evolução futura é retornar a referência da linha e verificá-la no backend
antes da confirmação. A tabela é de terceiros: veja
[fonte e atribuição](tabela-sbd.md).
