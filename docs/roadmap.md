# Roadmap

Este roadmap descreve uma direção, não um compromisso de prazo. O Glicia continuará sendo um utilitário open source, local-first e configurável; não pretende se tornar um produto de decisão clínica autônoma.

A decomposição em entregas, dependências e critérios de aceite está no [plano de execução](plano-execucao.md).

A CLI foi a primeira interface porque permitiu validar rapidamente a utilidade do fluxo. O próximo objetivo é disponibilizar a mesma experiência em uma **Progressive Web App (PWA) mobile-first**, acessível pelo navegador e instalável na tela inicial do celular, sem depender de publicação na App Store ou Google Play.

## Visão do produto

A PWA deve preservar o funcionamento já validado na CLI:

1. A pessoa descreve em linguagem natural o que pretende comer, a glicemia e a tendência do sensor.
2. A Glicia conduz uma conversa curta para obter carboidratos, glicemia, tendência e tipo de refeição.
3. A IA organiza a contagem usando a tabela de alimentos e devolve dados estruturados; nunca calcula a dose.
4. A pessoa revisa e confirma os dados extraídos ou informa uma correção.
5. O cálculo determinístico e as travas de segurança são executados somente após a confirmação.
6. A pessoa pode informar a quantidade de insulina realmente aplicada.
7. Preferências, memória alimentar e histórico permanecem no dispositivo.

No celular, os comandos do terminal serão substituídos por controles visuais. O modo Preciso ou Rápido será um seletor acessível na conversa e nas configurações. Parâmetros clínicos, chave da API, memória alimentar e dados locais ficarão em uma área própria de configurações.

O usuário continuará informando manualmente a glicemia e a seta exibidas pelo FreeStyle Libre. Não está prevista integração direta com o sensor, LibreLink ou LibreView.

## Princípios da PWA

- **Paridade funcional:** portar o comportamento atual antes de adicionar novas capacidades.
- **Conversa como interface principal:** texto livre e múltiplos turnos continuam sendo o centro da experiência.
- **Voz sem dependência inicial:** a primeira versão poderá usar o ditado do teclado do celular; gravação e transcrição próprias serão avaliadas posteriormente.
- **Cálculo local e determinístico:** a fórmula, o arredondamento e as travas não serão delegados à IA.
- **Confirmação humana obrigatória:** nenhum cálculo será apresentado antes da revisão explícita dos dados.
- **Dados locais:** configurações, memória alimentar e histórico não exigirão conta ou sincronização remota.
- **Portabilidade dos dados:** a pessoa poderá exportar, importar e manter backup dos dados locais sem incluir chaves de API.
- **Instalação opcional:** a aplicação funcionará por URL e poderá ser adicionada à tela inicial.
- **Acessibilidade:** alvos de toque, contraste, tamanho de texto, navegação por teclado e leitores de tela farão parte dos critérios de conclusão.

## Experiência planejada

A navegação principal da PWA será organizada em três áreas:

- **Conversa:** diálogo com a Glicia, estado da consulta, confirmação e resultado.
- **Histórico:** refeições confirmadas e doses aplicadas salvas neste dispositivo.
- **Configurações:** chave da OpenAI, parâmetros clínicos, RICs, modo de interação, memória alimentar e controles dos dados locais.

### Primeiro acesso e onboarding obrigatório

Na primeira abertura, a PWA deverá iniciar um onboarding obrigatório antes de liberar a conversa. A instalação na tela inicial será oferecida antes da configuração sempre que a plataforma permitir, evitando que dados preenchidos no navegador precisem ser informados novamente na aplicação instalada.

O onboarding será curto, retomável e dividido em etapas:

1. **Apresentação e limites:** explicar a finalidade da Glicia, a confirmação humana e as limitações, incluindo a ausência de cálculo de insulina ativa.
2. **OpenAI:** orientar a criação da chave, permitir colar a chave em campo protegido e validá-la antes de continuar.
3. **Parâmetros pessoais:** solicitar glicemia-alvo, fator de correção, limite de hipoglicemia e basal matinal.
4. **RICs:** solicitar separadamente os valores de café da manhã, almoço, café da tarde, jantar e ceia.
5. **Modo de interação:** escolher entre Preciso e Rápido, apresentando a diferença entre eles.
6. **Revisão:** mostrar todos os parâmetros e exigir confirmação de que foram definidos com a equipe de saúde.

Não será possível pular a chave, os parâmetros de cálculo, os cinco RICs ou a revisão final. Cada valor numérico deverá ser finito e obedecer às mesmas validações da CLI. O progresso será salvo localmente a cada etapa para que o onboarding possa ser retomado se a aplicação for fechada.

