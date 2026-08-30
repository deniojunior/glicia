# Como contribuir

Obrigado por contribuir. Abra uma issue antes de mudanças clínicas, de fórmula ou de prompt relevantes.

## Ambiente local

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e "apps/cli[dev]"
pre-commit install
```

Antes de abrir um pull request, execute `ruff check .`, `ruff format --check .`, `mypy` e `pytest`.

## Pull requests

- Mantenha mudanças pequenas e descreva a motivação.
- Inclua testes para comportamento novo ou corrigido.
- Não inclua chaves, dados pessoais ou leituras reais de saúde.
- Mudanças clínicas exigem referências primárias e revisão do mantenedor.
