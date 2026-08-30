# Changelog

Todas as mudanças relevantes deste projeto serão registradas neste arquivo.

## [0.6.0-alpha] - 2026-08-30

- Backup manual local com arquivo JSON versionado contendo preferências, memória alimentar e histórico.
- Importação validada integralmente, resumo antes da confirmação e cópia automática do estado anterior.
- Credenciais continuam fora do armazenamento persistente e de todos os arquivos de backup.
- Instalação orientada no primeiro acesso: prompt nativo onde suportado e instruções específicas para Safari no iPhone.
- Schema de backup compartilhado e validação automatizada para versão futura e dados inválidos.

Leia as [notas completas da v0.6.0-alpha](docs/releases/v0.6.0-alpha.md).

## [0.5.0-alpha] - 2026-08-30

- Confirmação agora executa travas de segurança e cálculo local determinístico.
- Hipoglicemia bloqueia a sugestão; queda rápida tem aviso específico.
- Memória alimentar confirmada e histórico de refeições persistem em IndexedDB.
- Registro imutável guarda parâmetros, componentes do cálculo e dose aplicada opcional.
- Tela de Histórico para consultar refeições confirmadas.

## [0.4.0-alpha] - 2026-08-30

- Onboarding mobile retomável com chave OpenAI transitória, cinco RICs e modo de interação.
- Preferências persistidas localmente em IndexedDB, sem gravar a credencial.
- Área de Configurações para RICs, modo, modelo e chave da sessão.
- Conversa bloqueada sem chave e conectada ao adaptador OpenAI quando ela está disponível.
- Tela principal simplificada, orientada à próxima mensagem.

Leia as [notas completas da v0.4.0-alpha](docs/releases/v0.4.0-alpha.md).

## [0.3.0-alpha] - 2026-08-30

- PWA React mobile-first com manifesto, instalação e service worker.
- Conversa de vários turnos: refeição, glicemia, tendência e tipo na primeira mensagem,
  correções, confirmação e reinício local.
- Domínio TypeScript validado pelas mesmas fixtures de contrato da CLI.
- Adaptador OpenAI Responses isolado com saída JSON Schema, `store: false`, continuidade de
  contexto no adaptador e classificação de falhas recuperáveis.
- Renderização segura de Markdown nas mensagens da IA, sem interpretação de HTML bruto.
- Documentação de teste manual em celular e limitações explícitas do alpha.

Leia as [notas completas da v0.3.0-alpha](docs/releases/v0.3.0-alpha.md).

## [0.2.0-alpha] - 2026-08-30

- Reorganização do repositório como monorepo com CLI, PWA e contratos separados.
- Domínio, aplicação, clientes, persistência e apresentação da CLI desacoplados.
- Contratos versionados e fixtures de conformidade compartilháveis com TypeScript.
- Coordenador de sessão e porta neutra de IA testáveis sem terminal ou rede.
- Regras determinísticas de segurança extraídas da interface.
- Documentação de produto, arquitetura, roadmap e execução consolidada em `docs/`.
- 41 testes automatizados, incluindo conformidade e direção das dependências.

Leia as [notas completas da v0.2.0-alpha](docs/releases/v0.2.0-alpha.md).

## [0.1.0-alpha] - 2026-08-20

- CLI inicial com contagem de carboidratos via IA.
- Cálculo determinístico por RIC, glicemia, fator de correção e tendência.
- Estrutura de pacote Python, testes e automação de qualidade.
