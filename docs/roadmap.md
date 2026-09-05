# Roadmap

Este roadmap descreve uma direção, não um compromisso de prazo. O Glicia continuará sendo um
utilitário open source, configurável e com dados sob controle da pessoa usuária; não pretende se
tornar um produto de decisão clínica autônoma.

A decomposição em entregas, dependências e critérios de aceite está no [plano de execução](plano-execucao.md).

A CLI foi a primeira interface porque permitiu validar rapidamente a utilidade do fluxo. O próximo objetivo é disponibilizar a mesma experiência em uma **Progressive Web App (PWA) mobile-first**, acessível pelo navegador e instalável na tela inicial do celular, sem depender de publicação na App Store ou Google Play.

## Visão do produto

A PWA deve preservar o funcionamento já validado na CLI. A próxima evolução a torna cliente
autenticada de uma API Supabase: o navegador não chamará provedores de IA diretamente nem será a
fonte principal dos dados de saúde.

1. A pessoa descreve em linguagem natural o que pretende comer, a glicemia e a tendência do sensor.
2. A Glicia conduz uma conversa curta para obter carboidratos, glicemia, tendência e tipo de refeição.
3. A IA organiza a contagem usando a tabela de alimentos e devolve dados estruturados; nunca calcula a dose.
4. A pessoa revisa e confirma os dados extraídos ou informa uma correção.
5. O cálculo determinístico e as travas de segurança são executados somente após a confirmação.
6. A pessoa pode informar a quantidade de insulina realmente aplicada.
7. Preferências, memória alimentar e histórico pertencem à conta da pessoa e ficam sincronizados.

No celular, os comandos do terminal serão substituídos por controles visuais. O modo Preciso ou
Rápido será um seletor acessível na conversa e nas configurações. Parâmetros clínicos, memória
alimentar e histórico ficarão em áreas próprias. A conexão com o provedor de IA será uma
configuração operacional do backend, sem chave ou seletor de modelo na interface da pessoa.

O usuário continuará informando manualmente a glicemia e a seta exibidas pelo FreeStyle Libre. Não está prevista integração direta com o sensor, LibreLink ou LibreView.

## Princípios da PWA

- **Paridade funcional:** portar o comportamento atual antes de adicionar novas capacidades.
- **Conversa como interface principal:** texto livre e múltiplos turnos continuam sendo o centro da experiência.
- **Voz sem dependência inicial:** a primeira versão poderá usar o ditado do teclado do celular; gravação e transcrição próprias serão avaliadas posteriormente.
- **Cálculo local e determinístico:** a fórmula, o arredondamento e as travas não serão delegados à IA.
- **Confirmação humana obrigatória:** nenhum cálculo será apresentado antes da revisão explícita dos dados.
- **Conta e sincronização:** a pessoa entra por e-mail com link ou código mágico; PostgreSQL é a
  fonte principal de configurações, memória e histórico.
- **Acesso experimental controlado:** enquanto a Glicia estiver em validação, somente endereços
  aprovados pelo autor poderão criar uma conta e usar a aplicação.
- **Credencial central no backend:** durante o piloto fechado, a Glicia usa uma chave do projeto,
  armazenada somente nos secrets das Edge Functions. A credencial não pertence à pessoa usuária,
  não chega ao navegador e não entra em banco, logs ou backups operacionais.
- **Instalação opcional:** a aplicação funcionará por URL e poderá ser adicionada à tela inicial.
- **Acessibilidade:** alvos de toque, contraste, tamanho de texto, navegação por teclado e leitores de tela farão parte dos critérios de conclusão.

## Experiência planejada

A navegação principal da PWA será organizada em três áreas:

- **Conversa:** diálogo com a Glicia, estado da consulta, confirmação e resultado.
- **Histórico:** refeições confirmadas e doses aplicadas da conta.
- **Configurações:** parâmetros clínicos, RICs, modo de interação, memória alimentar e controles
  da conta. Provedor, modelo e credenciais são administrados no backend.

