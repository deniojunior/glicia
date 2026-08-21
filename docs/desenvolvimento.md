# Desenvolvimento

## Estrutura

O código de produção fica em `src/glicia` e os testes em `tests`. Não inclua
lógica clínica na camada de terminal ou no prompt: mudanças de cálculo devem
ficar em `insulin.py`, com testes unitários e documentação atualizada.

## Rotina local

```bash
python -m pip install -e ".[dev]"
pre-commit install
ruff check .
ruff format --check .
mypy
pytest
```

## Regras para mudanças clínicas

Descreva a fonte primária, a população e as limitações. Preserve as travas
existentes ou documente claramente qualquer alteração. Nunca use a IA para
calcular a dose final e nunca adicione dados pessoais ou chaves aos testes.
