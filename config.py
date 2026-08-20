"""Parâmetros locais usados exclusivamente pelo cálculo determinístico."""

import os

TARGET_GLUCOSE = float(os.getenv("TARGET_GLUCOSE", "120"))
CORRECTION_FACTOR = float(os.getenv("CORRECTION_FACTOR", "40"))
# Relação insulina:carboidrato (RIC) por refeição, em gramas de CHO por 1 U.
MEAL_CARBOHYDRATE_RATIOS: dict[str, float | None] = {
    "CAFE_DA_MANHA": float(os.getenv("CARBOHYDRATE_RATIO_CAFE_DA_MANHA", "8")),
    "ALMOCO": float(os.getenv("CARBOHYDRATE_RATIO_ALMOCO", "6")),
    "CAFE_DA_TARDE": float(os.getenv("CARBOHYDRATE_RATIO_CAFE_DA_TARDE", "8")),
    "JANTAR": float(os.getenv("CARBOHYDRATE_RATIO_JANTAR", "10")),
    "CEIA": float(os.getenv("CARBOHYDRATE_RATIO_CEIA", "8")),
}
# Contexto clínico; não é somada à sugestão de correção/cobertura.
BASAL_MORNING_UNITS = float(os.getenv("BASAL_MORNING_UNITS", "28"))
HYPOGLYCEMIA_THRESHOLD = float(os.getenv("HYPOGLYCEMIA_THRESHOLD", "70"))
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")


def carbohydrate_ratio_for(meal_type: str) -> float | None:
    return MEAL_CARBOHYDRATE_RATIOS.get(meal_type)
