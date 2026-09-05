# Ambiente de staging

O staging da Glicia usa infraestrutura hospedada e isolada do desenvolvimento local.

| Componente | Staging |
| --- | --- |
| PWA | `https://glicia-ten.vercel.app/` |
| Supabase | projeto `snsdnxlwdhadrehksati` |
| Banco, Auth, Vault e Functions | Supabase hospedado |
| Deploy da PWA | Vercel Hobby integrada ao GitHub |
| Notificações da Glicia | Resend |
| Magic links | Supabase Auth |

O projeto remoto atual é staging, não produção. Um ambiente de produção deverá usar outro projeto
Supabase, outras chaves e outra URL.

## PWA local contra staging

Esta opção não usa Docker e é útil antes da publicação do frontend:

```bash
cd apps/pwa
cp .env.staging.example .env.staging.local
# informe somente a chave publicável do projeto
npm run dev:staging
```

O arquivo `.env.staging.local` é ignorado pelo Git. Nunca coloque uma chave `secret` ou
`service_role` em uma variável `VITE_*`.

## Deploy do backend

Os comandos abaixo apontam para o projeto vinculado de staging:

```bash
cd apps/pwa
npm run staging:check
npm run staging:deploy:db
npm run staging:deploy:functions
npm run staging:deploy:config
npm run staging:advisors
```

`staging:check` lista o histórico remoto e executa `db push --dry-run`. O deploy do banco nunca
inclui seed nem reset. Não execute `supabase db reset --linked`: ele apaga os dados remotos.

## GitHub Actions

O workflow `CI` valida CLI, PWA, Edge Functions, migrations e RLS sem receber secrets de deploy.
Depois de uma execução verde na `main`, `Deploy staging` publica exatamente o commit validado.

Crie o GitHub Environment `staging` e configure:

- variável `SUPABASE_PROJECT_REF=snsdnxlwdhadrehksati`;
- secret `SUPABASE_ACCESS_TOKEN`, com um token pessoal do Supabase;
- secret `SUPABASE_DB_PASSWORD`, com a senha do banco de staging;
- secret `VERCEL_TOKEN`, limitado ao projeto de staging;
- variáveis `VERCEL_ORG_ID` e `VERCEL_PROJECT_ID` do projeto de staging.

Os secrets usados pelas Edge Functions, incluindo `OPENAI_API_KEY`, continuam no Supabase e não
precisam ser copiados para o GitHub. Para que a publicação da PWA seja realmente condicionada à
CI, desative o deploy automático da integração Git da Vercel. O workflow constrói e publica
exatamente o commit validado.

## Secrets das Edge Functions

Copie `supabase/.env.example` para `supabase/.env.staging`, preencha os valores e aplique:

```bash
apps/pwa/node_modules/.bin/supabase secrets set \
  --project-ref snsdnxlwdhadrehksati \
  --env-file supabase/.env.staging
```

São obrigatórios para o fluxo completo de e-mail:

- `PUBLIC_APP_URL=https://glicia-ten.vercel.app`
- `GLICIA_ADMIN_EMAIL=glicia.app@gmail.com`
- `GLICIA_EMAIL_FROM`, com remetente verificado no Resend
- `RESEND_API_KEY`

Para a conversa também são obrigatórios:

- `OPENAI_API_KEY`, credencial central do projeto;
- `OPENAI_MODEL`, modelo validado e selecionado pelo operador.

O arquivo `supabase/.env.staging` é local e ignorado pelo Git.

## Publicação da PWA

Importe o repositório na Vercel e configure o projeto assim:

1. Selecione o plano Hobby e o repositório `glicia`.
2. Mantenha **Root Directory** na raiz do repositório. A PWA importa a tabela alimentar da CLI,
   portanto o build precisa receber o monorepo completo.
3. Confirme o framework **Vite**. Instalação, build e saída já estão versionados no
   `vercel.json` da raiz.
4. Cadastre em **Production** as variáveis `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_GLICIA_ADMIN_EMAIL` usando os valores de
   `.env.staging.example`.
5. Faça o deploy e confirme o domínio de produção `https://glicia-ten.vercel.app`.

A integração Git pode criar uma URL isolada para cada pull request, mas a publicação de `main`
fica sob responsabilidade do workflow após a CI. O `vercel.json` também mantém o fallback de SPA
e os cabeçalhos de segurança. Se o domínio for alterado, atualize este documento,
`supabase/config.toml` e `PUBLIC_APP_URL` antes de aplicar a configuração hospedada.

Somente a chave publicável do Supabase pode usar o prefixo `VITE_`. Não cadastre `service_role`,
chave OpenAI ou `RESEND_API_KEY` na Vercel.

## Checklist do fluxo completo

1. Abrir a URL de staging no celular.
2. Solicitar acesso com um e-mail de teste.
3. Confirmar a notificação recebida pelo administrador.
4. Abrir a revisão, autenticar a conta administrativa e aprovar.
5. Confirmar a mensagem de aprovação no e-mail solicitado.
6. Entrar por magic link e concluir o onboarding.
7. Executar uma refeição fictícia usando a credencial central já configurada no backend.
8. Confirmar isolamento, histórico e saída da conta.

Use somente dados fictícios no staging.

## Promoção para produção

Tags SemVer, como `v0.9.0-alpha`, acionam `Promote production`. Crie previamente o GitHub
Environment `production`, cadastre um revisor obrigatório e use credenciais diferentes de
staging:

- secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` e `VERCEL_TOKEN`;
- variáveis `SUPABASE_PROJECT_REF`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` e `PUBLIC_APP_URL`.

O job sem secrets repete toda a qualidade e confirma que a tag aponta para um commit alcançável
pela `main`. Somente depois da aprovação do Environment o job de deploy acessa as credenciais,
renderiza a configuração Auth com a URL de produção e publica Supabase e Vercel.
