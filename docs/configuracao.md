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

## Preferências locais

O modo e a memória alimentar são armazenados em `~/.glicia/preferences.json`. O arquivo não contém glicemias, conversas ou a chave da OpenAI.
