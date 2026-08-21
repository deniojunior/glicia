# Uso do terminal

Execute `glicia` após configurar `OPENAI_API_KEY`. Descreva o que vai consumir em linguagem natural. A IA perguntará apenas pelos dados necessários para fechar quatro parâmetros: carboidratos, glicemia, tendência e refeição.

Quando os dados estiverem completos, o aplicativo exibe um resumo estruturado. Revise-o e responda `sim` uma única vez para confirmar ou informe a correção. O cálculo só ocorre após essa confirmação.

## Comandos

| Comando | Efeito |
| --- | --- |
| `/config` | Abre a visualização de parâmetros clínicos, sem mostrar a chave da OpenAI. |
| `/edit` | Dentro de `/config`, inicia a edição de um parâmetro. |
| `/mode` | Mostra o modo atual e oferece a troca entre Preciso e Rápido. |
| `/quit` ou `/exit` | Encerra o aplicativo. |
| `/mode preciso` | Seleciona o modo Preciso. |
| `/mode rapido` | Seleciona o modo Rápido. |

O aplicativo permanece aberto depois da sugestão e também após um alerta de hipoglicemia. Use `/quit` ou `/exit` para encerrar.

## Histórico

Depois de uma sugestão, informe a quantidade de insulina realmente aplicada. Pressione Enter se ela ainda não estiver disponível. O Glicia salva o registro localmente e retorna ao início para a próxima refeição.

## Editar parâmetros

Use `/config` e depois `/edit`. Escolha o número correspondente e informe o novo valor. O terminal mostra a alteração proposta e pede confirmação antes de salvar. Estão disponíveis: glicemia-alvo, fator de sensibilidade, basal matinal, limite de hipoglicemia e RIC de cada refeição.

## Modos e memória alimentar

No modo **Preciso**, a IA não infere tipo de alimento, porção, peso, volume ou marca se isso puder alterar significativamente a contagem. Primeiro consulta a memória alimentar e, se ela não resolver, pergunta antes de calcular.

No modo **Rápido**, a IA também consulta a memória, mas pode estimar com base na tabela e no contexto. Ela identifica brevemente os valores estimados e pergunta apenas se não houver estimativa minimamente confiável.

A memória tem sempre esta prioridade: informação explícita da mensagem atual, preferência alimentar confirmada e regra do modo. Só são memorizadas preferências declaradas ou confirmadas pela pessoa; estimativas e inferências não são gravadas.
