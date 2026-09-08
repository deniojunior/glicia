# Glicia

[![Versão](https://img.shields.io/badge/version-0.13.0--alpha-8b5cf6?style=flat-square)](docs/releases/v0.13.0-alpha.md)
[![Python](https://img.shields.io/badge/python-3.12%2B-3776AB?style=flat-square&logo=python&logoColor=white)](apps/cli/pyproject.toml)
[![Licença](https://img.shields.io/badge/license-MIT-00b894?style=flat-square)](LICENSE)
[![Supabase](https://img.shields.io/badge/PWA-Supabase-3ecf8e?style=flat-square&logo=supabase&logoColor=white)](#privacidade-e-dados)

> Um utilitário open source para organizar a contagem de carboidratos e aplicar localmente uma fórmula de bolus já definida com a equipe de saúde.

O Glicia conversa em português para reunir os dados de uma refeição — carboidratos, glicemia,
tendência do sensor e tipo de refeição. Depois que a pessoa confere esses dados, o cálculo é
executado localmente. A IA ajuda a estruturar a contagem; ela nunca calcula a dose final.

**Status:** `v0.13.0-alpha` · CLI Python utilizável · PWA experimental com acesso aprovado

![Demonstração do Glicia no terminal](docs/assets/glicia-demo.gif)

> [!WARNING]
> Glicia é um utilitário educacional, não um dispositivo médico. Não substitui acompanhamento profissional, plano individual ou a avaliação de sintomas e insulina ativa. Use somente parâmetros definidos com sua equipe de saúde e confirme todos os dados antes de aplicar insulina.

## Estado do projeto

- **CLI:** interface funcional e instalável, preservada como referência de comportamento.
- **PWA:** fluxo conversacional mobile-first, instalável pelo navegador; usa Supabase Auth,
  PostgreSQL com RLS e Edge Functions. Durante o experimento, novas contas dependem de aprovação
  do autor e a credencial de IA é administrada centralmente no backend.
- **Staging:** backend hospedado no Supabase e publicação da PWA preparada para Vercel; veja
  o [guia de staging](docs/staging.md).
- **Contratos:** schemas e casos fictícios verificam cálculo, arredondamento, tendência,
  configuração, conversa e segurança.
- **Próximo marco:** validação da beta fechada em celulares na `v0.14.0-beta`.

Leia as [notas da v0.13.0-alpha](docs/releases/v0.13.0-alpha.md) para conhecer os controles de uso,
os impactos para contribuidores e as limitações atuais.

## PWA no celular

Abra a PWA pelo navegador. No Android e em navegadores compatíveis, a Glicia oferece o botão
**Instalar Glicia** no primeiro acesso. No iPhone, abra no Safari, toque em **Compartilhar** e
escolha **Adicionar à Tela de Início**. A instalação é opcional; ela não altera a forma de
configurar ou usar a Glicia.

No primeiro acesso, informe seu e-mail. A Glicia identifica se ele já está aprovado, aguarda análise
ou ainda precisa entrar na lista. Depois da aprovação, digite o código recebido sem sair da PWA;
se a entrega do código estiver indisponível, um magic link é enviado como contingência. Preferências,
memória alimentar e histórico ficam associados à conta. A PWA não pede uma chave OpenAI: a conexão
de IA é configurada pelo operador no backend e a credencial nunca é enviada ao navegador.

Na conversa, `Enter` envia e `Shift+Enter` cria uma nova linha. Se a IA estiver indisponível ou a
pessoa já souber o total de carboidratos, **Informar sem IA** mantém a mesma revisão e o mesmo
cálculo local. Depois de registrar uma refeição, frases como **“vou almoçar a mesma coisa que
ontem”** recuperam a composição para confirmação, mas sempre exigem glicemia e tendência atuais e
recalculam a dose. O botão **Sair** na conversa encerra somente a sessão do dispositivo atual;
histórico e conta podem ser excluídos pela própria interface.

## Instale com ajuda de uma IA

Copie o bloco abaixo e cole no seu assistente de IA. No GitHub, o bloco de código tem um botão nativo para copiar. Ele orienta a IA a usar as regras do [llms.txt](llms.txt), sem escolher ou sugerir parâmetros clínicos.

```text
Quero instalar e configurar o Glicia no meu terminal. Leia e siga as instruções deste arquivo antes de me orientar: https://raw.githubusercontent.com/deniojunior/glicia/main/llms.txt

Guie-me passo a passo. Não me peça para colar chaves de API no chat e não escolha, sugira ou altere parâmetros clínicos (meta, fator de correção, RIC, basal ou limite de hipoglicemia). Só me ajude a inserir valores que eu confirmar terem sido definidos pela minha equipe de saúde.
```

## Instalação manual

Você precisa de Python 3.12+ e, na versão atual, de uma chave da API OpenAI.

```bash
git clone https://github.com/deniojunior/glicia.git
cd glicia
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e apps/cli
export OPENAI_API_KEY="sua-chave"
glicia
```

Também é possível executar `python -m glicia`.

No primeiro uso, abra `/config` e confira meta, fator de correção e RICs contra o plano definido pela sua equipe de saúde. Os valores padrão existem apenas para explorar o programa — não são uma recomendação clínica para ninguém.

```text
Você: Vou tomar café da manhã: um pão francês com manteiga e café sem açúcar.
Glicia: Qual é sua glicemia atual e a seta do sensor?
Você: 160, seta subindo.
```

## O que a CLI faz

- Conduz uma conversa curta para identificar refeição, carboidratos, glicemia, tendência e horário da refeição.
- Usa a tabela nutricional configurada e mostra um resumo para confirmação antes de qualquer cálculo.
- Calcula a sugestão localmente, de forma determinística, a partir de RIC, meta, fator de correção e tendência.
- Oferece os modos **Preciso** (pergunta diante de ambiguidades relevantes) e **Rápido** (explicita estimativas razoáveis).
- Salva preferências e histórico localmente, sem exigir conta ou login.

## Comandos

| Comando | O que faz |
| --- | --- |
| `/config` | Exibe os parâmetros ativos sem revelar segredos. |
| `/edit` | Dentro de `/config`, altera um parâmetro após confirmação. |
| `/mode` | Exibe ou alterna entre os modos Preciso e Rápido. |
| `/quit` ou `/exit` | Encerra o aplicativo. |

## Como funciona

```text
refeição em linguagem natural
           ↓
IA organiza a contagem com a tabela de alimentos
           ↓
você revisa e confirma os dados extraídos
           ↓
Python aplica sua fórmula configurada localmente
           ↓
histórico opcional em SQLite local
```

A fórmula é transparente e o arredondamento acontece no resultado final:

```text
dose sugerida = MAX(0, Round(((glicemia − meta) ÷ fator de correção)
                            + (carboidratos ÷ RIC)
                            + ajuste de tendência))
```

Leia [cálculo e segurança](docs/documentacao_DM1.md) para conhecer as travas, limitações, ajuste de tendência e referências.

## Privacidade e dados

A CLI continua local: preferências ficam em `~/.glicia/preferences.json` e o histórico em
`~/.glicia/history.sqlite3`. Na PWA, Supabase Auth identifica a conta e PostgreSQL armazena
preferências, memória alimentar e refeições; políticas RLS isolam os registros por pessoa.

A chave OpenAI da PWA fica somente nos secrets das Edge Functions e é administrada pelo operador.
A conversa — que pode incluir refeição, glicemia e contexto alimentar — segue da Edge Function
para a OpenAI e não diretamente do navegador. Avalie as políticas dos serviços envolvidos e não
use dados reais em testes, issues, logs ou demonstrações públicas.

## Configuração

| Variável | Padrão | Finalidade |
| --- | --- | --- |
| `OPENAI_API_KEY` | — | Obrigatória; nunca é exibida pelo Glicia. |
| `OPENAI_MODEL` | `gpt-4o-mini` | Modelo usado na conversa. |
| `OPENAI_BASE_URL` | API oficial da OpenAI | Endpoint compatível com Responses. |
| `TARGET_GLUCOSE` | `120` | Meta glicêmica em mg/dL. |
| `CORRECTION_FACTOR` | `40` | Fator de correção em mg/dL/U. |
| `CARBOHYDRATE_RATIO_CAFE_DA_MANHA` | `8` | RIC do café da manhã. |
| `CARBOHYDRATE_RATIO_ALMOCO` | `6` | RIC do almoço. |
| `CARBOHYDRATE_RATIO_CAFE_DA_TARDE` | `8` | RIC do lanche. |
| `CARBOHYDRATE_RATIO_JANTAR` | `10` | RIC do jantar. |
| `CARBOHYDRATE_RATIO_CEIA` | `8` | RIC da ceia. |
| `BASAL_MORNING_UNITS` | `28` | Contexto para a IA; não entra na fórmula. |
| `HYPOGLYCEMIA_THRESHOLD` | `70` | Abaixo deste valor não há sugestão de bolus. |
| `FOOD_TABLE_PATH` | tabela incluída | Caminho para CSV compatível. |
| `GLICIA_HISTORY_PATH` | `~/.glicia/history.sqlite3` | Arquivo SQLite do histórico. |

Detalhes, precedência de valores e formato da tabela estão em [docs/configuracao.md](docs/configuracao.md) e [docs/tabela-sbd.md](docs/tabela-sbd.md).

## Roadmap

O plano de releases e as futuras integrações de IA estão no [roadmap](docs/roadmap.md). A ordem
de implementação, os critérios de aceite e os portões de risco estão no
[plano de execução](docs/plano-execucao.md).

## Estrutura do monorepo

```text
apps/
├── cli/                    # pacote e testes Python
└── pwa/                    # interface mobile-first React/TypeScript
packages/
└── contracts/              # schemas e fixtures compartilhados
supabase/                    # migrations, Edge Functions e testes de RLS
docs/                       # produto, arquitetura e planejamento
```

A CLI e a PWA implementam seus domínios em linguagens diferentes. A equivalência é protegida
pelos casos em `packages/contracts`; a PWA usa Supabase, enquanto a CLI permanece independente.

## Contribuindo

```bash
pytest
ruff check .
ruff format --check .
mypy
```

Contribuições são bem-vindas. Mudanças no cálculo ou nas travas exigem fonte, limitações documentadas e testes. Veja [CONTRIBUTING.md](CONTRIBUTING.md), [desenvolvimento](docs/desenvolvimento.md), [arquitetura](docs/arquitetura.md) e o [código de conduta](CODE_OF_CONDUCT.md).

## Segurança e licença

Não publique chaves, dados de saúde ou falhas que possam causar uma sugestão clínica perigosa. Reporte-as conforme [SECURITY.md](SECURITY.md).

O código é distribuído sob a [licença MIT](LICENSE). A tabela nutricional possui condições e atribuição próprias no [aviso sobre dados de terceiros](docs/aviso-dados.md).
