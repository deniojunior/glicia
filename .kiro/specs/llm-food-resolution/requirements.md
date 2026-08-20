# Requirements Document

## Introduction

Esta capacidade — **LLM_Food_Resolution** — estende o pipeline de resolução de alimentos do Glicia (originalmente especificado no Requisito 4 do spec `glicia`). Hoje a seleção do registro de alimento usa correspondência EXATA normalizada (lower/trim) por nome e por alias. Isso falha para termos genéricos ("café" não corresponde a "Café coado com açúcar" nem a "Café solúvel"), para casos ambíguos ("arroz") e para nomes com maiúscula acentuada ("Óleo de Soja", "Água de coco"), porque o `lower()` do SQLite rebaixa apenas caracteres ASCII e deixa registros com acentos irresolvíveis.

Com a base completa da SBD recém-importada (~2122 alimentos e ~2333 medidas), essas lacunas tornam a correspondência exata insuficiente. Esta capacidade permite que a LLM AJUDE a mapear o texto da usuária ao registro mais adequado **já existente** no Food_Database, gerando candidatos reais do banco (com normalização insensível a acentos e caixa) e fazendo perguntas de desambiguação quando houver dúvida — por alimento e por medida.

O princípio arquitetural central do projeto permanece inviolável e é reforçado por esta capacidade:

> **"IA interpreta. Banco fornece dados. Código calcula. Usuária confirma."**

A LLM NUNCA inventa nem altera valores de carboidrato, medidas ou unidades. Sua atuação nesta capacidade limita-se a **escolher entre registros reais do banco** apresentados a ela (ou a se abster quando incerta). Os valores nutricionais (carboidrato por medida, quantidade da porção, unidade) vêm EXCLUSIVAMENTE do Food_Database — carboidrato errado significa dose de insulina errada. A confirmação explícita da usuária permanece obrigatória antes de qualquer cálculo ou persistência.

Esta capacidade deve preservar a operação 100% offline do MVP local (Fase 1): o Mock_Interpreter é o interpretador padrão offline, e o núcleo determinístico de matching não depende de rede. O uso de LLM para seleção assistida é opcional e injetável; quando ausente, indisponível ou incerto, o sistema recorre a um caminho determinístico de fallback e ao fluxo de perguntas.

**Aviso clínico:** Esta capacidade não introduz regras clínicas nem valores nutricionais novos. Ela apenas melhora a associação entre o texto da usuária e registros reais já presentes na base.

## Glossary

- **LLM_Food_Resolution**: A capacidade especificada neste documento — mapeamento assistido do texto da usuária a registros reais do Food_Database, com normalização robusta, geração de candidatos e perguntas de desambiguação.
- **Interpreter**: Componente existente que converte a mensagem em `MealInterpretation`, extraindo apenas dados explícitos ({foodName, quantity, unit}). NÃO é fonte de dados nutricionais e NUNCA emite dose.
- **Mock_Interpreter**: Implementação local, determinística e offline do Interpreter; interpretador PADRÃO do MVP local (Fase 1), sem chamadas de rede.
- **LLM**: Modelo de linguagem que, em fase futura, pode apoiar o Interpreter e o Food_Selector. Nesta capacidade, quando usado para seleção, atua apenas como classificador restrito a um conjunto fechado de candidatos reais.
- **Food_Resolver**: Componente existente que orquestra a resolução de um `InterpretedItem` a um registro do Food_Database; estendido por esta capacidade para usar o Candidate_Provider e, opcionalmente, o Food_Selector.
- **Candidate_Provider**: Componente que, dado um termo de alimento normalizado, retorna o conjunto de Food_Candidate reais do Food_Database, usando correspondência insensível a acentos e caixa. Toda leitura é de registros reais; nunca cria dados.
- **Food_Candidate**: Um par real `(Food, FoodMeasure)` proveniente do Food_Database, carregando a unidade da medida e seus valores nutricionais próprios.
- **Candidate_Set**: Conjunto ordenado e limitado de Food_Candidate produzido pelo Candidate_Provider para um termo.
- **Food_Selector**: Componente OPCIONAL e injetável de seleção assistida. Recebe o texto original da usuária e um Candidate_Set fechado, e retorna o identificador de EXATAMENTE UM Food_Candidate do conjunto OU uma abstenção. NUNCA retorna valores nutricionais.
- **Selection_Outcome**: Resultado da resolução de um item: `RESOLVED` (um único Food_Candidate escolhido), `NEEDS_FOOD_DISAMBIGUATION` (vários alimentos plausíveis), `NEEDS_MEASURE_DISAMBIGUATION` (um alimento com várias medidas) ou `UNRESOLVED` (nenhum candidato).
- **Normalizer**: Função pura que produz o Normalized_Key de um texto.
- **Normalized_Key**: Chave de correspondência derivada de um texto por: remoção de espaços nas extremidades, rebaixamento de caixa Unicode e remoção de marcas diacríticas (acentos), de modo que "Óleo de Soja" e "oleo de soja" produzam a mesma chave.
- **Food_Database**: Base local de alimentos (`food`) e medidas (`food_measure`), incluindo aliases (`food_alias`). ÚNICA fonte de valores nutricionais.
- **Food**: Identidade de um alimento na base (id, nome, ativo). Não carrega valores nutricionais.
- **FoodMeasure**: Medida de um alimento; cada par (alimento + medida) tem sua própria unidade, quantidade de porção e carboidrato.
- **Conversation_Orchestrator**: Componente existente que coordena o fluxo da conversa, incluindo as perguntas de desambiguação e a confirmação obrigatória.
- **Confirmation**: Aprovação afirmativa explícita da usuária, obrigatória antes de qualquer cálculo ou persistência.
- **Max_Candidates**: Limite máximo de Food_Candidate incluídos em um Candidate_Set (valor padrão 25).

