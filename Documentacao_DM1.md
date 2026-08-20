# Glicia — protocolo de contagem e cálculo para DM1

## Finalidade e limites

O Glicia auxilia a contar carboidratos e aplicar uma fórmula matemática com
parâmetros pessoais previamente configurados. Não altera basal, RIC, fator de
sensibilidade, meta glicêmica, horários de insulina ou configurações de bomba.
Esses dados devem ser individualizados pela equipe de diabetes.

## Contagem de carboidratos

### Ordem de prioridade

1. Rótulo nutricional informado pela pessoa — usar **carboidratos totais** e a
   porção real consumida.
2. Tabela de alimentos disponibilizada ao aplicativo — idealmente extraída do
   Manual de Contagem de Carboidratos da SBD.
3. Estimativa — apenas quando as duas fontes anteriores não existirem; deve ser
   identificada claramente como estimativa.

O terminal atual recebe rótulos transcritos em texto; não interpreta imagens.

### Cálculo proporcional

Quando a porção consumida divergir da referência:

```text
CHO consumido = (quantidade consumida × CHO da porção de referência)
                ÷ quantidade da porção de referência
```

Peso do alimento não é igual a gramas de carboidrato. Cada item deve aparecer
separadamente, seguido do total da refeição.

### Preparações e alimentos com pouco CHO

Água, café ou chá sem açúcar e outros alimentos com pouco carboidrato podem ter
0 g de CHO nas porções usuais. Ainda assim, a contagem precisa considerar açúcar,
leite, farinha, amido, molhos, empanados, acompanhamentos e modo de preparo.

### Fibras e polióis

Se rótulo informado tiver mais de 5 g de fibras e/ou polióis na porção, o
assistente pode informar explicitamente o cálculo de carboidratos líquidos:

```text
CHO líquidos = carboidratos totais − 50% de fibras e/ou polióis
```

Não usar “açúcares totais” como substituto de carboidratos totais.

### Gordura e proteína

Pizza, hambúrguer, churrasco, lasanha e refeições semelhantes podem provocar
elevação glicêmica tardia. O Glicia apenas sinaliza a possibilidade; não cria
dose adicional nem algoritmo automático para gordura/proteína.

## Dados glicêmicos coletados

O resumo precisa conter:

- carboidratos totais;
- glicemia atual;
- tendência do CGM;
- tipo de refeição;
- data/hora local e basal ultralenta matinal como contexto.

A tendência nunca é inferida pelo valor de glicemia. Os valores aceitos são
`SUBINDO_RAPIDO`, `SUBINDO`, `ESTAVEL`, `CAINDO`, `CAINDO_RAPIDO` e
`NAO_INFORMADA` quando a pessoa declarar não saber.

## Cálculo determinístico de insulina

O código Python, e nunca a LLM, calcula:

```text
bolus alimentar = carboidratos ÷ RIC
bolus de correção = (glicemia − glicemia alvo) ÷ fator de sensibilidade
dose total = bolus alimentar + bolus de correção
```

RIC, glicemia-alvo e fator de sensibilidade vêm de `config.py` ou variáveis de
ambiente. A RIC é selecionada pelo tipo de refeição:

| Refeição | RIC padrão |
| --- | --- |
| Café da manhã | 1 U : 8 g CHO |
| Almoço | 1 U : 6 g CHO |
| Café da tarde/lanche | 1 U : 8 g CHO |
| Jantar | 1 U : 10 g CHO |
| Ceia | deve ser configurada explicitamente |

A basal ultralenta não é somada à dose da refeição.

Não arredondar uma dose sem conhecer o incremento do dispositivo. A versão atual
usa arredondamento matemático simples e deve ser configurada/revista conforme o
dispositivo e o plano individual.

## Segurança

- Hipoglicemia deve ser priorizada; o fluxo de bolus habitual não deve ser
  tratado como recomendação para essa situação.
- Insulina ativa de dose anterior pode afetar uma correção. O aplicativo atual
  não calcula insulina ativa, portanto a sugestão não substitui a estratégia
  individual definida pela equipe de saúde.
- Todo resultado deve ser conferido antes de aplicar insulina.

## Referências

- Manual de Contagem de Carboidratos da Sociedade Brasileira de Diabetes:
  [SBD — Manual de Contagem de Carboidratos](https://diabetes.org.br/wp-content/uploads/2025/10/manual-contagem-carboidratos-web.pdf).
- Diretriz da Sociedade Brasileira de Diabetes, edição 2025:
  [diretriz.diabetes.org.br](https://diretriz.diabetes.org.br/).
