# Desenvolvimento

## Estrutura do monorepo

```text
apps/
├── cli/                    # pacote e testes Python
└── pwa/                    # projeto TypeScript/React
packages/
└── contracts/              # schemas e fixtures entre linguagens
docs/                       # documentação
```

A CLI fica em `apps/cli/src/glicia` e seus testes em `apps/cli/tests`. Não inclua lógica clínica
na camada de apresentação ou no prompt. Mudanças de cálculo devem ficar em
`domain/insulin.py`; travas, em `domain/safety.py`. Ambas exigem testes unitários e documentação
atualizada. O teste de arquitetura impede dependências das camadas internas para as externas.

Os contratos independentes de linguagem ficam em `packages/contracts`. A CLI Python e a PWA
TypeScript devem consumir as mesmas fixtures. Alterações incompatíveis exigem nova versão do
contrato e não podem ser introduzidas como simples mudança de interface.

```text
packages/contracts/
├── manifest.json
├── schemas/
└── fixtures/
```

Use somente dados fictícios nesses arquivos. O manifesto deve listar todo schema e fixture que
faz parte da versão vigente.

## Rotina local

Execute os comandos a partir da raiz do monorepo:

```bash
python -m pip install -e "apps/cli[dev]"
pre-commit install
ruff check .
ruff format --check .
mypy
pytest
```

O `pyproject.toml` da raiz configura as verificações do monorepo. O manifesto publicável da CLI
fica em `apps/cli/pyproject.toml`.

## PWA

A PWA está em `apps/pwa`, com React, Vite, TypeScript, Vitest e o manifesto de instalação.
Ela consome as fixtures de `packages/contracts` diretamente nos testes, para preservar a paridade
com a CLI. Já há uma conversa demonstrativa local e um adaptador OpenAI isolado; onboarding,
persistência e cálculo de dose na interface serão construídos em etapas posteriores.

O fluxo de demonstração usa `adapters/fake/DemoAiProvider`: não envia dados nem aceita chave.
O adaptador real não é conectado pela interface nesta versão; o onboarding decidirá o ciclo de
vida transitório da credencial e realizará a prova de viabilidade em navegador.

```bash
cd apps/pwa
npm ci
npm run dev
```

Antes de abrir uma alteração na PWA, execute:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Regras para mudanças clínicas

Descreva a fonte primária, a população e as limitações. Preserve as travas existentes ou
documente claramente qualquer alteração. Nunca use a IA para calcular a dose final e nunca
adicione dados pessoais ou chaves aos testes.
