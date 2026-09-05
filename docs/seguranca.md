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

## Controles da v0.9

| Risco | Controle atual |
| --- | --- |
| Acesso de pessoa não aprovada | Hook do Auth, concessão por `user_id` e nova verificação nas Edge Functions. |
| Leitura ou escrita entre contas | RLS por propriedade e concessão ativa; índices nas colunas usadas pelas políticas. |
| Exposição de credenciais | Secrets no backend, nenhuma variável secreta com prefixo `VITE_` e BYOK removido do banco. |
| XSS e conteúdo de IA | Markdown sem HTML, CSP, bloqueio de frames e política restrita de origens. |
| Exclusão incompleta | Remoção do usuário em Auth e cascata transacional para dados, concessão e e-mail de acesso. |
| Deploy não revisado | CI sem secrets, staging após CI e produção por tag em Environment protegido. |

Não registrar tokens, cabeçalhos de autorização, mensagens, refeições, glicemias ou respostas do
provedor em logs. Para diagnosticar falhas, use apenas horário, função, status HTTP, código interno
e identificadores técnicos que não revelem conteúdo.

## Rotação da credencial central

1. Gere uma nova chave no provedor e mantenha a anterior ativa.
2. Aplique `OPENAI_API_KEY` com `supabase secrets set` no ambiente escolhido.
3. Execute uma refeição fictícia e confirme que `ai-chat` devolve provedor e modelo.
4. Revogue a chave anterior no provedor.
5. Se a validação falhar, restaure imediatamente a chave anterior; não altere migrations.

Tokens de deploy também devem ser separados por ambiente, ter o menor escopo disponível e ser
rotacionados quando um mantenedor perder acesso ou houver suspeita de exposição.

## Riscos aceitos temporariamente

O piloto ainda não possui quota por pessoa, limite global de custo, classificação de intenção nem
defesas específicas contra prompt injection. O acesso aprovado reduz exposição, mas não elimina
esses riscos. Eles pertencem à `v0.10.0-alpha` e devem ser concluídos antes de ampliar o piloto.
