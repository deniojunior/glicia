# Requirements Document

## Introduction

Glicia é um assistente pessoal para registro e acompanhamento do controle glicêmico de UMA ÚNICA pessoa com diabetes tipo 1. O sistema recebe mensagens em linguagem natural (ex.: "Minha glicemia está 165 e vou jantar 3 colheres de arroz, uma concha de feijão e um bife."), interpreta os dados clínicos e alimentares explicitamente presentes na mensagem, resolve os alimentos contra uma base local de contagem de carboidratos, calcula a dose de insulina de forma determinística e persiste o registro após confirmação explícita da usuária.

O escopo PRIMÁRIO deste documento é um MVP que roda LOCALMENTE, com entrada via TERMINAL (CLI/REPL), permitindo validar a solução e a qualidade do código de forma totalmente offline. As integrações com Supabase (deploy, Edge Functions, Auth, RLS), WhatsApp Cloud API, OpenAI e Google Sheets são explicitamente marcadas como FASE FUTURA. O interpretador de linguagem natural deve ser mockável/simulável localmente, e o cálculo determinístico deve ser plenamente testável offline.

O princípio arquitetural central que rege todo o sistema é:

> **"IA interpreta. Banco fornece dados. Código calcula. Usuária confirma."**

A IA NUNCA calcula, recomenda ou decide dose de insulina, nem inventa alimentos, quantidades, unidades, carboidratos ou glicemia. A IA apenas interpreta linguagem natural e extrai dados estruturados explicitamente presentes na mensagem, sinalizando informações ausentes ou ambíguas. O cálculo de insulina é executado EXCLUSIVAMENTE por uma função pura e determinística do backend, em um único lugar do código, sem qualquer dependência externa.

A arquitetura deve permitir trocar o canal de entrada (terminal → WhatsApp) e o interpretador (mock → OpenAI) sem alterar a lógica de domínio.

**Aviso clínico:** A fórmula de cálculo reflete o protocolo atualmente configurado na planilha da usuária e NÃO é uma recomendação médica universal. O sistema executa de forma determinística apenas o protocolo configurado e não introduz automaticamente regras clínicas não especificadas.

## Glossary

- **Glicia_System**: O sistema completo, composto por canal de entrada, interpretador, resolvedor de alimentos, motor de cálculo, orquestrador de conversa e camada de persistência.
- **Terminal_Channel**: Adaptador de canal de entrada/saída baseado em terminal (CLI/REPL) usado no MVP local.
- **Channel_Adapter**: Abstração de canal que permite substituir o meio de comunicação (terminal, WhatsApp) sem alterar o domínio.
- **Interpreter**: Componente que converte uma mensagem em linguagem natural em uma estrutura `MealInterpretation`. Possui implementação Mock (local) e, em fase futura, implementação baseada em OpenAI.
- **Mock_Interpreter**: Implementação local e determinística/configurável do Interpreter, usada para validação offline sem chamadas externas.
- **Food_Resolver**: Componente que associa itens interpretados a registros da base local de alimentos (Food) usando estratégias de correspondência.
- **Insulin_Calculator**: Função pura e determinística que calcula as doses de insulina a partir de entradas numéricas e parâmetros, sem dependência de rede, Supabase, OpenAI, WhatsApp, HTTP, filesystem ou variáveis de ambiente.
- **Conversation_Orchestrator**: Componente que coordena o fluxo de uma conversa (interpretar, perguntar o que falta, confirmar, calcular, persistir).
- **Food_Database**: Base de dados local de alimentos e seus valores de contagem de carboidratos.
- **MealInterpretation**: Estrutura de dados retornada pelo Interpreter, contendo glicemia, tipo de refeição, itens alimentares e informações ausentes. NÃO contém dose de insulina.
- **Patient**: A única paciente atendida pelo sistema (sem multi-tenancy).
- **CHO**: Carboidrato, medido em gramas (g).
- **Meal_Type**: Tipo de refeição, restrito a {BREAKFAST, LUNCH, SNACK, DINNER}.
- **Target_Glucose**: Glicemia alvo configurada (valor inicial 120).
- **Correction_Factor**: Fator de correção configurado (valor inicial 40).
- **Carbohydrate_Ratio**: Relação insulina/carboidrato por tipo de refeição (valores iniciais: BREAKFAST=8, LUNCH=6, SNACK=8, DINNER=10).
- **Correction_Dose**: Dose de correção = (glucose - targetGlucose) / correctionFactor.
- **Carbohydrate_Dose**: Dose de carboidrato = carbohydrates / carbohydrateRatio.
- **Total_Dose**: Soma bruta de Correction_Dose e Carbohydrate_Dose.
- **Rounded_Dose**: Total_Dose arredondada para inteiro (comportamento atual da planilha).
- **Calculated_Dose**: Dose calculada pelo sistema.
- **Applied_Dose**: Dose efetivamente aplicada pela paciente, registrada separadamente da Calculated_Dose.
- **Parameter_Snapshot**: Cópia dos parâmetros (target_glucose, correction_factor, carbohydrate_ratio) no momento do cálculo, persistida junto ao cálculo.
- **Formula_Version**: Identificador da versão da fórmula usada no cálculo (valor atual "1.0").
- **External_Message_Id**: Identificador único de uma mensagem de entrada, usado para deduplicação/idempotência.
- **SBD_Manual**: "Manual de Contagem de Carboidratos para Pessoas com Diabetes" da SBD (2025), cuja tabela de alimentos (páginas 48-153) é a fonte da base local.

