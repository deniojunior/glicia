# Arquitetura

O projeto usa uma separação pequena e explícita:

```text
CLI/Rich → cliente Responses da OpenAI → prompt + tabela SBD
                 ↓ JSON estruturado
preferências locais → tipos de domínio → cálculo determinístico → resumo
```

- `cli.py`: controla o diálogo, confirmação e travas.
- `openai_client.py`: chama a API Responses e converte a resposta estruturada.
- `prompt.py`: define instruções, schema JSON e serialização da tabela.
- `models.py`: representa tendência, refeição e turno de conversa.
- `insulin.py`: contém exclusivamente a matemática de dose.
- `config.py`: lê e valida variáveis de ambiente.
- `preferences.py`: persiste somente modo e memória alimentar confirmada.
- `ui.py`: renderiza o terminal com Rich.

A IA não calcula dose de insulina. Ela apenas extrai e explica os dados da refeição. A fórmula final é executada localmente, depois da confirmação.
