"""Testes da configuração da CLI."""

import pytest

from glicia.config import apply_parameter_overrides, load_settings, parameter_value
from glicia.domain.models import MealType


def test_loads_default_ratios() -> None:
    settings = load_settings()
    assert settings.carbohydrate_ratio_for(MealType.BREAKFAST) == 8
    assert settings.carbohydrate_ratio_for(MealType.LUNCH) == 6
    assert settings.carbohydrate_ratio_for(MealType.AFTERNOON_SNACK) == 8
    assert settings.carbohydrate_ratio_for(MealType.DINNER) == 10
    assert settings.carbohydrate_ratio_for(MealType.BEDTIME_SNACK) == 8


def test_rejects_invalid_correction_factor() -> None:
    with pytest.raises(ValueError, match="Fator de correção"):
        load_settings({"CORRECTION_FACTOR": "0"})


def test_applies_persisted_parameter_override() -> None:
    settings = apply_parameter_overrides(load_settings(), {"TARGET_GLUCOSE": 105})
    assert parameter_value(settings, "TARGET_GLUCOSE") == 105