## Requirements

### Requisito 1: Interpretação do input preservando a fronteira do Interpreter

**User Story:** Como a paciente, quero descrever minha refeição em linguagem natural, para que o sistema extraia os alimentos, quantidades e unidades sem inventar dados.

#### Critérios de Aceitação

1. WHEN a paciente envia uma mensagem de texto com comprimento entre 1 e 2000 caracteres, THE Interpreter SHALL extrair, para cada alimento explicitamente mencionado, um `InterpretedItem` contendo `foodName` (texto não vazio), `quantity` (número maior que 0 quando a quantidade estiver explícita, ou null quando ausente) e `unit` (texto quando a unidade estiver explícita, ou null quando ausente), obtidos exclusivamente do conteúdo explícito da mensagem, limitando a coleção a no máximo 50 `InterpretedItem`.
2. THE Interpreter SHALL produzir uma `MealInterpretation` sem qualquer campo de dose de insulina e sem qualquer campo de carboidrato ou de valor nutricional.
3. IF um valor de carboidrato, de quantidade de porção ou de dose aparece na saída do Interpreter, THEN THE LLM_Food_Resolution SHALL descartar esse valor, desconsiderá-lo em toda a resolução e preservar os demais campos válidos (`foodName`, `quantity`, `unit`) do `InterpretedItem`.
4. THE LLM_Food_Resolution SHALL usar o `foodName`, `quantity` e `unit` de cada `InterpretedItem` apenas como termos de busca e como quantidade informada pela paciente, obtendo o carboidrato, a quantidade de porção e a unidade de medida exclusivamente do Food_Database, nunca do Interpreter.
5. IF a mensagem recebida for vazia, composta somente por espaços em branco ou não contiver nenhum alimento explícito, THEN THE Interpreter SHALL abster-se de extrair `InterpretedItem`, produzir uma `MealInterpretation` com a coleção de itens vazia e sinalizar a ausência de alimento interpretável, sem inventar alimentos, quantidades ou unidades.
6. IF um `InterpretedItem` possui `quantity` menor ou igual a zero, ausente ou não numérica, THEN THE LLM_Food_Resolution SHALL tratar a `quantity` como não informada, sinalizar a ausência da quantidade para esse item e prosseguir com a resolução dos demais itens sem interromper o processamento.

### Requisito 2: Normalização insensível a acentos e caixa

**User Story:** Como a paciente, quero que nomes com acentos e maiúsculas sejam reconhecidos, para que alimentos como "Óleo de Soja" e "Água de coco" sejam encontrados na base.

#### Critérios de Aceitação

