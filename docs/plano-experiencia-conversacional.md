# Plano: conversar com a amiga Glicia

Planejamento registrado em 2026-09-06 e implementado inicialmente no mesmo dia, baseado na nova
[identidade visual](identidade-visual.md). Chat, onboarding conversacional, Poppins, avatar e
ícones foram entregues no código e aguardam validação em dispositivo e publicação. Variantes de
avatar, logo vetorial, migração de contas existentes e fluxo “não tenho esse valor agora” seguem
planejados.

## Objetivo e direção

A pessoa abre a PWA e encontra a Glicia para conversar sobre sua refeição. Avatar, texto,
respostas e controles pertencem a uma conversa contínua. O sucesso é conseguir descrever uma
refeição, revisar os dados, compreender a sugestão calculada e registrar o que fez, com pouca
informação competindo na tela.

Público e contexto: pessoas aprovadas no piloto, frequentemente no celular e prestes a comer.
Modo da interface: **operar**, com foco na tarefa. A identidade já foi escolhida na prancha;
a implementação será code-first. Proposta de prioridade: executar este incremento de experiência
antes de múltiplos provedores. Sua versão ainda será definida, sem renumerar silenciosamente
os marcos `v0.11`–`v0.13` existentes.

## Ponto de partida observado

- `components/onboarding.tsx` possui boas-vindas, cinco RICs/modo e revisão genérica; o
  fluxo atual não oferece edição de todos os parâmetros antes de concluir.
- `domain/onboarding.ts` inicializa valores por `createClinicalSettings`; `domain/settings.ts`
  contém valores padrão. Um rascunho preenchido não comprova revisão pessoal desses valores.
- `App.tsx` já tem mensagens, entrada livre, correção, confirmação, resultado, histórico e
  encerramento; resumo e resultado aparecem em blocos separados do feed.
- `application/session.ts` já controla coleta, confirmação e correção. `application/meal-decision.ts`
  e `domain/insulin.ts` mantêm o cálculo e as travas fora da IA.
- As instruções atuais da IA são montadas em `adapters/openai/instructions.ts`; a Edge Function
  recebe essas instruções. A voz deve ser atualizada no caminho realmente utilizado. Tornar as
  instruções autoritativas no backend continua no marco de guardrails.
- O visual atual usa verde/petróleo, outra fonte e a logo anterior. A troca precisa alcançar
  login, chat, onboarding, ajustes, histórico e estados de erro para ficar coerente.

## Experiência da conversa

Primeiro viewport proposto no celular:

```text
Avatar  Glicia                       Menu

Glicia: Oi! O que você vai comer?
        Pode me contar do seu jeito.

       [mensagens e respostas]
       [revisão quando necessária]

[Escreva para a Glicia…]         [Enviar]
```

O menu concentra Histórico, Ajustes, ajuda e Sair, com rótulos acessíveis. O modo atual fica
disponível em Ajustes ou no menu da conversa; não precisa de um seletor permanente no feed.
O acesso ao preenchimento manual continua fácil de encontrar. Não criar uma tela inicial de
atalhos antes do chat. Preservar o rascunho ao abrir áreas secundárias e retornar.

O exemplo de primeira mensagem deve continuar admitindo todos os dados juntos:
“Vou almoçar arroz, feijão e frango; glicemia 120, seta estável.” Porções e demais dados faltantes
são perguntados conforme o modo atual. Não voltar a exigir alimento primeiro e glicemia depois.

Fluxo da refeição:

1. Glicia acolhe ou retoma; a pessoa escreve ou usa o ditado do teclado.
2. A Glicia organiza a mensagem e pergunta somente o que faltar ou estiver ambíguo.
3. Um bloco dentro da conversa mostra alimentos, porções, carboidratos, fonte, glicemia,
   tendência e tipo de refeição. Ações: **Confirmar dados** e **Corrigir**.
4. A confirmação aciona o caso de uso atual. O resultado aparece como mensagem estruturada,
   identificada como sugestão calculada; **Como cheguei a esse valor** abre a decomposição real.
5. A dose realmente aplicada continua opcional. **Registrar e encerrar** salva a refeição;
   somente após confirmação da persistência a interface anuncia que registrou.
6. **Nova refeição** inicia outra sessão. A conversa visual não autoriza reutilizar glicemia,
   tendência ou dose da sessão encerrada.