### Primeiro acesso e onboarding obrigatório

Na primeira abertura, a PWA deverá verificar se a pessoa já possui acesso. Quem ainda não tiver
uma conta aprovada poderá cadastrar o e-mail para solicitar participação no experimento. O
onboarding obrigatório começará somente depois da aprovação e da autenticação. A instalação na
tela inicial será oferecida antes da configuração sempre que a plataforma permitir, evitando que
dados preenchidos no navegador precisem ser informados novamente na aplicação instalada.

O onboarding será curto, retomável e dividido em etapas:

1. **Apresentação e limites:** explicar a finalidade da Glicia, a confirmação humana e as limitações, incluindo a ausência de cálculo de insulina ativa.
2. **Conta:** entrar por e-mail usando link ou código mágico; não haverá senha própria.
3. **Parâmetros pessoais:** solicitar glicemia-alvo, fator de correção, limite de hipoglicemia e basal matinal.
4. **RICs:** solicitar separadamente os valores de café da manhã, almoço, café da tarde, jantar e ceia.
5. **Modo de interação:** escolher entre Preciso e Rápido, apresentando a diferença entre eles.
6. **Revisão:** mostrar todos os parâmetros e exigir confirmação de que foram definidos com a equipe de saúde.

Não será possível pular a conta, os parâmetros de cálculo, os cinco RICs ou a revisão final. Cada
valor numérico deverá ser finito e obedecer às mesmas validações da CLI. O progresso será
associado à conta para que possa ser retomado em outro aparelho.

A conversa será liberada somente quando o onboarding estiver completo. Se o provedor estiver
indisponível, a aplicação deverá informar uma falha operacional sem pedir uma chave à pessoa. Se
algum parâmetro obrigatório estiver ausente após uma atualização, novas consultas serão bloqueadas
até a correção, sem apagar os demais dados válidos.

Depois do primeiro acesso, todos esses valores poderão ser consultados e alterados na aba **Configurações**, com resumo e confirmação antes de salvar. A pessoa também poderá reiniciar o onboarding sem apagar o histórico.

Não haverá tela de chave da OpenAI. A chave central será configurada e rotacionada pelo autor nos
secrets das Edge Functions e lida somente pelo adaptador do provedor no backend.

## Versionamento e caminho para a v1

Enquanto faltar uma parte essencial do fluxo de uso real no celular, as versões usam o sufixo
`alpha`. Isto inclui onboarding, parâmetros clínicos obrigatórios, autenticação, integração de IA no backend,
cálculo local, persistência remota, migração e recuperação de dados.

Uma versão `beta` começa quando o fluxo está completo para os pilotos: não faltam etapas do
percurso principal, a PWA foi validada em Android e iOS e os riscos de chave, dados de saúde,
erros, autenticação e recuperação operacional têm uma decisão implementada. Beta ainda é período de validação ampliada — não é
uma alegação de dispositivo médico nem substitui a conferência humana.

Use sufixos de correção para releases intermediárias, por exemplo `v0.3.0-alpha.1` e
`v0.12.0-beta.1`. A versão `v1.0.0` só será publicada após uma beta sem problemas críticos e com
o fluxo principal, instalação e recuperação estáveis.