## Fases do Projeto

- **Fase 1 (MVP Local — escopo primário):** entrada via Terminal_Channel, Mock_Interpreter, Food_Resolver contra base local, Insulin_Calculator determinístico, fluxo de confirmação e persistência local.
- **Fase 2 (Futura):** integração com WhatsApp Cloud API, OpenAI Responses API, Supabase (Auth, RLS, Edge Functions, deploy).
- **Fase 3 (Futura):** áudio via WhatsApp (transcrição), Google Sheets como integração posterior, interface web administrativa.

Requisitos marcados com **[FASE FUTURA]** definem comportamento esperado das fases posteriores e restrições arquiteturais que a Fase 1 NÃO deve bloquear. Requisitos sem essa marcação pertencem ao MVP local (Fase 1).

## Requirements

### Requisito 1: Entrada via Terminal (MVP Local)

**User Story:** Como a paciente, quero enviar mensagens em linguagem natural pelo terminal, para registrar minha glicemia e refeição sem depender de integrações externas.

#### Critérios de Aceitação

1. THE Terminal_Channel SHALL aceitar mensagens de texto em linguagem natural digitadas no terminal com comprimento entre 1 e 4000 caracteres.
2. IF a paciente submete uma mensagem vazia ou composta somente por espaços em branco, THEN THE Terminal_Channel SHALL rejeitar a mensagem, exibir uma indicação de erro e aguardar nova entrada sem encaminhá-la ao Conversation_Orchestrator.
3. IF a paciente submete uma mensagem com comprimento superior a 4000 caracteres, THEN THE Terminal_Channel SHALL rejeitar a mensagem, exibir uma indicação de erro e aguardar nova entrada sem encaminhá-la ao Conversation_Orchestrator.
4. WHEN a paciente submete uma mensagem de texto válida com comprimento entre 1 e 4000 caracteres, THE Terminal_Channel SHALL encaminhar o conteúdo integral da mensagem ao Conversation_Orchestrator.
5. WHEN o Conversation_Orchestrator produz uma resposta, THE Terminal_Channel SHALL exibir o conteúdo integral da resposta no terminal.
6. THE Terminal_Channel SHALL implementar a mesma interface de Channel_Adapter usada pelos demais canais, expondo operações de recebimento e envio de mensagens de texto.
7. THE Glicia_System SHALL operar por completo no MVP local sem realizar chamadas de rede a Supabase, OpenAI, WhatsApp ou Google Sheets.

### Requisito 2: Abstração de Canal e de Interpretador

**User Story:** Como responsável técnico, quero que o canal e o interpretador sejam substituíveis, para trocar terminal por WhatsApp e mock por OpenAI sem alterar o domínio.

#### Critérios de Aceitação

