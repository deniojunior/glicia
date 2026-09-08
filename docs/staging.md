# Ambiente de staging

O staging da Glicia usa infraestrutura hospedada e isolada do desenvolvimento local.

| Componente | Staging |
| --- | --- |
| PWA | projeto Vercel `glicia-staging`; `https://staging.glicia.app/` aguarda DNS |
| Supabase | projeto exclusivo, ainda a provisionar |
| Banco, Auth, Vault e Functions | Supabase hospedado |
| Deploy da PWA | Vercel Hobby integrada ao GitHub |
| Notificações da Glicia | Resend |
| Códigos e links de entrada | Supabase Auth gera; Resend entrega |

O projeto remoto atual `snsdnxlwdhadrehksati` e o projeto Vercel `glicia` atendem produção. Eles
não deverão ser usados para validar commits comuns da `main`. Em 8 de setembro de 2026, o projeto
Vercel `glicia-staging` foi criado com ID `prj_xhhkiyqGbJ2mNq69aEhe8NffnSc2`. O projeto Supabase
exclusivo de staging ainda não estava provisionado.

Staging não recebe cópia de usuários ou refeições reais. Migrations, configuração e Functions são
promovidas pelo código versionado; contas e dados de teste são criados diretamente no ambiente.

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

- variável `SUPABASE_PROJECT_REF`, com o ref do novo projeto exclusivo de staging;
- secret `SUPABASE_ACCESS_TOKEN`, com um token pessoal do Supabase;
- secret `SUPABASE_DB_PASSWORD`, com a senha do banco de staging;
- secret `VERCEL_TOKEN`, limitado ao projeto de staging;
- variáveis `VERCEL_ORG_ID` e `VERCEL_PROJECT_ID` do projeto de staging;
- variável `PUBLIC_APP_URL=https://staging.glicia.app`.

Os secrets usados pelas Edge Functions, incluindo `OPENAI_API_KEY`, continuam no Supabase e não
precisam ser copiados para o GitHub. Para que a publicação da PWA seja realmente condicionada à
CI, desative o deploy automático da integração Git da Vercel. O workflow constrói e publica
exatamente o commit validado.

## Secrets das Edge Functions

Copie `supabase/.env.example` para `supabase/.env.staging`, preencha os valores e aplique:

```bash
apps/pwa/node_modules/.bin/supabase secrets set \
  --project-ref "$SUPABASE_PROJECT_REF" \
  --env-file supabase/.env.staging
```

São obrigatórios para o fluxo completo de e-mail:

- `PUBLIC_APP_URL=https://staging.glicia.app`
- `GLICIA_ADMIN_EMAIL=glicia.app.admin@gmail.com`
- `GLICIA_EMAIL_FROM`, com remetente verificado no Resend
- `RESEND_API_KEY`

O domínio `glicia.app` está verificado no Resend. Para diferenciar mensagens de teste, staging
deverá usar um remetente próprio do domínio, como
`GLICIA_EMAIL_FROM="Glicia Staging <staging@glicia.app>"`. Se o remetente for alterado, ele deve
continuar pertencendo a um domínio verificado no Resend.

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
4. Cadastre em **Production** desse projeto de staging as variáveis `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_PUBLISHABLE_KEY` usando os valores de
   `.env.staging.example`.
5. Vincule `staging.glicia.app` somente a esse projeto e confirme que o bundle aponta para o
   Supabase de staging.

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
6. Informar o e-mail aprovado, digitar o OTP na própria PWA e concluir o onboarding; validar o
   magic link somente como contingência.
7. Registrar uma refeição fictícia, encerrar e então pedir “a mesma coisa que ontem”, conferindo
   que alimentos e carboidratos são recuperados, mas glicemia, tendência e dose não são copiadas.
8. Executar uma refeição fictícia usando a credencial central já configurada no backend.
9. Usar **Sair** na conversa, confirmar o retorno à entrada e repetir o login; a sessão de outros
   dispositivos não deve ser revogada.
10. Confirmar isolamento e histórico.

Use somente dados fictícios no staging.

## Promoção para produção

Somente a publicação de uma GitHub Release associada a uma tag SemVer aciona
`Promote production`. Criar ou enviar a tag isoladamente não publica produção. Crie previamente o
GitHub Environment `production`, cadastre um revisor obrigatório e use credenciais diferentes de
staging:

- secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` e `VERCEL_TOKEN`;
- variáveis `SUPABASE_PROJECT_REF`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` e `PUBLIC_APP_URL`.

O job sem secrets repete toda a qualidade, confirma que a tag aponta para um commit alcançável
pela `main` e exige um `Deploy staging` bem-sucedido para o mesmo SHA. Somente depois da aprovação
do Environment o job de deploy acessa as credenciais, renderiza a configuração Auth com a URL de
produção, publica Supabase e Vercel e executa o smoke test da PWA.

## Provisionamento pendente

Antes de habilitar `Deploy staging`:

1. criar um segundo projeto Supabase na organização da Glicia e guardar o ref e a senha somente no
   GitHub Environment `staging`;
2. usar o projeto Vercel `glicia-staging`, já criado e associado ao domínio, mantendo o deploy
   automático da integração Git desabilitado;
3. na GoDaddy, criar o CNAME `staging` apontando para
   `a37e263802e13a77.vercel-dns-017.com` e aguardar a emissão do certificado;
4. cadastrar variáveis publicáveis da PWA no projeto Vercel de staging e secrets operacionais nas
   Edge Functions do Supabase de staging;
5. criar os GitHub Environments `staging` e `production`, com `production` protegido por aprovação;
6. fazer merge em `main`, observar a CI e o deploy de staging e executar o checklist com dados
   fictícios antes de publicar qualquer GitHub Release.
