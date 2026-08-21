# Configuração

O Glicia lê variáveis de ambiente ao iniciar. Defina-as no shell ou no ambiente seguro de execução; não versione chaves em `.env` ou arquivos de código.

```bash
export OPENAI_API_KEY="..."
export TARGET_GLUCOSE="120"
export CORRECTION_FACTOR="40"
export CARBOHYDRATE_RATIO_CAFE_DA_MANHA="8"
```

As RICs representam gramas de carboidrato cobertas por uma unidade de insulina. Todos os parâmetros clínicos devem ser definidos pela equipe que acompanha a pessoa usuária. Consulte a tabela completa no README.

`FOOD_TABLE_PATH` aceita um CSV com as colunas `Alimento`, `Medida usual`, `g ou ml` e `CHO (g)`. Linhas vazias ou sem esses valores são ignoradas.

`GLICIA_HISTORY_PATH` define o arquivo SQLite do histórico. O padrão é `~/.glicia/history.sqlite3`.

## Preferências locais

O modo, a memória alimentar e os parâmetros alterados pelo comando `/config` são armazenados em `~/.glicia/preferences.json`. O arquivo não contém glicemias, conversas ou a chave da OpenAI.

Os valores editados pelo terminal têm prioridade sobre os padrões e as variáveis de ambiente nas próximas execuções. A edição exige uma confirmação explícita e aceita apenas números finitos; RIC, fator de correção, meta e limite de hipoglicemia devem ser maiores que zero, enquanto a basal pode ser zero ou positiva.
