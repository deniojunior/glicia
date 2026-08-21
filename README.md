# Glicia

> Ferramenta educacional de terminal para contagem de carboidratos assistida por IA e cálculo determinístico de bolus.

O Glicia conversa em português para identificar a refeição, os carboidratos, a glicemia, a tendência do sensor e o tipo de refeição. Após a confirmação da pessoa usuária, o Python — e nunca a IA — executa a fórmula configurada.

**Não é um dispositivo médico e não substitui a equipe de diabetes.** Confirme todo resultado antes de aplicar insulina e siga sempre seu plano individual.

## Instalação

Requer Python 3.12+ e uma chave da API OpenAI.

```bash
git clone https://github.com/deniojunior/glicia.git
cd glicia
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e ".[dev]"
export OPENAI_API_KEY="sua-chave"
glicia
```

Também é possível executar `python -m glicia`. Para desenvolvimento, rode:

```bash
pytest
ruff check .
ruff format --check .
mypy
```

## Uso rápido

Descreva a refeição e informe glicemia e seta do sensor quando solicitado. Use `/config` para ver os parâmetros ativos sem expor segredos e `/mode` para visualizar ou trocar o modo de interação.

- **Preciso**: pergunta quando uma ambiguidade puder alterar materialmente os carboidratos.
- **Rápido**: usa estimativas razoáveis quando houver base na tabela e informa o que estimou.

O modo e as preferências alimentares confirmadas ficam apenas em `~/.glicia/preferences.json`. Glicemias, conversas e chaves da OpenAI não são gravadas nesse arquivo.

```text
Vou tomar café da manhã: um pão francês com manteiga e café sem açúcar.
Glicemia: 160. Seta subindo.
```

## Configuração

| Variável | Padrão | Finalidade |
| --- | --- | --- |
| `OPENAI_API_KEY` | — | Obrigatória; nunca é exibida. |
| `OPENAI_MODEL` | `gpt-4o-mini` | Modelo usado na conversa. |
| `TARGET_GLUCOSE` | `120` | Meta glicêmica em mg/dL. |
| `CORRECTION_FACTOR` | `40` | Fator de correção em mg/dL/U. |
| `CARBOHYDRATE_RATIO_CAFE_DA_MANHA` | `8` | RIC do café da manhã. |
| `CARBOHYDRATE_RATIO_ALMOCO` | `6` | RIC do almoço. |
| `CARBOHYDRATE_RATIO_CAFE_DA_TARDE` | `8` | RIC do lanche. |
| `CARBOHYDRATE_RATIO_JANTAR` | `10` | RIC do jantar. |
| `CARBOHYDRATE_RATIO_CEIA` | `8` | RIC da ceia. |
| `BASAL_MORNING_UNITS` | `28` | Contexto informado à IA; não entra na fórmula. |
| `HYPOGLYCEMIA_THRESHOLD` | `70` | Abaixo deste valor não há sugestão de bolus. |
| `FOOD_TABLE_PATH` | tabela incluída | Caminho alternativo para CSV compatível. |

Mais detalhes: [uso](docs/uso.md), [configuração](docs/configuracao.md), [arquitetura](docs/arquitetura.md), [cálculo e segurança](docs/Documentacao_DM1.md), [tabela SBD](docs/tabela-sbd.md) e [desenvolvimento](docs/desenvolvimento.md).

## Contribuir e segurança

Leia [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) e [SECURITY.md](SECURITY.md). O código é distribuído sob a [licença MIT](LICENSE).