| Versão | Foco | Critério de avanço |
| --- | --- | --- |
| `v0.1.0-alpha` | CLI alpha e validação inicial da utilidade. | Código instalável, contagem assistida por IA, confirmação explícita, cálculo local e histórico. |
| `v0.2.0-alpha` | Contrato de comportamento independente da CLI. | Fluxo conversacional, correções, modos, memória, configuração, travas e histórico cobertos por testes de caracterização. |
| `v0.3.0-alpha` | Protótipo mobile-first da conversa. | PWA utilizável no navegador do celular com texto, ditado do teclado, respostas em Markdown e continuidade entre turnos. |
| `v0.4.0-alpha` | Onboarding, configuração e BYOK na PWA. | Primeiro acesso obrigatório e retomável, estados de chave ausente/inválida/válida, configuração dos parâmetros e RICs, revisão final, seletor de modo e edição posterior confirmada. |
| `v0.5.0-alpha` | Paridade funcional com a CLI. | Confirmação e correção dos dados, mesmas travas, mesmos resultados de cálculo e registro da dose aplicada. |
| `v0.6.0-alpha` | Persistência, portabilidade e instalação. | Preferências, memória alimentar e histórico estáveis; atualização da PWA sem perda de dados; exportação, importação e backup local validados; instalação orientada na tela inicial. Concluída. |
| `v0.7.0-alpha` | Plataforma Supabase, conta e BYOK seguro. | Infraestrutura versionada, autenticação por e-mail, PostgreSQL/RLS, conexão OpenAI cifrada e proxy em Edge Function. Concluída. |
| `v0.8.0-alpha` | Acesso experimental controlado. | Solicitação pública, revisão administrativa autenticada, criação de conta bloqueada para e-mails não aprovados, notificações e login por magic link. Concluída. |
| `v0.9.0-alpha` | Credencial central, segurança, CI/CD, privacidade e contingência. | BYOK removido da experiência, chave do projeto nos secrets do backend, CI obrigatória, deploy automatizado em staging, promoção protegida para produção, exclusão por conta, recuperação operacional e modo manual sem IA. Concluída. |
| `v0.10.0-alpha` | Limites de uso e guardrails de IA. | Quotas por pessoa e globais, proteção contra prompt injection e uso fora da finalidade, observabilidade sem conteúdo sensível e suspensão administrativa. |
| `v0.11.0-alpha` | Modelos e múltiplos provedores de IA. | Registro administrativo de provedores, modelos validados, credenciais centrais isoladas e troca somente entre refeições. |
| `v0.12.0-beta` | Beta fechada no celular. | Testes em Android e iOS, acessibilidade, recuperação de conta, avaliação com pilotos, CI e nenhuma regressão conhecida em relação à CLI. |
| `v1.0.0` | PWA estável. | Interface mobile estável, fluxo principal confiável, instalação documentada e nenhum problema crítico conhecido. |

## Contratos e testes

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

Durante o piloto fechado, a PWA usará uma credencial central do projeto para a API Responses da
OpenAI. A chave será armazenada nos secrets das Edge Functions, lida somente no backend e não será
persistida no PostgreSQL ou no Vault por pessoa. Não haverá chamada direta do navegador para a
OpenAI nem configuração BYOK na interface.

A camada de aplicação não deverá depender de conceitos exclusivos da OpenAI, como `previous_response_id`. Ela consumirá um contrato comum de provedor responsável por:

- receber as instruções, a mensagem atual e o estado necessário da conversa;
- autenticar usando a credencial central configurada para aquele provedor no backend;
- converter a resposta para o mesmo schema estruturado de turno;
- classificar erros de autenticação, limite, modelo indisponível, rede e resposta inválida;
- usar o modelo selecionado administrativamente entre os validados pela Glicia.

Provedor, modelo e credenciais não serão configuráveis pela pessoa usuária. Cada provedor manterá
sua própria credencial central no backend, sem reutilizar segredos entre serviços. Uma alteração
administrativa de provedor ou modelo será aplicada apenas à próxima refeição, nunca no meio de uma
conversa já iniciada.

Ordem preferencial de evolução:

1. API Responses da OpenAI, com modelo previamente validado e configurado no backend.
2. Registro administrativo de modelos e provedores.
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

O backend manterá uma lista curta de modelos aprovados. Provedor e modelo usados serão registrados
junto ao histórico técnico da interação para permitir diagnóstico e reprodução, sem armazenar a
chave.

Todo provedor deverá devolver os mesmos dados estruturados. A confirmação humana e o cálculo determinístico local permanecem independentes do modelo usado.

### Limites de uso e guardrails futuros

