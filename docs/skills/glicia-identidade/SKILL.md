---
name: glicia-identidade
description: Aplicar a identidade visual e a voz da amiga Glicia ao planejar, implementar ou revisar o chat, onboarding, componentes e textos da PWA Glicia. Use para manter fidelidade à avatar, à paleta azul e à experiência conversacional do projeto.
---

# Identidade e experiência da Glicia

A Glicia é uma assistente virtual com a presença acolhedora de uma amiga/parceira na
contagem de carboidratos. O produto se organiza como conversa, com confirmação humana e
cálculo de insulina pelas regras determinísticas existentes.

## Autoridade e referências

Esta skill é específica deste repositório. Resolva os caminhos abaixo relativamente a este
arquivo; se carregada por link simbólico, use seu diretório real no repositório. Não dependa
de arquivos em Downloads ou de uma instalação global.

- Ao trabalhar no visual, leia [identidade visual](../../identidade-visual.md) e abra
  a [prancha original](../../assets/brand/identidade-visual.png).
- Ao trabalhar na conversa ou no primeiro uso, leia também o
  [plano de chat e onboarding](../../plano-experiencia-conversacional.md).
- Confirme capacidades e restrições em [produto](../../PRODUCT.md). Confira os componentes
  e o domínio atuais antes de escrever explicações de funcionamento.

A prancha fornecida pela pessoa autora fixa a nova direção. A interface verde anterior
não é autoridade estética. Diferencie a identidade aprovada das propostas de composição
e dos assets ainda pendentes. O plano não significa que a nova interface esteja implementada.

## Decisões visuais essenciais

- Marca: `Glicia` no texto; preservar `GlicIA` e o destaque de `IA` na arte do logotipo.
- Primária `#0B2D6B`; acento `#4CA6FF`; suporte `#E7F3FF`; sucesso `#22C55E`;
  alerta `#FF6B6B`; neutra `#F9E5D7`; branco para superfícies.
- Usar Poppins para títulos, mensagens, controles e números. Escrita manuscrita pertence
  às peças ilustradas, não a formulários, instruções ou resultados.
- Predomínio de branco e azul claro; texto azul-marinho. Acento azul em pequenas áreas
  interativas e detalhes. Verde e coral comunicam estados com texto, nunca julgamento da comida.
- Preferir azul-marinho com texto branco para a ação principal. Não presumir que branco
  sobre azul-acento ou coral tenha contraste suficiente; verificar a combinação real.
- Cantos suaves, espaços generosos e sombras discretas. Uma conversa central no desktop;
  no celular, aproveitar a largura sem transformar o chat em uma coleção de painéis.
- A avatar tem pele castanha, cabelo curto escuro ondulado, óculos redondos e camiseta escura.
  Preservar rosto, acessórios e estilo ilustrado da referência em todas as variantes.
- Avatar pequena no cabeçalho e início de grupos de mensagens; maior nas boas-vindas.
  Nunca concorrer visualmente com carboidratos, dados a confirmar ou resultado.
- Não usar a prancha inteira como imagem de interface, nem substituir a personagem por
  emoji, pessoa de banco de imagens ou desenho em CSS. Preparar assets isolados no trabalho
  visual correspondente; a imagem de referência não é um kit de produção.

## Voz

Escrever em português brasileiro, em primeira pessoa, com frases curtas e vocabulário comum.
A Glicia escuta, organiza, pergunta o que falta e pede revisão. Não infantiliza, julga comida
ou usa intimidade excessiva. Acolhimento não significa fingir ser humana ou equipe clínica.

- Boas-vindas: “Oi, eu sou a Glicia. Vou te ajudar a contar os carboidratos das suas refeições.”
- Entrada: “Me conta o que você vai comer. Se já souber, pode incluir a glicemia e a seta.”
- Dado ausente: “Qual é a sua glicemia agora?”
- Revisão: “Confere se entendi sua refeição?”
- Falha: “Não consegui analisar a refeição agora. Sua mensagem continua aqui. Tentar de novo?”

Os exemplos são propostas de texto, não respostas rígidas a inserir em todos os turnos.
Evitar “dose ideal”, “pode aplicar”, promessa de controle clínico e celebrações por dose.
Em bloqueios, priorizar clareza e a orientação já definida pelo produto, sem animação festiva.

## Comportamento que o estilo deve preservar

- A pessoa pode informar alimento, porção, glicemia, tendência e refeição na primeira mensagem.
  Perguntar somente o que faltar ou precisar de esclarecimento.
- Revisão, correção, resultado e registro pertencem ao fluxo do chat. Blocos estruturados e
  botões são permitidos dentro da conversa; comandos de terminal não são necessários.
- Confirmação explícita vem antes do cálculo. Texto livre da IA não confirma dados, não
  inventa parâmetros e não produz dose. Resultado vem do domínio existente.
- Explicar que a IA ajuda a buscar os alimentos exclusivamente na tabela da Sociedade Brasileira de Diabetes; a Glicia aplica os
  parâmetros pessoais confirmados para calcular a sugestão. Não mudar fórmula ou travas.
- No onboarding, usar roteiro determinístico com entradas validadas e progresso retomável.
  Valores padrão não equivalem a parâmetros pessoais confirmados. Não pedir chave de IA.
- Preservar o comportamento preciso padrão, correções, histórico contextual, modo manual e dose aplicada opcional.
  Uma refeição do histórico não fornece glicemia atual nem dose a repetir.
- Manter instalação opcional e acesso aprovado por e-mail/OTP. Avatar ou conversa não
  implicam novos recursos de áudio, câmera, monitoramento ou integração com sensor.

## Entrega e verificação

Para implementar, derive tokens semânticos e componentes reutilizáveis da identidade. Respeite
a organização `domain`, `application`, `adapters` e `components`; estilos e voz não justificam
mover cálculo para React ou IA. Use assets preparados, com origem registrada.

Verifique o fluxo real em celular e desktop: teclado aberto, mensagem longa, revisão,
carregamento, falha, retomada e bloqueios. Confira contraste, foco, zoom, nomes acessíveis,
áreas de toque e redução de movimento. Se alterar instruções da IA, verifique também o
contrato estruturado e a proibição de dose pelo modelo. Relate o que foi implementado e o que
continua somente planejado; não declare paridade ou publicação sem evidência.
