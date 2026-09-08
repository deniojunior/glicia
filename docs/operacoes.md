# Operação e recuperação

## Falhas esperadas

- **OpenAI indisponível:** não repita envios indefinidamente. Use **Informar sem IA**, confira os
  quatro campos e prossiga pela mesma confirmação e cálculo local.
- **Rede indisponível:** a interface instalada pode abrir do cache, mas login, sincronização e
  conversa dependem do Supabase. Não prometa gravação enquanto a chamada remota não concluir.
- **Sessão expirada:** volte à entrada e solicite outro magic link com o e-mail aprovado.
- **E-mail não recebido:** confira spam, endereço aprovado e configuração do Resend; no ambiente
  local, abra o Mailpit.

## Diagnóstico da integração de IA

No Dashboard do Supabase, abra **Edge Functions → ai-chat → Invocations** e reproduza a falha. A
invocação mostra status HTTP e duração; a aba **Logs** mostra eventos da plataforma e mensagens
estruturadas emitidas pela função. Nunca registre chave, token de sessão, cabeçalhos, e-mail,
glicemia, refeição, prompt ou resposta do provedor.

Interprete primeiro o status da invocação:

- `401`: sessão ausente ou expirada;
- `403`: conta sem concessão ativa;
- `400`: payload da conversa inválido;
- `413`: conversa acima do limite aceito;
- `429`: quota por pessoa, concorrência ou limite do provedor;
- `500` ou `503`: configuração ou verificação interna indisponível;
- `502` ou outro erro do provedor: credencial recusada, modelo ou resposta inválida.

A CLI lista somente nomes e hashes dos secrets, nunca seus valores:

```bash
apps/pwa/node_modules/.bin/supabase secrets list \
  --project-ref snsdnxlwdhadrehksati
```

Para sincronizar novamente o arquivo local ignorado pelo Git e republicar a função:

```bash
apps/pwa/node_modules/.bin/supabase secrets set \
  --env-file supabase/.env.staging \
  --project-ref snsdnxlwdhadrehksati

cd apps/pwa
npm run staging:deploy:functions
```

Não cole a chave em comandos, issues, logs ou conversas. Valide uma chave real somente com uma
requisição fictícia e sem dados de usuário.

## Controles de IA

A revisão administrativa mostra consumo agregado do dia e permite **Pausar IA**, **Reativar IA**,
**Suspender acesso** e **Reativar acesso**. A pausa não impede o modo manual nem apaga reservas em
andamento; novas chamadas são recusadas. Os valores iniciais ficam em
`private.ai_runtime_config`: 40 chamadas e 2 milhões de tokens por pessoa/dia, USD 1 de custo
global estimado/dia e 4 chamadas simultâneas.

Execute mensalmente `select private.purge_ai_request_metrics();` com credencial administrativa
para remover métricas com mais de 90 dias. Altere limites diretamente somente com uma migration
revisada ou durante resposta operacional documentada.

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
