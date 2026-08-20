# Requisitos — Glicia simples

## 1. Objetivo

Construir um aplicativo Python de terminal que conversa com a OpenAI para
identificar uma refeição e consolidar quatro parâmetros:

1. total de carboidratos da refeição, em gramas;
2. glicemia atual, em mg/dL;
3. tendência atual da glicemia.
4. tipo de refeição: café da manhã, almoço, café da tarde, jantar ou ceia.

Depois de a pessoa confirmar o resumo, o loop termina e o Python calcula uma
sugestão de dose de insulina com uma fórmula determinística. A IA nunca calcula
nem recomenda dose.

## 2. Escopo mínimo

- Python 3.12+ e terminal.
- OpenAI Responses API.
- Uma tabela de alimentos local em `data/foods-sbd.csv`, inserida no prompt a
  cada conversa. O aplicativo envia apenas alimento, medida usual, referência
  em g/ml e CHO; ignora calorias e página do manual.
- Um arquivo simples de configuração com os parâmetros de insulina.
- Sem banco de dados, login, cadastro, persistência de refeições, parser manual
  de linguagem natural ou máquina de estados conversacional.

O código controla apenas o loop de entrada/saída, a chamada à IA, a validação
da resposta estruturada, a confirmação e o cálculo final.

## 3. Fluxo

1. Carregar a tabela de alimentos e os parâmetros de insulina.
2. Montar o prompt-base com a tabela, a data/hora local e a basal ultralenta
   aplicada pela manhã no dia atual.
3. Ler uma mensagem da pessoa e enviá-la à OpenAI, mantendo o contexto com
   `previous_response_id`.
4. Exibir a resposta textual da IA.
5. Repetir até a IA retornar os quatro parâmetros completos e um resumo para
   confirmação.
6. Perguntar `Os dados estão corretos?`.
7. Se a resposta for afirmativa, sair do loop e calcular a dose sugerida.
8. Se a resposta não for afirmativa, enviar a correção para a IA e continuar o
   loop.

## 4. Tendência da glicemia

A tendência descreve a direção e a velocidade de mudança da glicose no sensor
contínuo (CGM). Ela é informativa: deve aparecer no resumo, mas não altera a
fórmula de insulina nesta versão.

| Código | Símbolo comum | Significado |
| --- | --- | --- |
| `SUBINDO_RAPIDO` | ↑↑ | Subindo rápido; também aceita “subindo muito” e “full subindo”. |
| `SUBINDO` | ↑ | Subindo. |
| `ESTAVEL` | → | Estável ou mudando lentamente. |
| `CAINDO` | ↓ | Caindo. |
| `CAINDO_RAPIDO` | ↓↓ | Caindo rápido; também aceita “caindo muito” e “full caindo”. |
| `NAO_INFORMADA` | — | A pessoa declarou que não sabe ou não tem seta/tendência disponível. |

A IA pode reconhecer setas, termos como “subindo”, “caindo”, “estável” e frases
equivalentes. “Subindo muito” e “full subindo” equivalem a `SUBINDO_RAPIDO`;
“caindo muito” e “full caindo” equivalem a `CAINDO_RAPIDO`. Ela nunca deve
inferir tendência a partir do valor da glicemia.
Se a tendência não foi mencionada, deve perguntar objetivamente qual seta ou
direção aparece no sensor. Só pode usar `NAO_INFORMADA` quando a pessoa disser
explicitamente que não sabe ou não possui essa informação.

## 5. Contrato da resposta da IA

Use JSON Schema estrito em cada turno:

```json
{
  "reply": "Mensagem em português para exibir no terminal",
  "total_carbohydrates": null,
  "glucose": null,
  "glucose_trend": null,
  "meal_type": null,
  "ready_for_confirmation": false
}
```

