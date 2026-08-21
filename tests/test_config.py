import pytest

from glicia.config import load_settings
from glicia.models import MealType


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