1. THE Glicia_System SHALL isolar a lógica de domínio (interpretação estruturada, resolução de alimentos, cálculo, confirmação, persistência) de modo que o domínio consuma exclusivamente conteúdo textual e produza resposta textual, sem depender de tipos ou estruturas específicas de canal.
2. THE Glicia_System SHALL definir a abstração Channel_Adapter com um contrato único que expõe apenas operações de recebimento e de envio de conteúdo textual, alinhado às operações do Terminal_Channel descritas no Requisito 1.
3. THE Glicia_System SHALL definir a abstração Channel_Adapter de modo que Terminal_Channel e, em fase futura, o canal WhatsApp sejam implementações intercambiáveis do mesmo contrato.
4. WHERE a implementação de canal é substituída por outra que cumpre o contrato Channel_Adapter, THE Glicia_System SHALL produzir as mesmas respostas de domínio para conteúdo textual equivalente.
5. THE Glicia_System SHALL definir a abstração Interpreter de modo que Mock_Interpreter e, em fase futura, o Interpreter baseado em OpenAI produzam o mesmo contrato MealInterpretation, sem campo de dose de insulina.
6. WHERE a implementação de Interpreter é substituída por outra que cumpre o contrato MealInterpretation, THE Glicia_System SHALL processar o resultado pelo mesmo pipeline de domínio, sem alterar as etapas de resolução de alimentos, cálculo, confirmação e persistência.
7. WHERE a implementação de canal ou de interpretador é substituída, THE Insulin_Calculator SHALL produzir a mesma Total_Dose e a mesma Rounded_Dose para as mesmas entradas numéricas e os mesmos parâmetros de cálculo.

### Requisito 3: Interpretação de Linguagem Natural

**User Story:** Como a paciente, quero que o sistema entenda minha mensagem e extraia os dados relevantes, para não precisar preencher formulários estruturados.

#### Critérios de Aceitação

1. WHEN uma mensagem em linguagem natural com comprimento entre 1 e 2000 caracteres é recebida, THE Interpreter SHALL produzir uma estrutura MealInterpretation contendo os campos glucose, meal, items e missingInformation.
2. THE Interpreter SHALL extrair apenas dados explicitamente presentes na mensagem.
3. THE Interpreter SHALL definir glucose como um número maior que 0 quando a glicemia estiver presente na mensagem e como null quando ausente.
4. THE Interpreter SHALL definir meal como um valor de Meal_Type quando o tipo de refeição estiver presente na mensagem e como null quando ausente.
5. THE Interpreter SHALL representar cada item alimentar como um objeto contendo foodName (texto não vazio), quantity (número maior que 0 ou null) e unit (texto ou null), limitando a coleção items a no máximo 50 itens.
6. THE Interpreter SHALL listar em missingInformation os valores dentre {GLUCOSE, MEAL, FOOD_QUANTITY, FOOD} que estiverem ausentes ou que não puderem ser resolvidos a um único valor explícito na mensagem.
7. IF a mensagem recebida for vazia ou composta somente por espaços em branco, THEN THE Interpreter SHALL abster-se de extrair dados e sinalizar a ausência de conteúdo interpretável.
8. IF a mensagem não contém nenhum dado extraível, THEN THE Interpreter SHALL definir glucose como null, meal como null e items como coleção vazia, e listar GLUCOSE, MEAL, FOOD_QUANTITY e FOOD em missingInformation.
9. THE Interpreter SHALL omitir qualquer campo de dose de insulina da estrutura MealInterpretation.
10. IF o resultado do Interpreter contém qualquer campo de dose de insulina, THEN THE Glicia_System SHALL ignorar esse campo.
11. THE Mock_Interpreter SHALL produzir uma MealInterpretation a partir de entradas configuradas localmente, sem realizar chamadas de rede.
12. THE Interpreter SHALL abster-se de inventar alimentos, quantidades, unidades, carboidratos ou valores de glicemia não presentes na mensagem.

### Requisito 4: Resolução de Alimentos na Base Local

**User Story:** Como a paciente, quero que os alimentos que mencionei sejam associados aos dados nutricionais corretos, para que o cálculo de carboidratos use valores confiáveis.

#### Critérios de Aceitação

1. WHEN a MealInterpretation contém itens alimentares, THE Food_Resolver SHALL resolver cada item contra o Food_Database aplicando a cadeia de precedência correspondência exata com Food_Alias → correspondência exata com nome de Food → exatamente uma correspondência conhecida previamente registrada no Food_Database, parando no primeiro nível que produzir correspondência.
2. THE Food_Resolver SHALL considerar uma correspondência como exata desconsiderando diferenças entre maiúsculas e minúsculas e desconsiderando espaços em branco nas extremidades do texto.
3. WHEN um item alimentar corresponde exatamente a um Food_Alias, THE Food_Resolver SHALL associar o item ao Food correspondente.
4. WHEN um item alimentar não corresponde a nenhum Food_Alias mas corresponde exatamente ao nome de um Food, THE Food_Resolver SHALL associar o item a esse Food.
5. WHEN um item alimentar não possui correspondência exata mas corresponde a exatamente uma correspondência conhecida previamente registrada no Food_Database, THE Food_Resolver SHALL associar o item a esse Food.
6. IF um item alimentar corresponde a múltiplos Food candidatos, THEN THE Conversation_Orchestrator SHALL apresentar à paciente a lista de candidatos identificados e solicitar que escolha exatamente um.
7. IF a paciente informa uma seleção inválida entre os candidatos apresentados, THEN THE Conversation_Orchestrator SHALL re-solicitar à paciente que escolha exatamente um candidato da lista apresentada.
8. IF um item alimentar não corresponde a nenhum Food segundo a cadeia de precedência, THEN THE Conversation_Orchestrator SHALL registrar FOOD em missingInformation, solicitar esclarecimento à paciente e preservar os itens já resolvidos.
9. THE Food_Resolver SHALL obter os valores de carboidrato exclusivamente do Food_Database.
10. THE Glicia_System SHALL abster-se de usar o Interpreter como fonte de valores nutricionais.

