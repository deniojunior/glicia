# Uso do terminal

Execute `glicia` após configurar `OPENAI_API_KEY`. Descreva o que vai consumir em linguagem natural. A IA perguntará apenas pelos dados necessários para fechar quatro parâmetros: carboidratos, glicemia, tendência e refeição.

Quando os dados estiverem completos, revise o resumo e responda `sim` para confirmar ou informe a correção. O cálculo só ocorre após essa confirmação.

## Comandos

| Comando | Efeito |
| --- | --- |
| `/config` | Exibe parâmetros ativos, sem mostrar a chave da OpenAI. |
| `/mode` | Mostra o modo atual e oferece a troca entre Preciso e Rápido. |
| `/mode preciso` | Seleciona o modo Preciso. |
| `/mode rapido` | Seleciona o modo Rápido. |

O processo termina depois de exibir uma sugestão ou quando a glicemia estiver abaixo do limite de hipoglicemia configurado.

## Modos e memória alimentar

No modo **Preciso**, a IA não infere tipo de alimento, porção, peso, volume ou marca se isso puder alterar significativamente a contagem. Primeiro consulta a memória alimentar e, se ela não resolver, pergunta antes de calcular.

No modo **Rápido**, a IA também consulta a memória, mas pode estimar com base na tabela e no contexto. Ela identifica brevemente os valores estimados e pergunta apenas se não houver estimativa minimamente confiável.

A memória tem sempre esta prioridade: informação explícita da mensagem atual, preferência alimentar confirmada e regra do modo. Só são memorizadas preferências declaradas ou confirmadas pela pessoa; estimativas e inferências não são gravadas.
