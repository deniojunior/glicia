# Contratos de conformidade

Este pacote descreve o comportamento que deve permanecer equivalente entre a CLI Python e
a PWA TypeScript. Eles não compartilham implementação: compartilham entradas, saídas e schemas.

- `manifest.json` identifica a versão do contrato e todos os arquivos que fazem parte dela.
- `schemas/` contém JSON Schema Draft 2020-12 para dados que cruzam fronteiras da aplicação.
- `fixtures/` contém casos fictícios executados pelas suítes de cada implementação.

Uma mudança incompatível exige uma nova versão do contrato e uma justificativa explícita. Uma
mudança de interface não pode alterar silenciosamente os resultados esperados.

Nunca inclua chaves, refeições reais, glicemias reais ou dados do usuário piloto nestes arquivos.