### Requisito 5: Cálculo Determinístico de Carboidratos

**User Story:** Como a paciente, quero que o total de carboidratos da refeição seja calculado pelo código, para que a multiplicação por quantidade seja confiável.

#### Critérios de Aceitação

1. WHEN cada item alimentar foi resolvido a um Food com valor de carboidrato por medida, THE Glicia_System SHALL calcular o carboidrato do item multiplicando a quantidade informada pelo carboidrato por medida do Food e arredondar o resultado para 2 casas decimais em gramas.
2. THE Glicia_System SHALL calcular o total de carboidratos da refeição somando os carboidratos de todos os itens resolvidos e expressá-lo em gramas com 2 casas decimais.
3. THE Glicia_System SHALL calcular o total de carboidratos por meio de código determinístico, sem usar o Interpreter como fonte da multiplicação, de modo que entradas idênticas produzam sempre o mesmo total.
4. WHEN o total de carboidratos é calculado, THE Glicia_System SHALL registrar o valor de carboidrato de cada item individualmente para persistência.
5. IF um item alimentar não pôde ser resolvido a um Food com valor de carboidrato por medida, THEN THE Glicia_System SHALL excluir esse item do cálculo do total, identificar quais itens não foram resolvidos e preservar o cálculo dos itens já resolvidos.
6. IF a quantidade informada de um item for menor ou igual a zero, ausente ou não numérica, THEN THE Glicia_System SHALL rejeitar o item para o cálculo e indicar a falha de validação da quantidade, sem interromper o cálculo dos demais itens.

### Requisito 6: Confirmação Explícita da Paciente

**User Story:** Como a paciente, quero revisar e confirmar a interpretação e o total de carboidratos antes de qualquer cálculo de dose, para garantir que os dados da refeição estão corretos.

#### Critérios de Aceitação

1. WHEN a interpretação está completa e todos os alimentos foram resolvidos, THE Conversation_Orchestrator SHALL apresentar à paciente, em até 3 segundos, a interpretação da refeição e o total de carboidratos em gramas para confirmação explícita.
2. WHILE a conversa aguarda confirmação, THE Conversation_Orchestrator SHALL manter o status da conversa como WAITING_CONFIRMATION.
3. WHEN a paciente responde de forma afirmativa (por exemplo, "Sim") confirmando explicitamente os dados da refeição, THE Conversation_Orchestrator SHALL prosseguir para o cálculo determinístico de insulina.
4. IF a paciente rejeita os dados, solicita correção, ou fornece qualquer resposta que não seja uma confirmação afirmativa explícita, THEN THE Conversation_Orchestrator SHALL abster-se de executar o cálculo de insulina e de persistir a refeição, e SHALL solicitar à paciente o dado específico da refeição a ser ajustado.
5. THE Conversation_Orchestrator SHALL tratar a confirmação como validação dos dados da refeição, e não como validação de uma dose sugerida pela IA.
6. IF a paciente não responde à solicitação de confirmação dentro de 10 minutos, THEN THE Conversation_Orchestrator SHALL manter o status da conversa como WAITING_CONFIRMATION e abster-se de executar o cálculo de insulina e de persistir a refeição.
7. IF a resposta da paciente for ambígua ou não reconhecida como confirmação afirmativa nem como solicitação de correção, THEN THE Conversation_Orchestrator SHALL abster-se de prosseguir para o cálculo e SHALL reapresentar a interpretação da refeição e o total de carboidratos em gramas, solicitando uma confirmação explícita.

### Requisito 7: Motor de Cálculo de Insulina (Função Pura e Determinística)

**User Story:** Como responsável técnico, quero que o cálculo de insulina seja uma função pura e determinística em um único lugar, para garantir testabilidade e ausência de efeitos colaterais.

