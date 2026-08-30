# Arquitetura

O Glicia é organizado como monorepo. Cada interface é uma aplicação independente, enquanto
contratos neutros preservam o mesmo comportamento entre linguagens.

```text
glicia/
├── apps/
│   ├── cli/                    # pacote Python instalável
│   └── pwa/                    # aplicação mobile-first em TypeScript
├── packages/
│   └── contracts/              # schemas e fixtures compartilhados
├── docs/                       # documentação do produto e da engenharia
└── pyproject.toml              # configuração de qualidade do monorepo
```

Não existe um `core` executável compartilhado entre Python e TypeScript. As duas implementações
compartilham o contrato, os casos de conformidade e as mesmas decisões arquiteturais. Isso mantém
a PWA estática e evita introduzir um servidor ou uma ponte entre runtimes.

## CLI Python

A CLI segue uma arquitetura hexagonal pequena. O núcleo contém regras e casos de uso; terminal,
OpenAI e armazenamento local ficam nas bordas.

```text
presentation/cli.py ───────→ application/session.py ───────→ domain/
       │                             ↑                          ↑
       ├──→ clients/openai.py ───────┘                          │
       └──→ persistence/ ───────────────────────────────────────┘
```

```text
apps/cli/
├── pyproject.toml
├── src/glicia/
│   ├── application/           # casos de uso e portas
│   ├── clients/               # OpenAI e outros serviços externos
│   ├── domain/                # tipos, cálculo e segurança determinísticos
│   ├── persistence/           # preferências e histórico local
│   ├── presentation/          # entrada e renderização do terminal
│   ├── data/                  # tabela incluída no pacote Python
│   ├── config.py
│   ├── cli.py                 # entrada pública do comando `glicia`
│   └── __main__.py            # suporte a `python -m glicia`
└── tests/
```

As dependências apontam para dentro:

- `domain` não depende das demais camadas;
- `application` depende apenas de `domain`;
- `clients`, `persistence` e `presentation` adaptam o núcleo ao mundo externo;
- detalhes de fornecedor, como `previous_response_id`, permanecem em `clients`;
- lógica clínica nunca fica no prompt, na interface ou no banco de dados.

A IA apenas extrai e explica os dados da refeição. O cálculo final e as travas de segurança são
executados localmente, depois da confirmação da pessoa.

## PWA e contratos

`apps/pwa` repetirá as fronteiras de domínio, aplicação e adaptadores em TypeScript, sem depender
do runtime Python. O diretório já possui um manifesto mínimo, mas o scaffold React será criado no
marco `v0.3.0`.

Os arquivos em `packages/contracts/` são a fronteira compartilhada. Eles fixam schemas e casos
esperados que devem ser executados pelas suítes Python e TypeScript. Uma divergência de resultado
é tratada como regressão, mesmo que cada aplicação tenha sua própria implementação do domínio.
