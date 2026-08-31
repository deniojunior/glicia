# Desenvolvimento

## Estrutura do monorepo

```text
apps/
├── cli/                    # pacote e testes Python
└── pwa/                    # projeto TypeScript/React
packages/
└── contracts/              # schemas e fixtures entre linguagens
supabase/                    # migrations, Edge Functions e testes de RLS
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

A PWA está em `apps/pwa`, com React, Vite, TypeScript, Vitest, Supabase JS e o manifesto de instalação.
Ela consome as fixtures de `packages/contracts` diretamente nos testes, para preservar a paridade
com a CLI. A partir da `v0.7.0-alpha`, Supabase Auth protege o onboarding e adaptadores remotos
persistem preferências, memória alimentar e histórico sob RLS.

A chave OpenAI é enviada somente à Edge Function autenticada `store-ai-connection`, validada e
cifrada no Vault. A conversa chama `ai-chat`; o navegador não recebe a chave nem chama a OpenAI
diretamente. O cálculo e as travas continuam locais e determinísticos após a confirmação.

```bash
cd apps/pwa
npm ci
npm run supabase:start
npm run supabase:reset
npm run supabase:test
npm run dev
```

Copie `.env.example` para `.env.local` e informe `VITE_SUPABASE_URL` e
`VITE_SUPABASE_PUBLISHABLE_KEY`. A chave publicável pode ficar no navegador porque o acesso aos
dados depende da sessão e das políticas RLS. Nunca use uma chave `secret` ou `service_role` na PWA.
Os comandos Supabase exigem Docker ativo. Obtenha os valores locais com
`npm run supabase:status`: use `API URL` e `Publishable key`, nunca os campos privilegiados.

O `npm run supabase:start` usa os containers gerenciados pela Supabase CLI — PostgreSQL, Auth,
Data API, Edge Functions, Studio e Mailpit — e não acessa o projeto remoto. No fluxo local, abra
`http://127.0.0.1:54324` para ler o magic link interceptado pelo Mailpit. Use
`npm run supabase:stop` quando terminar; os dados locais são preservados.
Cadastre a URL pública da PWA e a URL local de desenvolvimento na lista de Redirect URLs do
Supabase Auth; o magic link só retorna para endereços permitidos pelo projeto.
O `supabase/config.toml` já versiona `http://localhost:5173`; quando existir uma hospedagem,
substitua `auth.site_url`, acrescente o domínio a `auth.additional_redirect_urls` e revise o diff
de `npx supabase config push` antes de confirmar.

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