#### Critérios de Aceitação

1. WHEN o Insulin_Calculator é executado com glucose, targetGlucose, correctionFactor, carbohydrates e carbohydrateRatio, THE Insulin_Calculator SHALL calcular Correction_Dose como (glucose - targetGlucose) / correctionFactor.
2. THE Insulin_Calculator SHALL calcular Carbohydrate_Dose como carbohydrates / carbohydrateRatio.
3. THE Insulin_Calculator SHALL calcular Total_Dose como a soma de Correction_Dose e Carbohydrate_Dose.
4. THE Insulin_Calculator SHALL calcular Rounded_Dose arredondando Total_Dose para o inteiro mais próximo e, quando a parte fracionária for exatamente 0,5, arredondando para o inteiro de maior magnitude.
5. THE Insulin_Calculator SHALL retornar Total_Dose (valor bruto) e Rounded_Dose como valores separados.
6. WHEN o Insulin_Calculator é executado com entradas idênticas, THE Insulin_Calculator SHALL produzir saídas idênticas em qualquer execução.
7. THE Insulin_Calculator SHALL executar sem dependência de Supabase, OpenAI, WhatsApp, HTTP, filesystem ou variáveis de ambiente.
8. THE Glicia_System SHALL implementar o cálculo de insulina em um único lugar do código.
9. IF glucose for menor que targetGlucose, THEN THE Insulin_Calculator SHALL retornar uma Correction_Dose negativa e refleti-la na Total_Dose.
10. WHEN glucose é igual a targetGlucose, THE Insulin_Calculator SHALL calcular Correction_Dose como zero.
11. WHERE carbohydrateRatio é maior que zero, WHEN carbohydrates é igual a zero, THE Insulin_Calculator SHALL calcular Carbohydrate_Dose como zero.
12. IF correctionFactor for igual a zero ou carbohydrateRatio for igual a zero, THEN THE Insulin_Calculator SHALL sinalizar um erro e abster-se de produzir uma dose.
13. IF qualquer entrada numérica obrigatória for ausente, nula, não numérica, NaN ou infinita, THEN THE Insulin_Calculator SHALL sinalizar um erro em vez de produzir um cálculo.

### Requisito 8: Parâmetros Configuráveis de Cálculo

**User Story:** Como a paciente, quero que os parâmetros do protocolo fiquem armazenados e configuráveis, para que o cálculo reflita meu protocolo sem valores fixos no código.

#### Critérios de Aceitação

1. THE Glicia_System SHALL armazenar Target_Glucose em mg/dL e Correction_Factor em mg/dL por unidade de insulina em insulin_settings associados à Patient.
2. THE Glicia_System SHALL armazenar Carbohydrate_Ratio por Meal_Type em gramas de carboidrato por unidade de insulina em insulin_meal_settings associados à Patient.
3. WHEN uma Patient é registrada, THE Glicia_System SHALL inicializar Target_Glucose com 120 mg/dL e Correction_Factor com 40 mg/dL por unidade.
4. WHEN uma Patient é registrada, THE Glicia_System SHALL inicializar Carbohydrate_Ratio com BREAKFAST=8, LUNCH=6, SNACK=8 e DINNER=10 gramas por unidade.
5. THE Glicia_System SHALL abster-se de fixar (hardcode) os parâmetros de cálculo no código.
6. WHEN o cálculo de insulina é executado, THE Glicia_System SHALL obter os parâmetros exclusivamente a partir das tabelas insulin_settings e insulin_meal_settings.
7. IF um parâmetro de cálculo necessário estiver ausente em insulin_settings ou insulin_meal_settings no momento do cálculo, THEN THE Glicia_System SHALL abster-se de calcular e indicar erro de parâmetro ausente.
8. WHEN a paciente atualiza um parâmetro de cálculo (Target_Glucose, Correction_Factor ou Carbohydrate_Ratio) com um valor numérico maior que 0 e menor ou igual a 999, THE Glicia_System SHALL persistir o novo valor do parâmetro.
9. IF a paciente atualiza um parâmetro de cálculo com valor não numérico, menor ou igual a 0 ou maior que 999, THEN THE Glicia_System SHALL rejeitar a atualização, indicar erro de validação e preservar o valor anterior do parâmetro.

### Requisito 9: Persistência da Refeição e do Cálculo com Snapshot

**User Story:** Como a paciente, quero que cada refeição e cálculo sejam salvos com os parâmetros usados no momento, para que registros históricos permaneçam corretos mesmo se os parâmetros mudarem depois.

