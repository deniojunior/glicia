# Testes dos cálculos locais

Os testes verificam as regras implementadas no projeto, sem chamadas de IA ou acesso ao banco.
CLI e PWA executam os mesmos casos em `packages/contracts/fixtures/` para detectar diferenças
entre Python e TypeScript. Os valores esperados são fixados nos testes, sem reutilizar a fórmula
de produção para calcular o resultado esperado.

A cobertura inclui correção positiva e negativa, cobertura alimentar por RIC, ausência de
carboidratos, ajuste das seis tendências nos limites de FC 25, 50 e 75, arredondamento somente
ao final, sugestão mínima de zero e rejeição de entradas negativas ou divisores nulos.

Na PWA, os testes da decisão de refeição conferem os cinco RICs personalizados, meta e fator
de correção, independência da basal e bloqueio de dados incompletos. Os testes de segurança
conferem o limite personalizado de hipoglicemia e o aviso de queda rápida abaixo de 100,
incluindo os valores imediatamente antes e no limite.

Para executar a partir da raiz:

```sh
pytest apps/cli/tests/test_insulin.py apps/cli/tests/test_safety.py apps/cli/tests/test_conformance_contracts.py
npm --prefix apps/pwa test -- src/domain/ src/application/meal-decision.test.ts
```

A CI já executa essas suítes. A busca e a proporção de carboidratos feitas pela IA são avaliadas
separadamente nos [evals SBD](evals-sbd.md).
