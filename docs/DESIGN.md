# Design da PWA

## Mundo visual

A Glicia é uma conversa clara entre a pessoa e uma assistente virtual acolhedora. A interface
usa azul-marinho `#0B2D6B` para decisão e texto, azul claro `#E7F3FF` para contexto e branco
para leitura. O coral e o verde aparecem apenas em estados acompanhados de texto. Poppins é a
fonte de interface; a avatar é presença e apoio, nunca indicação clínica.

## Composição

O celular é a referência. Cabeçalho curto, conversa em uma coluna e compositor fixo no fim da
tela. Na entrada, a ilustração integrada da Glicia e a primeira mensagem apresentam a tarefa.
As respostas usam o nome Glicia e um balão branco, sem foto de perfil circular; a mensagem da
pessoa é um balão azul-marinho alinhado à direita. Revisão e resultado são cartões da conversa,
não telas separadas.

O onboarding segue a mesma gramática: uma mensagem da Glicia e uma resposta estruturada abaixo.
O roteiro contém apresentação, funcionamento, limites, parâmetros clínicos, RICs, modo e revisão.
Campos e ações têm texto explícito, unidades e foco visível.

## Assinatura

O wordmark textual mantém `GlicIA` em azul e azul-claro, com um pequeno brilho. A avatar aparece
como ilustração de boas-vindas, integrada à superfície azulada e sem moldura circular. Ícones da
PWA usam a mesma personagem. A origem do raster está em `apps/pwa/public/brand/README.md`.

## Regras de uso

Não usar a avatar como sinal de que uma pessoa ou equipe de saúde acompanha a conta. Não celebrar
resultado de dose. O texto da Glicia é curto, direto, respeitoso e não julga alimentos. Cálculo,
travas e confirmação humana seguem o domínio existente; a estética não altera comportamento.

## Acessibilidade

Ações principais usam azul-marinho e branco, com foco azul-marinho destacado. Estados têm texto
além de cor. Campos preservam unidade, fonte local e tamanho de leitura. A avatar decorativa usa
`alt=""`; a mensagem identifica a Glicia textualmente. Redução de movimento evita animações.