#### Critérios de Aceitação

1. WHEN a paciente confirma a refeição, THE Glicia_System SHALL executar o Insulin_Calculator.
2. WHEN o Insulin_Calculator conclui o cálculo, THE Glicia_System SHALL persistir a refeição e o cálculo.
3. WHEN a refeição e o cálculo são persistidos, THE Glicia_System SHALL persistir a refeição e o cálculo de forma atômica, gravando ambos por completo ou nenhum deles.
4. IF a persistência da refeição ou do cálculo falhar, THEN THE Glicia_System SHALL reverter a operação (rollback), abster-se de gravar registros parciais e indicar erro de persistência.
5. WHEN o cálculo é persistido, THE Glicia_System SHALL armazenar um Parameter_Snapshot contendo target_glucose, correction_factor e carbohydrate_ratio usados no cálculo.
6. WHEN o cálculo é persistido, THE Glicia_System SHALL armazenar Formula_Version com o valor "1.0".
7. WHEN o cálculo é persistido, THE Glicia_System SHALL armazenar glucose, total_carbohydrates, correction_dose, carbohydrate_dose, total_dose e rounded_dose.
8. WHEN um meal_item é persistido, THE Glicia_System SHALL armazenar food_name_snapshot, quantity, unit e carbohydrates no próprio item.
9. WHEN uma refeição histórica é exibida ou recuperada, THE Glicia_System SHALL usar os valores armazenados no meal_item, e não o valor atual do Food.

### Requisito 10: Registro de Dose Calculada e Dose Aplicada

**User Story:** Como a paciente, quero registrar separadamente a dose calculada e a dose que efetivamente apliquei, para acompanhar diferenças entre a recomendação do protocolo e minha aplicação real.

#### Critérios de Aceitação

1. WHEN o Glicia_System gera a Calculated_Dose para uma refeição, THE Glicia_System SHALL armazenar a Calculated_Dose em campo distinto e independente do campo da Applied_Dose.
2. THE Glicia_System SHALL manter a Applied_Dose e a Calculated_Dose como valores independentes, sem preencher, copiar ou inferir automaticamente a Applied_Dose a partir do valor da Calculated_Dose.
3. WHEN a paciente informa a Applied_Dose com valor numérico entre 0,1 e 250 unidades, THE Glicia_System SHALL persistir a Applied_Dose associada à refeição e retornar confirmação de registro em até 3 segundos.
4. IF a paciente informa a Applied_Dose com valor não numérico, negativo, igual a zero ou superior a 250 unidades, THEN THE Glicia_System SHALL rejeitar o registro, exibir mensagem indicando que o valor da dose é inválido e preservar a Applied_Dose previamente registrada, se houver.
5. WHERE a paciente não informa a Applied_Dose, THE Glicia_System SHALL manter a Applied_Dose como não registrada e preservar a Calculated_Dose sem alteração.
6. WHEN a Applied_Dose e a Calculated_Dose estão ambas registradas para a mesma refeição, THE Glicia_System SHALL exibir a diferença numérica entre a Applied_Dose e a Calculated_Dose em unidades.

### Requisito 11: Fluxo de Perguntas por Informação Ausente ou Ambígua

**User Story:** Como a paciente, quero que o sistema pergunte apenas o que falta, para não responder informações que já forneci.

#### Critérios de Aceitação

1. IF missingInformation contém GLUCOSE, THEN THE Conversation_Orchestrator SHALL solicitar à paciente o valor da glicemia.
2. IF missingInformation contém MEAL, THEN THE Conversation_Orchestrator SHALL solicitar à paciente o tipo de refeição.
3. IF missingInformation contém FOOD, THEN THE Conversation_Orchestrator SHALL solicitar à paciente o alimento não identificado.
4. IF missingInformation contém FOOD_QUANTITY, THEN THE Conversation_Orchestrator SHALL solicitar à paciente a quantidade do alimento.
5. WHEN a primeira mensagem contém glicemia, tipo de refeição, alimentos e quantidades sem ambiguidade, THE Conversation_Orchestrator SHALL prosseguir para a confirmação sem fazer perguntas adicionais.
6. THE Conversation_Orchestrator SHALL solicitar apenas as informações listadas em missingInformation ou necessárias para resolver ambiguidades.

### Requisito 12: Importação da Base de Alimentos a partir do Manual SBD

**User Story:** Como responsável técnico, quero importar a tabela de alimentos do Manual SBD para a base local, para que a resolução de alimentos use dados oficiais de contagem de carboidratos.