1. WHEN o Normalizer recebe um texto, THE Normalizer SHALL produzir um Normalized_Key removendo os espaços em branco das extremidades, rebaixando a caixa de todas as letras segundo as regras de caixa Unicode — inclusive letras maiúsculas acentuadas, como "Ó", "Á" e "Ç" — e removendo em seguida as marcas diacríticas de todas as letras, de modo que o resultado seja uma chave inteiramente em caixa baixa e sem acentos.
2. THE Normalizer SHALL produzir Normalized_Key idênticos para dois textos que difiram exclusivamente em caixa, na presença ou ausência de acentos, ou em espaços em branco nas extremidades.
3. WHEN o Candidate_Provider compara um termo a um nome de Food ou a um alias, THE Candidate_Provider SHALL comparar os respectivos Normalized_Key, e não os textos originais.
4. WHERE um registro do Food_Database possui nome ou alias com maiúscula acentuada, THE Candidate_Provider SHALL torná-lo alcançável por um termo equivalente sem acento e em caixa arbitrária.
5. WHEN o Normalizer é aplicado a um Normalized_Key já produzido pelo Normalizer, THE Normalizer SHALL retornar um valor igual ao Normalized_Key de entrada.
6. IF o Normalizer recebe um texto vazio ou composto exclusivamente por espaços em branco, THEN THE Normalizer SHALL retornar um Normalized_Key vazio.
7. WHEN o Normalizer recebe o mesmo texto de entrada, THE Normalizer SHALL retornar sempre o mesmo Normalized_Key.

### Requisito 3: Geração de candidatos a partir do Food_Database

**User Story:** Como a paciente, quero que termos genéricos encontrem os registros correspondentes da base, para que "café" traga as variações reais cadastradas.

#### Critérios de Aceitação

1. WHEN o Candidate_Provider recebe um termo de alimento, THE Candidate_Provider SHALL retornar um Candidate_Set composto apenas de pares `(Food, FoodMeasure)` reais e ativos existentes no Food_Database.
2. THE Candidate_Provider SHALL incluir no Candidate_Set um Food quando, para cada token do Normalized_Key do termo — sendo tokens obtidos pela separação por espaço e desconsiderando tokens vazios resultantes de espaços consecutivos — o token estiver contido como subcadeia no Normalized_Key do nome do Food OU no Normalized_Key de pelo menos um de seus aliases, avaliada cada correspondência de token de forma independente.
3. THE Candidate_Provider SHALL expandir cada Food correspondente em um Food_Candidate por cada FoodMeasure ativa desse alimento.
4. THE Candidate_Provider SHALL ordenar o Candidate_Set de forma determinística por: (a) nível de correspondência do nome do alimento, na ordem igualdade exata do Normalized_Key, depois prefixo, depois subcadeia; em seguida (b) menor comprimento do nome; em seguida (c) nome em ordem crescente; em seguida (d) identificador do Food em ordem crescente; e por fim (e) identificador da FoodMeasure em ordem crescente, garantindo uma ordem total única entre todos os Food_Candidate.
5. THE Candidate_Provider SHALL limitar o Candidate_Set a no máximo Max_Candidates=25 Food_Candidate, contando cada Food_Candidate individualmente, e preservar a ordem determinística definida ao aplicar o limite.
6. IF nenhum Food ativo corresponde ao termo, THEN THE Candidate_Provider SHALL retornar um Candidate_Set vazio.
7. THE Candidate_Provider SHALL descartar qualquer Food sem FoodMeasure ativa, por não haver dado nutricional a oferecer.
8. IF o Normalized_Key do termo é vazio, THEN THE Candidate_Provider SHALL retornar um Candidate_Set vazio.

### Requisito 4: Seleção assistida por LLM restrita a registros reais

**User Story:** Como a paciente, quero que a LLM me ajude a escolher o registro mais adequado quando há várias opções, para reduzir as perguntas sem risco de dados inventados.

#### Critérios de Aceitação

