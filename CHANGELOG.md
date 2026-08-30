# Changelog

Todas as mudanças relevantes deste projeto serão registradas neste arquivo.

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