#### Critérios de Aceitação

1. THE Glicia_System SHALL importar a tabela de alimentos do SBD_Manual (páginas 48-153) para o Food_Database.
2. WHEN um alimento é importado, THE Glicia_System SHALL armazenar o nome, a medida usual (default_serving_unit), a quantidade em g/ml (default_serving_quantity) e o carboidrato em g (carbohydrates).
3. WHEN um alimento é importado, THE Glicia_System SHALL registrar o Food como ativo por padrão.
4. IF uma linha da tabela importada estiver incompleta ou malformada, THEN THE Glicia_System SHALL sinalizar a linha como erro de importação sem interromper a importação das linhas válidas.
5. THE Glicia_System SHALL permitir o cadastro de Food_Alias associados a um Food para suportar variações de nome usadas pela paciente.

### Requisito 13: Idempotência e Deduplicação de Mensagens

**User Story:** Como responsável técnico, quero que mensagens repetidas não gerem registros duplicados, para manter a integridade dos dados.

#### Critérios de Aceitação

1. THE Glicia_System SHALL aplicar uma restrição de unicidade sobre External_Message_Id.
2. WHEN uma mensagem com External_Message_Id já processado é recebida, THE Glicia_System SHALL abster-se de criar um novo registro de refeição para essa mensagem.
3. WHERE o canal é o Terminal_Channel, THE Glicia_System SHALL aplicar um mecanismo equivalente de deduplicação de mensagens de entrada.
4. **[FASE FUTURA]** WHERE o canal é o WhatsApp, THE Glicia_System SHALL usar o identificador de mensagem do WhatsApp como External_Message_Id.

### Requisito 14: Autorização da Paciente Única

**User Story:** Como responsável técnico, quero que apenas a paciente cadastrada seja atendida, para proteger dados de saúde e evitar processamento de remetentes não autorizados.

#### Critérios de Aceitação

1. THE Glicia_System SHALL atender exclusivamente a Patient cadastrada.
2. IF uma mensagem provém de um remetente não autorizado, THEN THE Glicia_System SHALL abster-se de consultar dados, executar o Interpreter, executar o Insulin_Calculator e criar registros.
3. WHERE o canal é o Terminal_Channel, THE Glicia_System SHALL assumir a identidade da Patient única cadastrada.
4. **[FASE FUTURA]** WHERE o canal é o WhatsApp, THE Glicia_System SHALL autorizar a mensagem apenas quando o whatsapp_phone do remetente corresponder ao whatsapp_phone cadastrado da Patient.
5. THE Glicia_System SHALL manter a entidade Patient para separar o domínio, sem introduzir multi-tenancy.

### Requisito 15: Segurança e Privacidade de Dados de Saúde

**User Story:** Como a paciente, quero que meus dados clínicos e segredos de integração sejam protegidos, para preservar minha privacidade.

#### Critérios de Aceitação

1. THE Glicia_System SHALL manter segredos (OPENAI_API_KEY, WHATSAPP_*) exclusivamente no lado servidor.
2. THE Glicia_System SHALL abster-se de expor segredos em qualquer frontend.
3. THE Glicia_System SHALL fornecer um arquivo .env.example sem valores de segredos reais.
4. WHEN eventos são registrados em log, THE Glicia_System SHALL registrar apenas message_id, patient_id, event_type, status, processing_time, timestamp e correlation IDs.
5. THE Glicia_System SHALL abster-se de registrar dados clínicos completos nos logs.

### Requisito 16: Gestão de Conversa

**User Story:** Como responsável técnico, quero que o estado da conversa seja rastreado, para coordenar interpretação, confirmação e conclusão.

#### Critérios de Aceitação

1. WHEN uma nova interação é iniciada, THE Conversation_Orchestrator SHALL criar uma Conversation com status ACTIVE.
2. WHEN a conversa aguarda confirmação, THE Conversation_Orchestrator SHALL definir o status como WAITING_CONFIRMATION.
3. WHEN a refeição é confirmada e persistida, THE Conversation_Orchestrator SHALL definir o status como COMPLETED.
4. WHEN a paciente cancela a interação, THE Conversation_Orchestrator SHALL definir o status como CANCELLED.
5. WHEN uma mensagem é recebida ou enviada, THE Glicia_System SHALL registrar um conversation_message com direction (INBOUND ou OUTBOUND), message_type TEXT e content.
6. THE Glicia_System SHALL modelar conversation_message de modo a suportar futuramente message_type AUDIO sem alterar o fluxo de texto.

