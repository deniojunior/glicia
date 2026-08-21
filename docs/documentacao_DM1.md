# Cálculo de insulina e segurança

O Glicia auxilia a contar carboidratos e aplicar uma fórmula com parâmetros pessoais. Não altera basal, RIC, fator de sensibilidade, meta, horários de insulina ou configurações de bomba.

## Contagem de carboidratos

Prioridade de fontes: rótulo nutricional informado pela pessoa, tabela fornecida e, por último, estimativa identificada. Quando a porção divergir da referência:

```text
CHO consumido = (quantidade consumida × CHO da referência) ÷ quantidade de referência
```

O assistente considera preparo e ingredientes adicionais. Para fibras e/ou polióis acima de 5 g informados no rótulo, pode explicitar `CHO líquidos = carboidratos totais − 50% de fibras/polióis`. Refeições ricas em gordura/proteína recebem apenas alerta de possível impacto tardio.

## Fórmula determinística

```text
dose sugerida = MAX(0, Round(((glicemia − meta) ÷ fator de correção)
                            + (carboidratos ÷ RIC da refeição)
                            + ajuste de tendência))
```

O arredondamento ocorre uma única vez no total; valores em `0,5` são arredondados para longe de zero.

## Ajuste de tendência do FreeStyle Libre

| Tendência | FC < 25 | FC 25–<50 | FC 50–75 | FC > 75 |
| --- | ---: | ---: | ---: | ---: |
| Subindo rápido | +4 U | +3 U | +2 U | +1 U |
| Subindo | +3 U | +2 U | +1 U | 0 U |
| Estável ou não informada | 0 U | 0 U | 0 U | 0 U |
| Caindo | −3 U | −2 U | −1 U | 0 U |
| Caindo rápido | −4 U | −3 U | −1 U | 0 U |

As faixas de 50 e 75 pertencem à faixa `50–75`. Esta é uma proposta para FreeStyle Libre, não um algoritmo universalmente validado, e deve ser individualizada pela equipe de saúde.

## Travas atuais

- Não há sugestão se a glicemia estiver abaixo de `HYPOGLYCEMIA_THRESHOLD`.
- Uma queda rápida abaixo de 100 mg/dL gera alerta adicional.
- O resultado final nunca é negativo.
- Não há cálculo de insulina ativa; não use o resultado para empilhar correções.
- Leituras incompatíveis com sintomas devem ser confirmadas conforme o plano individual e orientações do sensor.

## Referências

- [Manual de Contagem de Carboidratos — SBD](https://diabetes.org.br/wp-content/uploads/2025/10/manual-contagem-carboidratos-web.pdf)
- [Trend arrows in depth — Abbott](https://www.freestyle.abbott/sa-en/discover-freestyle-libre/understanding-reports-and-data/trend-arrows-in-depth.html)
- [Approaches for Successful Outcomes with Continuous Glucose Monitoring — ADA](https://diabetesjournals.org/compendia/article/2018/1/13/144617/Approaches-for-Successful-Outcomes-with-Continuous)