1. WHERE um Food_Selector está configurado, WHEN o Candidate_Set contém mais de um Food_Candidate, THE Food_Resolver SHALL fornecer ao Food_Selector o texto original da usuária, a quantidade informada e o Candidate_Set fechado.
2. THE Food_Selector SHALL retornar exatamente um identificador de um Food_Candidate presente no Candidate_Set OU uma abstenção explícita, sem nenhum outro formato de retorno permitido.
3. IF o Food_Selector retorna um identificador ausente do Candidate_Set, mais de um identificador, ou um retorno não parseável, THEN THE Food_Resolver SHALL tratar o retorno como abstenção, descartá-lo e preservar o texto original e a quantidade informada pela usuária.
4. IF o Food_Selector retorna qualquer valor de carboidrato, de quantidade de porção ou de unidade, THEN THE Food_Resolver SHALL ignorar esses valores e usar exclusivamente os valores da FoodMeasure do Food_Candidate escolhido.
5. WHEN o Food_Selector retorna exatamente um identificador válido presente no Candidate_Set, THE Food_Resolver SHALL adotar o Food_Candidate correspondente como resolução do item, sujeita à Confirmation.
6. WHEN o Food_Selector se abstém ou o Food_Resolver trata o retorno como abstenção, THE Food_Resolver SHALL encaminhar o item ao fluxo de perguntas de desambiguação, preservando o texto original e a quantidade informada.
7. THE Food_Selector SHALL receber apenas identificadores e textos descritivos dos Food_Candidate, sem receber autorização para criar candidatos fora do Candidate_Set.

### Requisito 5: Fronteira de segurança dos valores nutricionais

**User Story:** Como responsável clínico, quero garantir que os carboidratos venham sempre do banco, para que a dose calculada nunca dependa de valores gerados pela LLM.

#### Critérios de Aceitação

1. WHEN o Food_Resolver resolve um item a um Food_Candidate, THE Food_Resolver SHALL obter o carboidrato, a quantidade de porção e a unidade exclusivamente da FoodMeasure desse Food_Candidate, sem obtê-los do Interpreter, do Food_Selector ou de qualquer valor gerado pela LLM.
2. THE LLM_Food_Resolution SHALL preservar o `foodName` e a `quantity` exatamente como extraídos do `InterpretedItem` da paciente, sem substituí-los por valores gerados pela LLM, pelo Interpreter ou pelo Food_Selector.
3. IF a saída do Interpreter ou do Food_Selector contém um valor de carboidrato, de quantidade de porção ou de unidade, THEN THE LLM_Food_Resolution SHALL descartar esse valor antes de qualquer cálculo de carboidrato ou de dose e obter o valor correspondente exclusivamente da FoodMeasure adotada.
4. THE LLM_Food_Resolution SHALL restringir a seleção assistida à escolha de um Food_Candidate já existente e ativo no Food_Database, sem criar, alterar, combinar ou derivar registros, e SHALL preservar inalterados o carboidrato, a quantidade de porção e a unidade da FoodMeasure escolhida.
5. IF a FoodMeasure de um Food_Candidate não possui valor numérico de carboidrato ou de quantidade de porção, THEN THE Food_Resolver SHALL abster-se de adotar esse Food_Candidate como resolução do item e encaminhá-lo ao fluxo de perguntas de desambiguação, sem calcular dose.
6. WHEN a dose de insulina é calculada para a refeição, THE LLM_Food_Resolution SHALL derivar o carboidrato de cada item exclusivamente das FoodMeasure adotadas do Food_Database, nunca de valores produzidos pela LLM, pelo Interpreter ou pelo Food_Selector.

### Requisito 6: Perguntas de desambiguação por alimento

**User Story:** Como a paciente, quero ser perguntada quando houver várias opções de alimento, para escolher exatamente a que consumi.

#### Critérios de Aceitação

1. WHEN a resolução de um item resulta no Selection_Outcome NEEDS_FOOD_DISAMBIGUATION, THE Conversation_Orchestrator SHALL apresentar as opções de alimento e solicitar que a paciente escolha exatamente uma.
2. THE Conversation_Orchestrator SHALL apresentar as opções numeradas sequencialmente a partir de 1, com uma entrada por Food distinto, na ordem determinística do Candidate_Set, exibindo em cada entrada o nome do alimento e a unidade da medida correspondente.
3. WHEN a paciente escolhe uma opção por número, ou por um texto cujo Normalized_Key corresponde a exatamente uma opção apresentada pelo nome do alimento ou pela unidade da medida, THE Conversation_Orchestrator SHALL adotar o Food_Candidate correspondente como resolução do item, sujeita à Confirmation.
4. IF a escolha da paciente não corresponde a nenhuma opção apresentada ou corresponde a mais de uma opção apresentada, THEN THE Conversation_Orchestrator SHALL solicitar novamente a escolha a partir da mesma lista, sem alterar as opções apresentadas.
5. IF o Candidate_Set atinge o limite Max_Candidates de Food distintos, THEN THE Conversation_Orchestrator SHALL solicitar que a paciente descreva o alimento com mais detalhes antes de apresentar as opções.
6. WHILE existir um item aguardando desambiguação de alimento nesta conversa, THE Conversation_Orchestrator SHALL preservar os itens já resolvidos nesta conversa, sem recalcular nem descartar suas resoluções.

