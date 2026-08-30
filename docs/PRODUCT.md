# Produto

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

TypeScript, React e Vite, com suporte a PWA e hospedagem estática. A aplicação principal
será executada no navegador, sem backend, conta ou sincronização obrigatórios. A CLI em
Python permanece disponível e serve como referência de comportamento durante o porte.

## Users

A pessoa usuária principal vive com diabetes, consulta manualmente a glicemia e a tendência
no sensor e precisa contar carboidratos e aplicar os próprios parâmetros clínicos antes de uma
refeição. Ela pode estar usando o celular com pressa, com apenas uma mão ou em uma situação
de glicemia que reduza sua capacidade de atenção.

## Product Purpose

A Glicia conduz uma conversa curta para estruturar os dados da refeição, estimar carboidratos
com apoio de IA e, após confirmação humana explícita, executar localmente o cálculo
determinístico já validado na CLI. O produto é bem-sucedido quando esse fluxo pode ser usado
com segurança e pouca fricção no celular, sem depender de conhecimentos técnicos.

## Positioning

A Glicia combina conversa em linguagem natural, tabela nutricional controlada, confirmação
humana obrigatória e cálculo local independente da IA. A IA organiza a refeição; ela nunca
calcula ou recomenda a dose.

## Operating Context

- A glicemia e a seta do FreeStyle Libre são informadas manualmente; não há integração nativa
  com o sensor.
- A pessoa pode digitar ou usar o ditado do teclado do celular para descrever a refeição.
- O primeiro acesso exige chave do provedor de IA, parâmetros clínicos, cinco RICs, modo de
  interação e revisão final.
- Configurações, memória alimentar e histórico permanecem no dispositivo.
- O projeto é open source, sem fins lucrativos e deve ser simples para pessoas sem experiência
  técnica configurarem e instalarem.

## Capabilities and Constraints

- Preservar paridade com o comportamento validado na CLI antes de adicionar capacidades.
- Oferecer conversa, confirmação e correção, modos Preciso e Rápido, memória alimentar,
  histórico e registro da dose realmente aplicada.
- Permitir exportar, importar e criar backups manuais dos dados locais em um formato
  versionado, sem incluir credenciais de provedores de IA.
- Funcionar por URL e poder ser instalado na tela inicial como PWA, sem publicação em lojas.
- Usar inicialmente BYOK com OpenAI e evoluir para modelos e provedores intercambiáveis.
- Manter cálculo, arredondamento e travas de segurança determinísticos e locais.
- Não calcular insulina ativa, prescrever parâmetros, automatizar aplicação ou se apresentar
  como substituto da equipe de saúde.
- A estratégia de armazenamento da chave e o envio de dados de saúde ao provedor ainda exigem
  revisão de segurança antes da publicação pública.

## Evidence on Hand

- Implementação CLI funcional em `apps/cli/src/glicia/`.
- Testes automatizados existentes em `apps/cli/tests/`.
- Tabela nutricional em `apps/cli/src/glicia/data/foods-sbd.csv`.
- Demonstração gravada em `docs/assets/glicia-demo.gif` e `docs/assets/glicia-demo.cast`.
- Valor inicial observado com usuário piloto; ainda não há estudos clínicos, métricas públicas
  ou alegações de eficácia que possam ser apresentadas como evidência.

## Product Principles

- A pessoa confirma; a IA não decide.
- O mesmo caso produz o mesmo cálculo, independentemente da interface ou do modelo de IA.
- O fluxo essencial funciona localmente e sem conta própria da Glicia.
- A configuração clínica é explícita, validada e revisável.
- A evolução começa simples e adiciona abstrações somente quando houver uma segunda necessidade
  real.

## Accessibility & Inclusion

A PWA deve ter contraste suficiente, texto redimensionável, alvos de toque adequados, navegação
por teclado, semântica para leitores de tela e mensagens que não dependam apenas de cor. Estados
de hipoglicemia e erro devem exigir o mínimo possível de memória e atenção da pessoa usuária.
