# Configuração

O Glicia lê variáveis de ambiente ao iniciar. Defina-as no shell ou no ambiente seguro de execução; não versione chaves em `.env` ou arquivos de código.

```bash
export OPENAI_API_KEY="..."
export TARGET_GLUCOSE="120"
export CORRECTION_FACTOR="40"
export CARBOHYDRATE_RATIO_CAFE_DA_MANHA="8"
```

As RICs representam gramas de carboidrato cobertas por uma unidade de insulina. Todos os parâmetros clínicos devem ser definidos pela equipe que acompanha a pessoa usuária. Consulte a tabela completa no README.

`FOOD_TABLE_PATH` aceita um CSV com as colunas `Alimento`, `Medida usual`, `g ou ml` e `CHO (g)`. Linhas vazias ou sem esses valores são ignoradas.

`GLICIA_HISTORY_PATH` define o arquivo SQLite do histórico. O padrão é `~/.glicia/history.sqlite3`.

## Preferências locais

O modo, a memória alimentar e os parâmetros alterados pelo comando `/config` são armazenados em `~/.glicia/preferences.json`. O arquivo não contém glicemias, conversas ou a chave da OpenAI.

Os valores editados pelo terminal têm prioridade sobre os padrões e as variáveis de ambiente nas próximas execuções. A edição exige uma confirmação explícita e aceita apenas números finitos; RIC, fator de correção, meta e limite de hipoglicemia devem ser maiores que zero, enquanto a basal pode ser zero ou positiva.

## PWA e notificações de acesso

A PWA usa `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no navegador.
O e-mail administrativo é digitado na entrada; a permissão é validada por `app_admins`. Nunca
publique `service_role`, a chave secreta do projeto, a chave OpenAI central ou a chave do
serviço de e-mail em uma variável `VITE_*`.

As Edge Functions de admissão usam:

| Variável | Ambiente | Finalidade |
| --- | --- | --- |
| `PUBLIC_APP_URL` | staging e produção | URL usada nos links de revisão e entrada. |
| `GLICIA_ADMIN_EMAIL` | staging e produção | Destinatário institucional das novas solicitações. |
| `GLICIA_EMAIL_FROM` | staging e produção | Remetente pertencente a um domínio verificado. |
| `RESEND_API_KEY` | staging e produção | Credencial do adaptador que envia notificações e códigos de acesso. |
| `MAILPIT_API_URL` | local, opcional | API do Mailpit quando a porta padrão não puder ser usada. |
| `OPENAI_API_KEY` | local, staging e produção | Credencial central lida somente por `ai-chat`. |
| `OPENAI_MODEL` | local, staging e produção | Modelo selecionado pelo operador. |

`GLICIA_ADMIN_EMAIL=glicia.app.admin@gmail.com` define o destinatário das revisões.
Essa é a única conta administradora, provisionada pela migration `single_project_admin`.
`deniofriacamoreirajr@gmail.com` é usuário comum de teste. `glicia.app@gmail.com` é a conta de
comunicação e não possui acesso ao sistema. O remetente Resend continua usando o domínio verificado.

O desenvolvimento local seleciona Mailpit automaticamente. Produção falha de forma segura se o
Resend ou o remetente não estiverem configurados; as chaves devem ser gravadas com o mecanismo de
secrets do Supabase, nunca em migrations ou no Git.

O OTP é gerado pelo Supabase Auth na Edge Function e entregue pelo mesmo adaptador de e-mail da
Glicia. Não é necessário personalizar o template de Auth nem configurar o SMTP padrão do
Supabase. O link de contingência somente aceita destinos na origem definida por `PUBLIC_APP_URL`.