### Requisito 17: Limites de Regras Clínicas

**User Story:** Como a paciente, quero que o sistema execute apenas o protocolo configurado, para que nenhuma regra clínica não especificada seja introduzida automaticamente.

#### Critérios de Aceitação

1. THE Glicia_System SHALL executar de forma determinística apenas o protocolo configurado (Target_Glucose, Correction_Factor, Carbohydrate_Ratio e a fórmula da versão 1.0).
2. THE Glicia_System SHALL abster-se de introduzir automaticamente regras clínicas não especificadas, incluindo exercício, insulina ativa, doença, álcool, hipoglicemia, cetonas, proteína, gordura e net carbs.
3. IF não houver informação suficiente para calcular (glicemia, tipo de refeição, alimento ou quantidade ausentes), THEN THE Conversation_Orchestrator SHALL informar à paciente que faltam dados e abster-se de calcular.

### Requisito 18: Testabilidade e Determinismo

**User Story:** Como responsável técnico, quero testes automatizados abrangentes do cálculo e do fluxo, para validar a correção e a qualidade do código offline.

#### Critérios de Aceitação

1. THE Glicia_System SHALL prover testes unitários do Insulin_Calculator cobrindo glicemia igual, acima e abaixo da meta.
2. THE Glicia_System SHALL prover testes unitários do Insulin_Calculator cobrindo zero carboidratos, diferentes valores de Carbohydrate_Ratio, entradas decimais e arredondamento.
3. THE Glicia_System SHALL prover testes unitários do Insulin_Calculator cobrindo entradas inválidas.
4. THE Glicia_System SHALL prover testes do Interpreter e do contrato MealInterpretation cobrindo mensagens completas, incompletas e ambíguas.
5. THE Glicia_System SHALL prover testes do fluxo end-to-end local cobrindo mensagem completa e mensagem que requer perguntas adicionais.
6. THE Glicia_System SHALL executar todos os testes de Fase 1 sem chamadas de rede externas.

### Requisito 19: Fluxo Principal End-to-End (MVP Local)

**User Story:** Como a paciente, quero registrar uma refeição do início ao fim pelo terminal, para validar a solução completa offline.

#### Critérios de Aceitação

1. WHEN a paciente envia uma mensagem em linguagem natural pelo Terminal_Channel, THE Glicia_System SHALL interpretá-la em uma MealInterpretation.
2. WHEN a MealInterpretation é produzida, THE Glicia_System SHALL resolver os alimentos contra o Food_Database e calcular o total de carboidratos deterministicamente.
3. WHEN os alimentos são resolvidos e o total de carboidratos é calculado, THE Glicia_System SHALL apresentar a interpretação e o total de carboidratos para confirmação.
4. WHEN a paciente confirma, THE Glicia_System SHALL executar o Insulin_Calculator e persistir a refeição e o cálculo com Parameter_Snapshot e Formula_Version "1.0".
5. IF faltarem informações ou houver ambiguidade, THEN THE Glicia_System SHALL fazer apenas as perguntas necessárias antes de prosseguir.

### Requisito 20: Extensibilidade Futura

**User Story:** Como responsável técnico, quero que a arquitetura não bloqueie integrações futuras, para permitir WhatsApp, OpenAI, áudio, Sheets e web sem reescrever o domínio.

#### Critérios de Aceitação

1. **[FASE FUTURA]** WHERE o canal WhatsApp é habilitado, THE Glicia_System SHALL processar mensagens de texto do WhatsApp pelo mesmo pipeline de domínio usado pelo Terminal_Channel.
2. **[FASE FUTURA]** WHERE o Interpreter baseado em OpenAI é habilitado, THE Glicia_System SHALL usar a OpenAI Responses API com JSON Schema para produzir a MealInterpretation, sem incluir dose de insulina.
3. **[FASE FUTURA]** WHERE o áudio via WhatsApp é habilitado, THE Glicia_System SHALL transcrever o áudio e encaminhar o texto ao mesmo pipeline de texto.
4. **[FASE FUTURA]** WHERE a integração com Google Sheets é habilitada, THE Glicia_System SHALL tratar o Postgres como fonte de verdade e manter a refeição persistida mesmo quando a sincronização com o Sheets falhar.
5. **[FASE FUTURA]** WHERE a interface web administrativa é habilitada, THE Glicia_System SHALL expor dashboard, gestão de alimentos, configurações e histórico.
6. THE Glicia_System SHALL abster-se de implementar multi-tenancy e infraestrutura de escala não requerida pelo escopo atual.
