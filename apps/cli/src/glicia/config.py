"""Leitura e validação da configuração local da CLI."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass, replace
from math import isfinite
from pathlib import Path

from glicia.domain.models import MealType

EDITABLE_PARAMETER_LABELS = {
    "TARGET_GLUCOSE": "Glicemia-alvo (mg/dL)",
    "CORRECTION_FACTOR": "Fator de sensibilidade (mg/dL por U)",
    "BASAL_MORNING_UNITS": "Basal aplicada pela manhã (U)",
    "HYPOGLYCEMIA_THRESHOLD": "Limite de hipoglicemia (mg/dL)",
    "CARBOHYDRATE_RATIO_CAFE_DA_MANHA": "RIC — Café da manhã (g CHO por U)",
    "CARBOHYDRATE_RATIO_ALMOCO": "RIC — Almoço (g CHO por U)",
    "CARBOHYDRATE_RATIO_CAFE_DA_TARDE": "RIC — Café da tarde (g CHO por U)",
    "CARBOHYDRATE_RATIO_JANTAR": "RIC — Jantar (g CHO por U)",
    "CARBOHYDRATE_RATIO_CEIA": "RIC — Ceia (g CHO por U)",
}

RATIO_PARAMETER_MEALS = {
    "CARBOHYDRATE_RATIO_CAFE_DA_MANHA": MealType.BREAKFAST,
    "CARBOHYDRATE_RATIO_ALMOCO": MealType.LUNCH,
    "CARBOHYDRATE_RATIO_CAFE_DA_TARDE": MealType.AFTERNOON_SNACK,
    "CARBOHYDRATE_RATIO_JANTAR": MealType.DINNER,
    "CARBOHYDRATE_RATIO_CEIA": MealType.BEDTIME_SNACK,
}


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
    history_db_path: Path

    def carbohydrate_ratio_for(self, meal_type: MealType) -> float:
        return self.carbohydrate_ratios[meal_type]


def _validate(settings: Settings) -> None:
    numeric_values = [
        settings.target_glucose,
        settings.correction_factor,
        settings.basal_morning_units,
        settings.hypoglycemia_threshold,
        *settings.carbohydrate_ratios.values(),
    ]
    if not all(isfinite(value) for value in numeric_values):
        raise ValueError("Os parâmetros devem ser números finitos.")
    if settings.target_glucose <= 0:
        raise ValueError("Glicemia-alvo deve ser maior que zero.")
    if settings.correction_factor <= 0 or any(
        ratio <= 0 for ratio in settings.carbohydrate_ratios.values()
    ):
        raise ValueError("Fator de correção e RIC devem ser maiores que zero.")
    if settings.basal_morning_units < 0:
        raise ValueError("Basal aplicada pela manhã não pode ser negativa.")
    if settings.hypoglycemia_threshold <= 0:
        raise ValueError("HYPOGLYCEMIA_THRESHOLD deve ser maior que zero.")


def parameter_value(settings: Settings, parameter: str) -> float:
    if parameter == "TARGET_GLUCOSE":
        return settings.target_glucose
    if parameter == "CORRECTION_FACTOR":
        return settings.correction_factor
    if parameter == "BASAL_MORNING_UNITS":
        return settings.basal_morning_units
    if parameter == "HYPOGLYCEMIA_THRESHOLD":
        return settings.hypoglycemia_threshold
    if parameter in RATIO_PARAMETER_MEALS:
        return settings.carbohydrate_ratio_for(RATIO_PARAMETER_MEALS[parameter])
    raise ValueError("Parâmetro desconhecido.")


def with_parameter(settings: Settings, parameter: str, value: float) -> Settings:
    if parameter not in EDITABLE_PARAMETER_LABELS:
        raise ValueError("Parâmetro desconhecido.")
    if parameter in RATIO_PARAMETER_MEALS:
        ratios = settings.carbohydrate_ratios.copy()
        ratios[RATIO_PARAMETER_MEALS[parameter]] = value
        updated = replace(settings, carbohydrate_ratios=ratios)
    elif parameter == "TARGET_GLUCOSE":
        updated = replace(settings, target_glucose=value)
    elif parameter == "CORRECTION_FACTOR":
        updated = replace(settings, correction_factor=value)
    elif parameter == "BASAL_MORNING_UNITS":
        updated = replace(settings, basal_morning_units=value)
    else:
        updated = replace(settings, hypoglycemia_threshold=value)
    _validate(updated)
    return updated


def apply_parameter_overrides(settings: Settings, overrides: Mapping[str, float]) -> Settings:
    for parameter, value in overrides.items():
        settings = with_parameter(settings, parameter, value)
    return settings


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
        history_db_path=Path(
            environment.get("GLICIA_HISTORY_PATH", str(Path.home() / ".glicia" / "history.sqlite3"))
        ),
    )
    _validate(settings)
    if not settings.food_table_path.is_file():
        raise ValueError(f"Tabela de alimentos não encontrada: {settings.food_table_path}")
    return settings
