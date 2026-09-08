# Segurança da PWA

Este documento registra o modelo de ameaça mínimo do piloto fechado da Glicia. Ele não substitui
uma auditoria independente antes de ampliar o acesso.

## Ativos e fronteiras

- Glicemia, refeição, preferências, memória alimentar e histórico são dados associados à conta.
- A chave OpenAI central, a chave do provedor de e-mail e a credencial `service_role` existem
  somente nos secrets das Edge Functions.
- O navegador recebe apenas a URL e a chave publicável do Supabase.
- A PWA chama Edge Functions autenticadas; `ai-chat` chama a OpenAI e não registra o corpo da
  conversa. O cálculo de dose continua determinístico no navegador após confirmação humana.

## Controles até a v0.13

| Risco | Controle atual |
| --- | --- |
| Acesso de pessoa não aprovada | Hook do Auth, concessão por `user_id` e nova verificação nas Edge Functions. |
| Leitura ou escrita entre contas | RLS por propriedade e concessão ativa; índices nas colunas usadas pelas políticas. |
| Exposição de credenciais | Secrets no backend, nenhuma variável secreta com prefixo `VITE_` e BYOK removido do banco. |
| XSS e conteúdo de IA | Markdown sem HTML, CSP, bloqueio de frames e política restrita de origens. |
| Exclusão incompleta | Remoção do usuário em Auth e cascata transacional para dados, concessão e e-mail de acesso. |
| Deploy não revisado | CI sem secrets, staging após CI e produção por tag em Environment protegido. |
| Enumeração e abuso da entrada | Consulta por Edge Function, limites de 15 minutos por hash do e-mail e do cliente e OTP emitido somente após nova confirmação do estado aprovado. |
| Redirecionamento do link de entrada | O destino do magic link de contingência precisa ter a mesma origem de `PUBLIC_APP_URL`. |
| Consumo excessivo da IA | Reserva atômica no PostgreSQL, quotas diárias por pessoa, teto global de custo e limite de concorrência. |
| Prompt injection e desvio de finalidade | Instruções autoritativas no backend, contexto tratado como dado não confiável, fonte SBD validada por SHA-256 e schema estrito de saída. |
| Resposta a incidente | Pausa emergencial global e suspensão de concessões individuais no painel administrativo. |

Não registrar tokens, cabeçalhos de autorização, mensagens, refeições, glicemias ou respostas do
provedor em logs. Para diagnosticar falhas, use apenas horário, função, status HTTP, código interno
e identificadores técnicos que não revelem conteúdo.

A resposta da entrada diferencia os estados porque essa informação é necessária à experiência
solicitada. Isso permite inferir se um e-mail está na fila; o piloto aceita o risco residual com
limites por e-mail e cliente. A tabela privada de limites guarda somente hashes, elimina janelas
com mais de um dia na consulta seguinte e não é exposta à Data API. Uma ampliação pública exigirá
proteção especializada na borda.

## Rotação da credencial central

1. Gere uma nova chave no provedor e mantenha a anterior ativa.
2. Aplique `OPENAI_API_KEY` com `supabase secrets set` no ambiente escolhido.
3. Execute uma refeição fictícia e confirme que `ai-chat` devolve provedor e modelo.
4. Revogue a chave anterior no provedor.
5. Se a validação falhar, restaure imediatamente a chave anterior; não altere migrations.

Tokens de deploy também devem ser separados por ambiente, ter o menor escopo disponível e ser
rotacionados quando um mantenedor perder acesso ou houver suspeita de exposição.

## Métricas operacionais

Cada chamada registra somente pessoa, estado, tamanhos, tokens, custo estimado, latência, código de
falha e horários. Mensagens, memória, tabela, glicemia e resposta não são persistidas. As métricas
são privadas, agregadas para o painel administrativo e retidas por 90 dias.