Mensagens de resultado são renderizadas a partir do domínio, nunca de um número inventado
no texto da IA. Ao corrigir a refeição, substituir a revisão pendente e invalidar suas ações
anteriores. Uma mensagem antiga não pode confirmar novamente ou salvar outra dose.
No histórico contextual, mostrar candidatos com data e refeição e recolher dados atuais antes
de confirmar. Em falhas, preservar o texto e evitar envios/registros duplicados.

## Onboarding: a Glicia apresenta e prepara a conversa

O acesso permanece: e-mail → aprovação quando necessária → código na PWA → primeiro uso.
Depois do login aprovado, a Glicia conduz um roteiro de mensagens curtas com respostas rápidas
e campos numéricos incorporados. O roteiro é determinístico: não depende da IA disponível nem
de inferências do modelo para aceitar parâmetros clínicos.

| Etapa | Mensagem/intenção | Resposta ou controle |
| --- | --- | --- |
| Boas-vindas | “Oi, eu sou a Glicia, sua assistente virtual para contar carboidratos. Vou te mostrar como funciona e preparar seus ajustes.” | **Vamos começar** |
| Contagem | “Você me conta os alimentos e as porções. Eu uso a tabela de alimentos da Glicia para estimar os carboidratos e te mostro o resumo para conferir.” | **Continuar**; exemplo fictício opcional |
| Sugestão | “Depois que você confirma, a Glicia calcula uma sugestão de insulina usando os parâmetros que você informou. A IA ajuda na refeição; a dose vem desse cálculo.” | **Entendi**; **Como funciona o cálculo** |
| Limites | Explicar que os parâmetros vêm da equipe de saúde, não há cálculo de insulina ativa nem leitura automática do sensor. | Texto curto e ajuda disponível |
| Parâmetros | “Vamos conferir os valores definidos com sua equipe de saúde?” | Glicemia-alvo, fator de correção, limite de hipoglicemia e basal matinal, com unidades e explicações |
| RICs | “Qual é o seu RIC em cada refeição? Ele indica quantos gramas de carboidrato correspondem a uma unidade de insulina.” | Cinco campos, com opção de repetir um valor entre refeições mediante confirmação |
| Preferência | Explicar Preciso e Rápido sem alterar confirmação ou travas. | Escolha; Preciso pode ser a preferência inicial de interface |
| Revisão | “Confere seus ajustes antes de começarmos?” | Resumo de todos os parâmetros, cinco RICs e modo; **Editar** e confirmação explícita |
| Primeira conversa | “Tudo pronto. Me conta o que você vai comer.” | Compositor normal do chat |

Apresentar uma pergunta ou um pequeno grupo relacionado por vez, sem despejar o roteiro
inteiro no feed. Explicações detalhadas ficam em **Saiba mais**. O percurso obrigatório não
exige um quiz, nome/apelido ou dados novos de perfil. Nome de preferência pode ser estudado
depois, sem bloquear a primeira refeição.

Parâmetros novos começam sem valor pessoal confirmado. Mostrar unidade ao lado de cada campo:
glicemia em mg/dL, fator de correção em mg/dL por U, RIC em g/U e basal em U. Validar entradas
finitas e limites do domínio; aceitar vírgula decimal sem converter campo vazio em zero.
Não inferir RIC ausente a partir de outra refeição. Repetir um valor é ação explícita.

Oferecer **Não tenho esse valor agora** para salvar o progresso e orientar a retomada, sem
inventar números. A primeira refeição com cálculo continua condicionada à configuração completa.
Explicações podem ser revistas; entradas obrigatórias e revisão final não podem ser puladas.
Falha ao salvar mantém os valores na tela e permite tentar novamente. A etapa seguinte não
deve anunciar “salvo” antes da confirmação da persistência.

### Como explicar o cálculo existente

O texto deve descrever o comportamento do software, sem prescrever parâmetros. A explicação
curta separa estimativa de carboidratos e sugestão calculada. No detalhamento, usar os dados
reais confirmados e os resultados do domínio para mostrar:

- cobertura dos carboidratos: carboidratos totais divididos pelo RIC daquela refeição;
- correção: diferença entre glicemia informada e alvo dividida pelo fator de correção;
- ajuste de tendência: valor retornado pelas faixas implementadas;
- total, arredondamento e sugestão não negativa conforme a implementação atual.