- `total_carbohydrates`: número maior ou igual a zero, em gramas, ou `null`.
- `glucose`: número maior que zero, em mg/dL, ou `null`.
- `glucose_trend`: um dos códigos da tabela acima ou `null`.
- `meal_type`: `CAFE_DA_MANHA`, `ALMOCO`, `CAFE_DA_TARDE`, `JANTAR`, `CEIA` ou
  `null`.
- `ready_for_confirmation`: `true` apenas quando os quatro parâmetros estiverem
  definidos, inclusive `NAO_INFORMADA` informado explicitamente, e a IA tiver
  apresentado o resumo.

## 6. Prompt-base

```text
Você é a assistente de contagem de carboidratos e coleta de dados glicêmicos
do Glicia.

Use exclusivamente a TABELA DE ALIMENTOS fornecida para calcular o total de
carboidratos da refeição. Nunca invente alimentos, quantidades ou valores
nutricionais. Identifique componentes separadamente: por exemplo, “pão com
manteiga” contém pão e manteiga.

Conduza uma conversa curta, em português, até obter:
1. total de carboidratos da refeição, em gramas;
2. glicemia atual, em mg/dL;
3. tendência da glicemia.
4. tipo de refeição: CAFE_DA_MANHA, ALMOCO, CAFE_DA_TARDE, JANTAR ou CEIA.

Para a tendência, aceite somente:
- SUBINDO_RAPIDO: ↑↑, subindo rápido, subindo muito ou full subindo;
- SUBINDO: ↑, subindo;
- ESTAVEL: →, estável ou mudando lentamente;
- CAINDO: ↓, caindo;
- CAINDO_RAPIDO: ↓↓, caindo rápido, caindo muito ou full caindo;
- NAO_INFORMADA: somente se a pessoa disser explicitamente que não sabe ou não tem
  tendência disponível.

Nunca deduza a tendência pelo valor da glicemia. Se ela não for informada,
pergunte qual seta ou direção aparece no sensor. Se faltar uma quantidade
necessária para calcular carboidratos, faça apenas uma pergunta objetiva por vez.

Classifique a refeição em um dos cinco tipos indicados. Caso não seja possível
inferir, pergunte qual é a refeição.

Contexto do dia atual:
- data/hora local: {current_datetime}
- basal ultralenta aplicada pela manhã: {basal_morning_units} unidades

A basal é somente contexto clínico; não deve ser somada ao cálculo de
carboidratos ou à dose sugerida.

Mantenha as informações já fornecidas na conversa. Quando os quatro parâmetros
estiverem completos, apresente um resumo e peça confirmação. Nunca calcule,
recomende ou informe dose de insulina.

Retorne sempre JSON no schema solicitado.

TABELA DE ALIMENTOS:
{food_table}
```

## 7. Cálculo determinístico após confirmação

O Python executa a fórmula somente após confirmação positiva:

```text
dose_correcao = (glicemia - glicemia_alvo) / fator_correcao
dose_carboidrato = carboidratos / relacao_carboidrato
dose_total = dose_correcao + dose_carboidrato
dose_sugerida = arredondamento(dose_total)
```

Os valores de `glicemia_alvo`, `fator_correcao`, RIC por refeição e
`basal_morning_units` ficam em `config.py` ou `.env`. As RIC padrão são: café
da manhã 1:8, almoço 1:6, café da tarde 1:8 e jantar 1:10. A ceia exige uma RIC
configurada explicitamente. A basal e a tendência são exibidas/contextualizadas,
mas não entram no cálculo nesta versão.

## 8. Estrutura de arquivos

```text
glicia/
├── main.py          # loop de terminal e chamada à OpenAI
├── prompt.py        # prompt-base e JSON Schema
├── insulin.py       # cálculo puro e determinístico
├── config.py        # parâmetros de insulina
├── data/
│   └── foods-sbd.csv # tabela SBD de alimentos
├── requirements.txt
└── README.md
```

## 9. Segurança

- Ler a chave somente de `OPENAI_API_KEY` e nunca imprimi-la.
- Validar os números retornados antes do cálculo.
- Exibir que a sugestão não substitui orientação médica ou profissional.