### Requisito 7: Perguntas de desambiguação por medida

**User Story:** Como a paciente, quero escolher a medida certa quando um alimento tem várias, para que o carboidrato usado corresponda à porção real.

#### Critérios de Aceitação

1. WHEN o item resolve a um único Food que possui mais de uma FoodMeasure ativa, E a unidade informada está ausente OU o Normalized_Key da unidade informada corresponde a mais de uma FoodMeasure ativa desse Food, THE Conversation_Orchestrator SHALL apresentar as medidas disponíveis em lista numerada sequencialmente a partir de 1, exibindo a unidade e a quantidade de porção de cada FoodMeasure, e solicitar que a paciente escolha exatamente uma.
2. WHEN a paciente informou uma unidade e o Normalized_Key dessa unidade corresponde a exatamente uma FoodMeasure ativa do alimento, THE Food_Resolver SHALL adotar essa medida sem perguntar.
3. IF a paciente informou uma unidade cujo Normalized_Key não corresponde a nenhuma FoodMeasure ativa do alimento, THEN THE Conversation_Orchestrator SHALL apresentar as medidas disponíveis do alimento em lista numerada sequencialmente a partir de 1, exibindo a unidade e a quantidade de porção de cada FoodMeasure, e solicitar uma escolha válida.
4. WHEN a paciente escolhe uma medida por número da lista ou por um texto cujo Normalized_Key corresponde à unidade de exatamente uma FoodMeasure apresentada, THE Food_Resolver SHALL obter o carboidrato, a quantidade de porção e a unidade exclusivamente dessa FoodMeasure.
5. WHEN um Food possui exatamente uma FoodMeasure ativa e nenhuma ambiguidade de alimento permanece, THE Food_Resolver SHALL adotar essa medida sem perguntar.
6. IF a escolha da paciente não corresponde a nenhuma medida apresentada ou corresponde a mais de uma medida apresentada, THEN THE Conversation_Orchestrator SHALL solicitar novamente a escolha a partir da mesma lista, sem alterar as medidas apresentadas.
7. WHILE existir um item aguardando desambiguação de medida nesta conversa, THE Conversation_Orchestrator SHALL preservar os itens já resolvidos nesta conversa, sem recalcular nem descartar suas resoluções.

### Requisito 8: Confirmação obrigatória antes do cálculo e da persistência

**User Story:** Como a paciente, quero confirmar os dados antes do cálculo, para que nada seja registrado sem minha aprovação explícita.

#### Critérios de Aceitação

1. WHEN todos os itens estão resolvidos e nenhuma desambiguação permanece, THE Conversation_Orchestrator SHALL apresentar para confirmação, para cada item resolvido, o nome informado pela paciente, a quantidade, a unidade, a descrição da FoodMeasure adotada e o valor de carboidrato calculado exclusivamente a partir do Food_Database.
2. THE Conversation_Orchestrator SHALL tratar como Confirmation apenas uma resposta de aprovação afirmativa explícita da paciente, excluindo respostas negativas, vazias ou ambíguas.
3. THE Conversation_Orchestrator SHALL exigir a Confirmation antes de calcular a dose ou persistir a refeição.
4. WHEN a paciente fornece a Confirmation, THE Conversation_Orchestrator SHALL disparar o cálculo da dose e a persistência da refeição.
5. IF a paciente recusa a confirmação ou não fornece a Confirmation, THEN THE Conversation_Orchestrator SHALL abster-se de calcular a dose e de persistir a refeição, preservando os itens já resolvidos sem persistência parcial.
6. IF a paciente responde de forma ambígua, não caracterizando nem aprovação afirmativa explícita nem recusa, THEN THE Conversation_Orchestrator SHALL reapresentar o resumo dos itens resolvidos e solicitar novamente a Confirmation.
7. WHILE existir qualquer item aguardando desambiguação de alimento ou de medida, THE Conversation_Orchestrator SHALL abster-se de apresentar a refeição para confirmação.

