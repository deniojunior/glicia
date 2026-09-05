# Privacidade e retenção

A PWA armazena apenas os dados necessários para manter a configuração e o histórico da pessoa.
Durante o piloto, o operador da instalação é responsável por informar participantes e atender
pedidos de acesso ou exclusão.

## Dados e retenção

| Dados | Retenção |
| --- | --- |
| Preferências clínicas e memória alimentar | Enquanto a conta existir. |
| Refeições confirmadas | Enquanto a pessoa mantiver o registro; podem ser apagadas individualmente ou em conjunto. |
| Solicitação aprovada | Enquanto a conta existir, para sustentar a concessão de acesso. |
| Solicitação pendente ou recusada | Até 90 dias após a última solicitação; a limpeza é uma rotina operacional do piloto. |
| Credenciais individuais antigas | Removidas na migration da v0.9; novas credenciais BYOK não são aceitas. |
| Logs técnicos | Sem conteúdo de saúde ou credenciais e pelo menor período oferecido pelo plano contratado. |

Apagar o histórico não altera parâmetros ou memória alimentar. **Excluir minha conta** remove de
forma permanente o usuário do Auth, preferências, memória, refeições, concessões administrativas
e o e-mail da fila de acesso. A remoção não pode ser desfeita pela interface.

Backups gerenciados podem conservar uma cópia temporária até o encerramento do ciclo do provedor.
Uma restauração operacional recupera o ambiente inteiro, não uma conta apagada seletivamente; por
isso, dados restaurados não devem ser usados para reativar uma pessoa que solicitou exclusão.

## Serviços envolvidos

- Supabase: autenticação, PostgreSQL e Edge Functions.
- OpenAI: estruturação da refeição enviada durante a conversa.
- Resend e o provedor de e-mail da pessoa: mensagens de solicitação, decisão e login.
- Vercel: arquivos estáticos da PWA; não recebe a chave OpenAI nem `service_role`.

Use dados fictícios em desenvolvimento, staging, issues e demonstrações públicas.
