# Operação e recuperação

## Falhas esperadas

- **OpenAI indisponível:** não repita envios indefinidamente. Use **Informar sem IA**, confira os
  quatro campos e prossiga pela mesma confirmação e cálculo local.
- **Rede indisponível:** a interface instalada pode abrir do cache, mas login, sincronização e
  conversa dependem do Supabase. Não prometa gravação enquanto a chamada remota não concluir.
- **Sessão expirada:** volte à entrada e solicite outro magic link com o e-mail aprovado.
- **E-mail não recebido:** confira spam, endereço aprovado e configuração do Resend; no ambiente
  local, abra o Mailpit.

## Recuperação do banco

As migrations em `supabase/migrations` são a fonte versionada do esquema. Antes de uma migration
destrutiva, confirme o backup do ambiente no painel da Supabase e execute `staging:check`. Para
validar a reconstrução do esquema em ambiente isolado:

```bash
cd apps/pwa
npm run supabase:start
npm run supabase:reset
npm run supabase:test
```

Uma recuperação hospedada deve acontecer primeiro em outro projeto Supabase, nunca sobre o único
ambiente utilizável. Depois da restauração:

1. confirme migrations, Auth hooks e RLS;
2. aplique secrets próprios do ambiente — eles não pertencem ao repositório;
3. publique e teste as Edge Functions com dados fictícios;
4. valide login, modo manual, conversa, histórico e exclusão em uma conta de teste;
5. somente então altere DNS, URL pública ou tráfego.

Não copie manualmente registros do Vault entre projetos. A v0.9 não usa Vault para credenciais de
IA; os secrets centrais devem ser cadastrados novamente no destino.

## Limpeza de solicitações

Durante o piloto, execute mensalmente `select private.purge_expired_access_requests();` com uma
credencial administrativa. A função aceita somente `service_role` e remove solicitações
pendentes ou recusadas, sem conta, cuja `last_requested_at` tenha mais de 90 dias. Registre apenas
a quantidade removida, sem copiar endereços de e-mail para logs ou tickets.

## Reversão de deploy

- PWA: promova novamente o último deployment saudável na Vercel.
- Edge Functions: publique a revisão anterior compatível.
- Banco: migrations já aplicadas não devem ser revertidas manualmente. Corrija com uma nova
  migration compatível ou restaure em ambiente isolado quando houver perda de dados.
- Credenciais: restaure o secret anterior e valide uma refeição fictícia antes de revogar chaves.