### Requisito 9: Operação offline e fallback determinístico

**User Story:** Como responsável técnico, quero que o sistema funcione offline e sem LLM, para que o MVP local valide o fluxo sem chamadas externas.

#### Critérios de Aceitação

1. THE LLM_Food_Resolution SHALL usar o Mock_Interpreter como interpretador padrão do MVP local, sem realizar chamadas de rede.
2. WHERE nenhum Food_Selector está configurado, WHEN o Candidate_Set contém mais de um Food_Candidate, THE Food_Resolver SHALL encaminhar o item ao fluxo de perguntas de desambiguação em vez de usar seleção assistida.
3. IF o Food_Selector está configurado e, ao ser acionado, lança erro, retorna resposta malformada, fica indisponível ou não retorna dentro do tempo limite de seleção de 5 segundos, THEN THE Food_Resolver SHALL prosseguir pelo caminho determinístico, encaminhar o item ao fluxo de perguntas de desambiguação e registrar indicação observável da falha do Food_Selector.
4. WHEN o Food_Resolver aciona o Food_Selector para um item, THE Food_Resolver SHALL realizar no máximo 1 tentativa de seleção por item e aguardar a resposta por no máximo o tempo limite de seleção de 5 segundos.
5. WHILE o Food_Resolver prossegue pelo caminho determinístico após falha, indisponibilidade ou expiração do tempo limite do Food_Selector, THE Food_Resolver SHALL preservar sem alteração os itens já resolvidos anteriormente no mesmo processamento.
6. WHEN o Candidate_Set contém exatamente um Food_Candidate, THE Food_Resolver SHALL resolver o item sem depender do Food_Selector.
7. THE Candidate_Provider e o Normalizer SHALL operar sem chamadas de rede.

### Requisito 10: Determinismo e testabilidade

**User Story:** Como responsável técnico, quero que o núcleo de resolução seja determinístico e injetável, para validar a capacidade com testes baseados em propriedades sem rede.

#### Critérios de Aceitação

1. WHEN o Candidate_Provider recebe o mesmo termo e o mesmo estado do Food_Database, THE Candidate_Provider SHALL retornar, em qualquer número de invocações repetidas, um Candidate_Set idêntico em quantidade de itens, em conteúdo (cada Food_Candidate com o mesmo Food, a mesma FoodMeasure, a mesma unidade e os mesmos valores nutricionais) e na ordem dos itens.
2. THE Food_Resolver SHALL expor o Food_Selector como dependência injetável, permitindo substituí-lo por uma implementação determinística de teste sem alterar o núcleo de resolução.
3. WHEN o Food_Resolver recebe o mesmo texto original da usuária, o mesmo `InterpretedItem` e o mesmo Candidate_Set, e está configurado com um Food_Selector determinístico de teste, THE Food_Resolver SHALL produzir, em qualquer número de execuções repetidas, o mesmo Selection_Outcome, incluindo o mesmo Food_Candidate adotado quando o resultado for `RESOLVED`.
4. THE LLM_Food_Resolution SHALL classificar todo `InterpretedItem` em exatamente um dentre os Selection_Outcome `RESOLVED`, `NEEDS_FOOD_DISAMBIGUATION`, `NEEDS_MEASURE_DISAMBIGUATION` ou `UNRESOLVED`, sem produzir nenhum outro resultado nem mais de um resultado para o mesmo item.
5. WHEN um item resulta em `RESOLVED`, THE Food_Resolver SHALL garantir que o Food_Candidate adotado pertence ao Candidate_Set gerado para o termo desse item.
6. WHERE o Food_Resolver está configurado com um Food_Selector determinístico de teste, THE Food_Resolver SHALL resolver cada `InterpretedItem` sem realizar chamadas de rede.
7. WHEN o Food_Resolver resolve uma lista de `InterpretedItem`, THE Food_Resolver SHALL produzir para cada item o mesmo Selection_Outcome independentemente da posição desse item na lista.