Não prometer que essa conta inclui insulina ativa. A basal matinal é um dado registrado na
configuração/histórico atual; ela não entra na fórmula de bolus em `domain/insulin.ts`.
Não apresentá-la como desconto da dose. As travas atuais de hipoglicemia e aviso de queda
rápida prevalecem sobre a apresentação normal do resultado. Não introduzir novas regras
clínicas neste redesenho. Exemplos educativos usam dados fictícios e não geram registros.

### Instalação e pessoas que já usam

Instalação é opcional. Oferecê-la em um momento tranquilo após a apresentação ou ao concluir,
com instruções da plataforma e possibilidade de dispensar. Não interromper a coleta de dados
da refeição com o convite. Manter o código de acesso digitável dentro da PWA.

Pessoas com configuração válida recebem uma apresentação curta da nova Glicia, dispensável,
e preservam preferências/histórico. Não repetir todo o onboarding. Como a versão anterior
aceita parâmetros padrão, planejar uma revisão única dos parâmetros sem confirmação pessoal
registrada antes do próximo cálculo; preservar os números salvos e não fingir que sua origem
é conhecida. Rascunhos antigos retomam numa etapa compatível, sem serem considerados completos
somente por conterem valores padrão.

## Entregas e critérios de aceite

| Ordem | Entrega | Evidência de conclusão |
| --- | --- | --- |
| 1 | Assets finais e tokens | Avatar/logo isoladas, ícones legíveis, fonte local licenciada e cores verificadas em contraste |
| 2 | Chat com a Glicia | Fluxo atual completo dentro da conversa; ações de confirmação/correção preservadas; teclado móvel utilizável |
| 3 | Onboarding conversacional | Roteiro, parâmetros completos, retomada, revisão explícita e transição para a primeira refeição |
| 4 | Coerência e transição | Login, ajustes e histórico no novo estilo; contas/rascunhos existentes preservados |
| 5 | Validação e publicação | Paridade e fluxos testados, inspeção mobile/desktop, validação com piloto e documentação/release atualizadas |

Organização sugerida em `apps/pwa/src`, extraindo apenas componentes que tiverem uso real:

```text
components/
  brand/          avatar e marca
  chat/           mensagens, compositor, revisão e resultado
  onboarding/     mensagens do roteiro e campos incorporados
application/      orquestração e persistência do progresso
domain/           estados e validação; cálculo atual preservado
adapters/         repositórios e provedor existentes
```

Evoluir o progresso de onboarding com versão e migração compatível: separar rascunhos incompletos
de preferências válidas, registrar etapa/revisão e serializar salvamentos para evitar que uma
resposta antiga sobrescreva a etapa nova. Inspecionar o repositório real de preferências antes
de decidir se é necessária migration SQL. Conclusão só ocorre depois de persistir ajustes
válidos; uma falha ao limpar o rascunho não pode invalidar uma configuração salva.

Não persistir um transcript educativo inteiro se etapa e respostas estruturadas forem suficientes.
Não enviar parâmetros pessoais à IA para gerar o onboarding. Não ampliar o esquema clínico,
criar novo backend ou reescrever o domínio por causa dos componentes de chat.

Verificação proporcional à implementação:

- Contratos existentes continuam produzindo os mesmos resultados na CLI e na PWA.
- Fluxos: mensagem completa, dado ausente, correção, confirmação única, bloqueio, resultado,
  histórico contextual e registro com/sem dose aplicada.
- Onboarding: valores vazios/inválidos, vírgula decimal, voltar/editar, pausa, falha de rede,
  reabertura, rascunho anterior e conta existente.
- IA: mudança de voz preserva schema, fonte nutricional, modos e ausência de dose no texto.
- Interface: 320 px e celular com teclado, desktop, zoom, foco, leitor de tela e redução de movimento;
  compositor não cobre a última mensagem nem controles de revisão.
- Piloto consegue explicar que carboidratos são uma estimativa revisável e de onde vêm os
  parâmetros da sugestão, sem precisar conhecer detalhes técnicos.

## Fora desta entrega e decisões de preparação

Não incluir captura/transcrição própria de áudio, análise por foto, integração com sensor,
passkeys, novo provedor ou novas regras de dose. O ditado do teclado continua disponível.
Guardrails de IA e quotas permanecem no marco já planejado.

Na preparação dos assets, validar a variante final de avatar/ícone em tamanho pequeno e a
origem dos arquivos de marca. A prancha tem várias opções, não uma escolha única de ícone.
Antes de publicar, definir o número da versão deste incremento. Essas decisões não impedem
o uso da skill nem a revisão deste plano.
