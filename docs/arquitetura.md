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
├── supabase/                   # migrations, Edge Functions e testes de infraestrutura
├── docs/                       # documentação do produto e da engenharia
└── pyproject.toml              # configuração de qualidade do monorepo
```

Não existe um `core` executável compartilhado entre Python e TypeScript. As duas implementações
compartilham o contrato, os casos de conformidade e as mesmas decisões arquiteturais. A arquitetura
alvo da PWA a partir da `v0.7.0` usa Supabase como backend gerenciado; isso não introduz uma ponte
de runtime com a CLI.

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

## PWA, Supabase e contratos

`apps/pwa` mantém as fronteiras de domínio, aplicação e adaptadores em TypeScript, sem depender
do runtime Python. A partir da `v0.7.0`, ela autentica a pessoa por Supabase Auth e chama somente
Edge Functions para ações sensíveis e para a conversa com IA.

```text
PWA ── sessão Supabase Auth ──> Edge Functions ──> OpenAI
       │                               │
       └───────────────> PostgreSQL    └── secrets centrais
```

- A criação de conta é fechada: `request-access` registra a solicitação sem criar usuário, uma
  pessoa administradora decide em `review-access-request` e o hook `Before User Created` permite
  somente e-mails aprovados. Depois do primeiro login, a concessão passa a ser vinculada ao
  `user_id` e integra as políticas RLS.
- PostgreSQL é a fonte de verdade de preferências, memória alimentar e histórico. Backups são
  responsabilidade operacional da infraestrutura, não uma funcionalidade da PWA.
- Cada registro pertence a um `user_id`; RLS é aplicado e testado em toda tabela exposta.
- A chave OpenAI é configurada pelo operador em `OPENAI_API_KEY`, nos secrets das Edge Functions.
  `ai-chat` usa a credencial somente depois de autenticar e validar a concessão da conta; a PWA
  recebe o provedor e o modelo usados para auditoria, nunca o valor da chave. A migration da
  `v0.9.0` remove as estruturas BYOK e os segredos individuais da `v0.7.0`.
- O adaptador OpenAI e detalhes como `previous_response_id` vivem no backend. O cálculo e as
  travas determinísticos continuam no domínio TypeScript e não são delegados à IA.
- O modo manual estrutura os quatro campos na camada de aplicação e entra na mesma máquina de
  estados, confirmação, cálculo e persistência; não cria uma segunda implementação clínica.
- A exclusão total entra por uma porta de conta, é adaptada por `delete-account` e usa a remoção
  do usuário Auth como raiz da cascata transacional no PostgreSQL.
- Infraestrutura vive em `supabase/`: `config.toml`, migrations, Edge Functions, seeds fictícios
  e testes de isolamento. Segredos e chaves de serviço não pertencem ao repositório.
- Notificações usam uma porta comum: Mailpit no ambiente local e Resend, com remetente verificado,
  no ambiente hospedado. Links administrativos apenas abrem a revisão; decisões exigem uma
  requisição autenticada explícita.

Os arquivos em `packages/contracts/` são a fronteira compartilhada. Eles fixam schemas e casos
esperados que devem ser executados pelas suítes Python e TypeScript. Uma divergência de resultado
é tratada como regressão, mesmo que cada aplicação tenha sua própria implementação do domínio.