O piloto fechado começará sem quotas próprias da aplicação, classificação de intenção ou proteção
específica contra prompt injection. O risco é aceito temporariamente porque somente pessoas
próximas e aprovadas pelo autor poderão usar o sistema. Autenticação, aprovação de acesso e o
isolamento da chave no backend continuam obrigatórios; eles não serão tratados como substitutos
permanentes para controles de consumo e abuso.

Antes de ampliar o piloto, a Glicia deverá implementar e validar:

- limites diários de requisições e tokens por pessoa, além de um limite global de custo;
- limite de concorrência, suspensão administrativa e mecanismo de interrupção emergencial;
- instruções confiáveis definidas no backend e proteção contra prompt injection;
- recusa de solicitações fora da contagem de carboidratos e do fluxo previsto da Glicia;
- limites de tamanho de entrada e saída e validação do schema retornado;
- métricas de consumo, latência e falhas sem registrar refeição, glicemia ou conteúdo sensível;
- testes repetíveis de abuso, desvio de finalidade e regressão dos guardrails.

Esses controles pertencem à API e aos adaptadores de infraestrutura. O domínio continuará
responsável apenas pelas regras determinísticas, confirmação humana e travas clínicas já
existentes. O marco não introduzirá microserviços, CQRS ou event sourcing.

## Esteira de CI/CD

A `v0.9.0-alpha` evoluiu o workflow de CI e adicionou entrega contínua com GitHub Actions. Pull
requests e alterações na branch principal validam CLI, PWA, contratos, migrations, RLS e Edge
Functions antes de permitir publicação.

O fluxo implementado é:

1. **Pull request:** lint, formatação, tipos, testes Python e TypeScript, build da PWA e testes
   locais do Supabase, sem acesso a secrets de deploy.
2. **Branch principal:** repetir as verificações e, depois de aprovadas, aplicar migrations e Edge
   Functions no Supabase de staging e publicar a PWA de staging na Vercel.
3. **Produção:** promover uma versão identificada por tag por meio de um GitHub Environment
   protegido, com aprovação manual e os mesmos artefatos ou commit já validados em staging.

Tokens da Vercel, Supabase e demais serviços ficarão somente nos secrets dos GitHub Environments,
com permissões mínimas e separação entre staging e produção. Workflows originados de forks não
receberão esses segredos. Falhas interromperão a entrega antes da etapa seguinte, e migrations
deverão permanecer compatíveis com a versão anterior durante a publicação para evitar que backend
e PWA fiquem temporariamente incompatíveis.

## Decisões que antecedem a publicação pública

- Validar a compatibilidade da PWA com os navegadores móveis suportados.
- Validar migrations, RLS, Edge Functions e o modelo de ameaça para a credencial central nos secrets do backend.
- Confirmar que nenhuma chave ou dado de saúde seja incluído em logs, relatórios de erro ou backups operacionais.
- Validar a esteira de staging, a promoção protegida para produção e a ausência de secrets em
  workflows de pull requests externos.
- Definir migrações para preferências e histórico sem perda de dados.
- Definir e testar a recuperação operacional do banco em ambiente isolado, sem expor credenciais.
- Confirmar as condições para redistribuição da tabela de alimentos.
- Avaliar requisitos regulatórios e de proteção de dados antes de ampliar o uso além do piloto.

## Fora de escopo

- Integração direta com o sensor FreeStyle Libre, LibreLink ou LibreView.
- Aplicativos nativos distribuídos pela App Store ou Google Play.
- WhatsApp como interface principal da primeira PWA.
- Prescrever, escolher ou alterar parâmetros clínicos.
- Calcular insulina ativa ou substituir o plano individual.
- Automatizar aplicação de insulina ou operar bombas.
- Autenticar com uma conta OpenAI para autorizar uso de API em nome da pessoa.
- Manter importação ou exportação de dados como funcionalidade da PWA após a plataforma de conta.
- Apresentar o projeto como dispositivo médico, prontuário ou serviço de telemedicina.
