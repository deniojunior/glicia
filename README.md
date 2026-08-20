# Glicia

Aplicativo Python mínimo de terminal: a OpenAI conduz a conversa para obter
carboidratos, glicemia e tendência; após confirmação, o Python calcula a dose
sugerida de forma determinística.

## Executar

Requer Python 3.12+, uma chave da OpenAI e as dependências visuais:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
export OPENAI_API_KEY="sua-chave"
python main.py
```

No terminal, use `/config` para consultar os parâmetros ativos (glicemia-alvo,
fator de sensibilidade, basal, limite de hipoglicemia e RIC por refeição). A
chave `OPENAI_API_KEY` nunca é exibida.

Configurações opcionais:

```bash
export OPENAI_MODEL="gpt-4o-mini"
export TARGET_GLUCOSE="120"
export CORRECTION_FACTOR="40"
export CARBOHYDRATE_RATIO_CAFE_DA_MANHA="8"
export CARBOHYDRATE_RATIO_ALMOCO="6"
export CARBOHYDRATE_RATIO_CAFE_DA_TARDE="8"
export CARBOHYDRATE_RATIO_JANTAR="10"
# Opcional: defina antes de calcular uma ceia.
export CARBOHYDRATE_RATIO_CEIA="8"
export BASAL_MORNING_UNITS="12"
export HYPOGLYCEMIA_THRESHOLD="70"
```

Edite `data/foods-sbd.csv` para ajustar a tabela de alimentos enviada à IA. As
colunas de alimento, medida usual, referência em g/ml e CHO são usadas no prompt;
calorias e página do manual não são enviadas. Os requisitos completos estão em [Requisitos.md](Requisitos.md). O protocolo de contagem,
limites clínicos e fórmula determinística estão em [Documentacao_DM1.md](Documentacao_DM1.md).

## Teste

```bash
python3 -m unittest -v test_insulin.py
```

> A dose exibida é apenas uma sugestão e não substitui orientação médica.
