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

A PWA não solicita uma chave OpenAI. A conversa chama a Edge Function autenticada `ai-chat`, que
usa `OPENAI_API_KEY` e `OPENAI_MODEL` configurados pelo operador nos secrets do Supabase. O
navegador não recebe a chave nem chama a OpenAI diretamente. O cálculo e as travas continuam
locais e determinísticos após a confirmação.

Desde a `v0.8.0-alpha`, `request-access` recebe solicitações públicas sem criar conta e
`review-access-request` exige uma conta presente em `app_admins`. O hook de Auth bloqueia novas
contas sem aprovação e todas as Edge Functions autenticadas verificam também uma concessão ativa.
Na `v0.9.0-alpha`, `delete-account` remove a conta e seus dados, e o modo manual permite concluir
o fluxo quando o provedor de IA estiver indisponível.

Na `v0.10.0-alpha`, a mesma função `request-access` consulta o estado de admissão e gera, por meio
da API administrativa do Auth, um OTP somente para endereços aprovados. A entrega usa o adaptador
de e-mail da Glicia: Mailpit localmente e Resend nos ambientes hospedados. Assim, o login digitável
não depende de personalizar o template ou o SMTP padrão do Supabase; o e-mail inclui um magic link
como contingência. A consulta pública tem limites por hash do e-mail e do cliente.

```bash
cd apps/pwa
npm ci
npm run supabase:start
npm run supabase:reset
npm run supabase:test
npm run dev
```

Copie `.env.example` para `.env.local` e informe `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_GLICIA_ADMIN_EMAIL`. A chave publicável pode ficar no
navegador porque o acesso aos dados depende da sessão e das políticas RLS. Nunca use uma chave
`secret` ou `service_role` na PWA.
Os comandos Supabase exigem Docker ativo. Obtenha os valores locais com
`npm run supabase:status`: use `API URL` e `Publishable key`, nunca os campos privilegiados.
Copie `supabase/functions/.env.example` para `supabase/functions/.env` e informe a credencial
OpenAI exclusiva do desenvolvimento para habilitar a conversa local; o arquivo é ignorado pelo
Git.

O `npm run supabase:start` usa os containers gerenciados pela Supabase CLI — PostgreSQL, Auth,
Data API, Edge Functions, Studio e Mailpit — e não acessa o projeto remoto. No fluxo local, abra
`http://127.0.0.1:54324` para ler o código ou o magic link interceptado pelo Mailpit. Use
`npm run supabase:stop` quando terminar; os dados locais são preservados.
As notificações de solicitação e decisão também chegam ao Mailpit pela API HTTP local. Em
produção, copie `supabase/.env.example`, configure URL pública, remetente verificado e chave
Resend, adicione a chave e o modelo centrais da OpenAI e envie esses valores como secrets das
Edge Functions. Nunca use o prefixo `VITE_` para esses valores.
Cadastre a URL pública da PWA e a URL local de desenvolvimento na lista de Redirect URLs do
Supabase Auth; o magic link só retorna para endereços permitidos pelo projeto.
O `supabase/config.toml` usa `https://www.glicia.app/` como Site URL de staging e mantém também o
domínio sem `www`, a URL antiga da Vercel, `localhost` e `127.0.0.1` na lista de Redirect URLs para desenvolvimento híbrido. Revise o
diff de `npm run staging:deploy:config` antes de confirmar mudanças de Auth.

O link de revisão exige a conta definida em `VITE_GLICIA_ADMIN_EMAIL`, não o e-mail da pessoa que
solicitou acesso. Depois do magic link, o navegador retorna à mesma solicitação administrativa.

Para trabalhar sem Docker contra o backend hospedado, copie `.env.staging.example` para
`.env.staging.local` e execute `npm run dev:staging`. O procedimento completo de deploy e teste
está em [staging.md](staging.md).

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
