"""Leitura e validação da configuração local do aplicativo."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from glicia.models import MealType


def _number(environment: Mapping[str, str], name: str, default: str) -> float:
    try:
        return float(environment.get(name, default))
    except ValueError as error:
        raise ValueError(f"{name} deve ser um número válido.") from error


@dataclass(frozen=True)
class Settings:
    openai_model: str
    openai_base_url: str
    target_glucose: float
    correction_factor: float
    carbohydrate_ratios: dict[MealType, float]
    basal_morning_units: float
    hypoglycemia_threshold: float
    food_table_path: Path

    def carbohydrate_ratio_for(self, meal_type: MealType) -> float:
        return self.carbohydrate_ratios[meal_type]


def load_settings(environment: Mapping[str, str] | None = None) -> Settings:
    environment = os.environ if environment is None else environment
    default_table = Path(__file__).parent / "data" / "foods-sbd.csv"
    ratios = {
        MealType.BREAKFAST: _number(environment, "CARBOHYDRATE_RATIO_CAFE_DA_MANHA", "8"),
        MealType.LUNCH: _number(environment, "CARBOHYDRATE_RATIO_ALMOCO", "6"),
        MealType.AFTERNOON_SNACK: _number(environment, "CARBOHYDRATE_RATIO_CAFE_DA_TARDE", "8"),
        MealType.DINNER: _number(environment, "CARBOHYDRATE_RATIO_JANTAR", "10"),
        MealType.BEDTIME_SNACK: _number(environment, "CARBOHYDRATE_RATIO_CEIA", "8"),
    }
    settings = Settings(
        openai_model=environment.get("OPENAI_MODEL", "gpt-4o-mini"),
        openai_base_url=environment.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/"),
        target_glucose=_number(environment, "TARGET_GLUCOSE", "120"),
        correction_factor=_number(environment, "CORRECTION_FACTOR", "40"),
        carbohydrate_ratios=ratios,
        basal_morning_units=_number(environment, "BASAL_MORNING_UNITS", "28"),
        hypoglycemia_threshold=_number(environment, "HYPOGLYCEMIA_THRESHOLD", "70"),
        food_table_path=Path(environment.get("FOOD_TABLE_PATH", str(default_table))),
    )
    if settings.correction_factor <= 0 or any(ratio <= 0 for ratio in ratios.values()):
        raise ValueError("Fator de correção e RIC devem ser maiores que zero.")
    if settings.hypoglycemia_threshold <= 0:
        raise ValueError("HYPOGLYCEMIA_THRESHOLD deve ser maior que zero.")
    if not settings.food_table_path.is_file():
        raise ValueError(f"Tabela de alimentos não encontrada: {settings.food_table_path}")
    return settings
