# Roadmap

Este roadmap descreve uma direção, não um compromisso de prazo. O Glicia continuará sendo um utilitário open source, local-first e configurável; não pretende se tornar um produto de decisão clínica autônoma.

## Caminho para a v1

| Versão | Foco | Critério de avanço |
| --- | --- | --- |
| `v0.1.0` | Alpha pública para desenvolvimento e testes conscientes. | Código instalável, cálculo local determinístico e documentação básica. |
| `v0.2.0` | Reforço de segurança e comunicação. | Avisos mais claros, confirmação de parâmetros clínicos e validação de entradas. |
| `v0.3.0` | Beta fechada e contingência sem IA. | Testes de fluxos completos, feedback documentado e modo manual. |
| `v0.5.0` | Estabilidade de dados e cálculo. | Configuração e histórico compatíveis, com testes de regressão. |
| `v0.9.0` / RC | Preparação de release. | CI, instalação limpa e revisão independente do cálculo e da documentação. |
| `v1.0.0` | Interface e comportamento estáveis. | Nenhum problema crítico conhecido e escopo preservado para uso pessoal e forks. |

## Integrações de IA

Hoje, o Glicia usa a API OpenAI. As integrações futuras devem seguir o princípio **traga sua própria chave** e não exigir conta no Glicia, login ou centralização de históricos.

Ordem preferencial:

1. Endpoint compatível com a API OpenAI.
2. Modo manual, sem IA, para contingência e uso totalmente local.
3. Modelos locais, como servidores executados na própria máquina.
4. Adaptadores nativos para outros provedores, conforme demanda.

Todo provedor deverá devolver os mesmos dados estruturados; a confirmação humana e o cálculo determinístico local permanecem independentes do modelo usado.

## Fora de escopo

- Prescrever ou escolher parâmetros clínicos.
- Calcular insulina ativa ou substituir o plano individual.
- Login obrigatório, backend próprio ou sincronização remota exigida.
- Apresentar o projeto como dispositivo médico, bomba de insulina, prontuário ou telemedicina.
