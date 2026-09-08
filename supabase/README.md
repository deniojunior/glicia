# Supabase

Esta pasta contém a infraestrutura versionada da PWA a partir da `v0.7.0-alpha`.

- `migrations/` cria as tabelas da conta, índices e RLS. A migration da `v0.9.0` remove as
  estruturas e os segredos BYOK depois da adoção da credencial central.
- `functions/ai-chat/` faz o proxy autenticado para a OpenAI; a chave e o modelo são lidos dos
  secrets centrais `OPENAI_API_KEY` e `OPENAI_MODEL` e nunca enviados ao navegador.
- `functions/delete-account/` exclui a conta autenticada e aciona a limpeza transacional dos
  dados associados.
- `functions/request-access/` registra participação sem criar conta e notifica o administrador.
- `functions/review-access-request/` lista e decide solicitações somente para administradores.
- `functions/_shared/` concentra autenticação, verificação da concessão, HTTP e adaptadores de
  e-mail para Mailpit e Resend.
- `tests/rls.sql` verifica RLS, isolamento entre contas, hook de criação, privilégios da fila,
  aprovação idempotente, remoção do BYOK e exclusão por cascata dentro de uma transação revertida.

## Desenvolvimento

A CLI está fixada nas dependências de desenvolvimento da PWA. Com Docker ativo, execute em
`apps/pwa`:

```bash
npm run supabase:start
npm run supabase:reset
npm run supabase:test
npm run supabase:status
```

`supabase start` sobe a stack completa em containers Docker: PostgreSQL, Auth, Data API, Edge
Runtime, Studio e Mailpit. A PWA local deve usar `http://127.0.0.1:54321` e a chave publicável
mostrada por `npm run supabase:status`; nunca use a chave `secret` ou `service_role` no navegador.

Para testar a conversa local, copie `supabase/functions/.env.example` para
`supabase/functions/.env` e preencha `OPENAI_API_KEY`. A CLI do Supabase carrega esse arquivo
automaticamente nas Edge Functions locais. Não reutilize a credencial de staging.

Os magic links locais não enviam e-mail real. Abra o Mailpit em `http://127.0.0.1:54324`, escolha
a mensagem recebida e clique no link. Solicitações e decisões também são entregues ali. Para
encerrar os containers preservando os volumes, use
`npm run supabase:stop`.

No ambiente hospedado, configure os valores de `supabase/.env.example` como Edge Function
secrets. `OPENAI_API_KEY` e `OPENAI_MODEL` são obrigatórios para a conversa. O domínio usado em
`GLICIA_EMAIL_FROM` precisa estar verificado no Resend.

O projeto hospedado `snsdnxlwdhadrehksati` atende atualmente a produção. Staging deverá usar um
segundo projeto Supabase, sem usuários, dados ou secrets compartilhados, e a PWA em
`https://staging.glicia.app/`; consulte `docs/staging.md` para o provisionamento e a validação.

Antes de aplicar no projeto remoto, use `npx supabase db push --dry-run --workdir ../..` e confirme
o diff. As chaves de publicação e os segredos das funções devem ser fornecidos por ambiente; nunca
os coloque em migrations ou no bundle.

As configurações de Auth também são IaC. Depois de revisar `config.toml`, aplique-as com
`npx supabase config push --workdir ../..`. O arquivo preserva explicitamente MFA, confirmação de
e-mail, frequência e tamanho do OTP para que um push não troque esses valores por defaults locais.
