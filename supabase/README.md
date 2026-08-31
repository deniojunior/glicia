# Supabase

Esta pasta contém a infraestrutura versionada da `v0.7.0-alpha`.

- `migrations/` cria as tabelas da conta, índices e RLS; a gravação de credenciais usa um RPC
  interno com execução concedida exclusivamente ao `service_role` da Edge Function.
- `functions/ai-chat/` faz o proxy autenticado para a OpenAI; a chave é lida do Vault e nunca enviada ao navegador.
- `functions/store-ai-connection/` valida a sessão e a chave e grava Vault/metadados em uma
  transação curta, sem aceitar `user_id` do navegador.
- `tests/rls.sql` verifica RLS, isolamento entre contas, bloqueio de escrita cruzada, privilégios
  do RPC interno e criação/rotação fictícia no Vault dentro de uma transação revertida.

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

Os magic links locais não enviam e-mail real. Abra o Mailpit em `http://127.0.0.1:54324`, escolha
a mensagem recebida e clique no link. Para encerrar os containers preservando os volumes, use
`npm run supabase:stop`.

Antes de aplicar no projeto remoto, use `npx supabase db push --dry-run --workdir ../..` e confirme
o diff. As chaves de publicação e os segredos das funções devem ser fornecidos por ambiente; nunca
os coloque em migrations ou no bundle.

As configurações de Auth também são IaC. Depois de revisar `config.toml`, aplique-as com
`npx supabase config push --workdir ../..`. O arquivo preserva explicitamente MFA, confirmação de
e-mail, frequência e tamanho do OTP para que um push não troque esses valores por defaults locais.