A conversa será liberada somente quando o onboarding estiver completo. Se a chave for removida, tornar-se inválida ou algum parâmetro obrigatório estiver ausente após uma atualização, a aplicação bloqueará novas consultas e direcionará a pessoa para corrigir a configuração, sem apagar os demais dados válidos.

Depois do primeiro acesso, todos esses valores poderão ser consultados e alterados na aba **Configurações**, com resumo e confirmação antes de salvar. A pessoa também poderá reiniciar o onboarding sem apagar o histórico.

A tela da OpenAI oferecerá instruções para criar uma chave, campo protegido para colá-la, validação, substituição e remoção.

A chave pertence à pessoa usuária e nunca deverá ser incluída em conversas, histórico, exportações, telemetria ou logs. O projeto deverá documentar claramente que armazenar uma chave em uma aplicação executada no navegador possui riscos diferentes do uso atual por variável de ambiente. A estratégia de armazenamento, a política de conteúdo da aplicação e a viabilidade de chamadas diretas ao provedor deverão passar por revisão de segurança antes da disponibilização pública.

## Versionamento e caminho para a v1

Enquanto faltar uma parte essencial do fluxo de uso real no celular, as versões usam o sufixo
`alpha`. Isto inclui onboarding, parâmetros clínicos obrigatórios, chave/configuração do
provedor, cálculo local, persistência e recuperação de dados.

Uma versão `beta` começa quando o fluxo está completo para os pilotos: não faltam etapas do
percurso principal, a PWA foi validada em Android e iOS e os riscos de chave, dados locais,
erros e backup têm uma decisão implementada. Beta ainda é período de validação ampliada — não é
uma alegação de dispositivo médico nem substitui a conferência humana.

Use sufixos de correção para releases intermediárias, por exemplo `v0.3.0-alpha.1` e
`v0.9.0-beta.1`. A versão `v1.0.0` só será publicada após uma beta sem problemas críticos e com
o fluxo principal, instalação e recuperação estáveis.

| Versão | Foco | Critério de avanço |
| --- | --- | --- |
| `v0.1.0-alpha` | CLI alpha e validação inicial da utilidade. | Código instalável, contagem assistida por IA, confirmação explícita, cálculo local e histórico. |
| `v0.2.0-alpha` | Contrato de comportamento independente da CLI. | Fluxo conversacional, correções, modos, memória, configuração, travas e histórico cobertos por testes de caracterização. |
| `v0.3.0-alpha` | Protótipo mobile-first da conversa. | PWA utilizável no navegador do celular com texto, ditado do teclado, respostas em Markdown e continuidade entre turnos. |
| `v0.4.0-alpha` | Onboarding, configuração e BYOK na PWA. | Primeiro acesso obrigatório e retomável, estados de chave ausente/inválida/válida, configuração dos parâmetros e RICs, revisão final, seletor de modo e edição posterior confirmada. |
| `v0.5.0-alpha` | Paridade funcional com a CLI. | Confirmação e correção dos dados, mesmas travas, mesmos resultados de cálculo e registro da dose aplicada. |
| `v0.6.0-alpha` | Persistência, portabilidade e instalação. | Preferências, memória alimentar e histórico estáveis; atualização da PWA sem perda de dados; exportação, importação e backup local validados; instalação orientada na tela inicial. |
| `v0.7.0-alpha` | Segurança, privacidade e contingência. | Revisão do tratamento da chave e dos dados de saúde, política de conteúdo restritiva, limpeza de dados e modo manual sem IA. |
| `v0.8.0-alpha` | Seleção de modelo e múltiplos provedores de IA. | Contrato comum de provedor, modelos validados por avaliações de regressão, credenciais separadas e troca de provedor ou modelo entre refeições. |
| `v0.9.0-beta` | Beta fechada no celular. | Testes em Android e iOS, acessibilidade, avaliação com usuários pilotos, CI e nenhuma regressão conhecida em relação à CLI. |
| `v1.0.0` | PWA estável. | Interface mobile estável, fluxo principal confiável, instalação documentada e nenhum problema crítico conhecido. |

## Portabilidade e testes

A CLI continuará disponível e servirá como referência de comportamento durante a transição. A camada de apresentação do terminal não deverá ser reutilizada como regra de negócio.

O monorepo mantém as interfaces em `apps/cli` e `apps/pwa`. Schemas e fixtures neutros vivem em
`packages/contracts`; não há um runtime de domínio único compartilhado entre Python e TypeScript.
Cada aplicação implementa o núcleo em sua linguagem e comprova a paridade pelos mesmos casos.

Antes de portar o fluxo, serão definidos casos de conformidade compartilhados para:

- completude dos quatro campos da conversa;
- correções antes da confirmação;
- modos Preciso e Rápido;
- atualização da memória alimentar;
- validação e precedência de parâmetros;
- faixas de ajuste de tendência;
- arredondamento final;
- bloqueio por hipoglicemia;
- alerta de queda rápida;
- persistência do registro confirmado.

A implementação web deverá produzir os mesmos resultados da implementação Python para os mesmos casos. Mudanças intencionais de comportamento serão documentadas separadamente e não deverão ser introduzidas silenciosamente durante o porte.

## Integrações de IA

Inicialmente, a PWA manterá o princípio **traga sua própria chave** e o contrato estruturado já utilizado com a API Responses da OpenAI. A pessoa configurará a chave e escolherá o modelo na própria interface, sem precisar editar arquivos ou variáveis de ambiente. A configuração inicial oferecerá um modelo padrão já validado; opções avançadas não serão necessárias para concluir o onboarding.

A camada de aplicação não deverá depender de conceitos exclusivos da OpenAI, como `previous_response_id`. Ela consumirá um contrato comum de provedor responsável por:

- receber as instruções, a mensagem atual e o estado necessário da conversa;
- autenticar usando a credencial configurada para aquele provedor;
- converter a resposta para o mesmo schema estruturado de turno;
- classificar erros de autenticação, limite, modelo indisponível, rede e resposta inválida;
- informar quais modelos estão disponíveis e foram validados pela Glicia.

A aba **Configurações** deverá permitir escolher o provedor, configurar sua credencial e selecionar um modelo. Cada provedor manterá sua própria configuração, sem reutilizar chaves entre serviços. A troca de provedor ou modelo será aplicada apenas à próxima refeição, nunca no meio de uma conversa já iniciada.

Ordem preferencial de evolução:

1. API Responses da OpenAI, com seleção entre modelos previamente validados.
2. Endpoint compatível com a API OpenAI, disponível em configurações avançadas.
3. Adaptadores para outros provedores de IA, priorizados conforme demanda.
4. Modo manual, sem IA, para contingência e uso totalmente local.
5. Modelos locais, conforme viabilidade no navegador ou em uma instalação auto-hospedada.

Modelos menores, rápidos ou classificados pelo fornecedor como *flash* poderão ser suficientes para o fluxo, pois a IA somente estrutura a refeição e não calcula a dose. Essa adequação não será presumida pelo nome ou pelo posicionamento comercial do modelo: cada combinação de provedor e modelo deverá passar por avaliações repetíveis que verifiquem:

- produção consistente do schema esperado;
- contagem de carboidratos baseada na tabela fornecida;
- perguntas corretas quando faltarem dados essenciais;
- respeito às diferenças entre os modos Preciso e Rápido;
- preservação de contexto, correções e memória alimentar;
- recusa em calcular ou recomendar insulina;
- comportamento esperado em glicemia baixa e demais situações de segurança.

A interface mostrará primeiro uma lista curta de modelos aprovados. Um identificador de modelo personalizado poderá existir em configurações avançadas, acompanhado do aviso de que não foi validado pelo projeto. Provedor e modelo usados serão registrados junto ao histórico técnico da interação para permitir diagnóstico e reprodução, sem armazenar a chave.

Todo provedor deverá devolver os mesmos dados estruturados. A confirmação humana e o cálculo determinístico local permanecem independentes do modelo usado.

## Decisões que antecedem a publicação pública

- Validar a compatibilidade da PWA com os navegadores móveis suportados.
- Definir e revisar o armazenamento local da chave da API, deixando seus riscos claros para a pessoa usuária.
- Confirmar que nenhuma chave ou dado de saúde seja incluído em logs, relatórios de erro ou exportações.
- Definir migrações para preferências e histórico sem perda de dados.
- Definir um formato versionado de exportação e importação, sempre excluindo credenciais e criando uma cópia de segurança antes de substituir dados.
- Confirmar as condições para redistribuição da tabela de alimentos.
- Avaliar requisitos regulatórios e de proteção de dados antes de ampliar o uso além do piloto.

## Fora de escopo

- Integração direta com o sensor FreeStyle Libre, LibreLink ou LibreView.
- Aplicativos nativos distribuídos pela App Store ou Google Play.
- WhatsApp como interface principal da primeira PWA.
- Prescrever, escolher ou alterar parâmetros clínicos.
- Calcular insulina ativa ou substituir o plano individual.
- Automatizar aplicação de insulina ou operar bombas.
- Exigir login, backend próprio ou sincronização remota para o fluxo principal.
- Apresentar o projeto como dispositivo médico, prontuário ou serviço de telemedicina.
