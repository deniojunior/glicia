from glicia.insulin import calculate_suggested_dose
from glicia.models import GlucoseTrend


def test_calculates_base_dose_and_rounds_only_at_the_end() -> None:
    calculation = calculate_suggested_dose(
        glucose=135,
        carbohydrates=25,
        target_glucose=120,
        correction_factor=40,
        carbohydrate_ratio=8,
        trend=GlucoseTrend.STABLE,
    )
    assert calculation.correction == 0.375
    assert calculation.carbohydrate_coverage == 3.125
    assert calculation.total == 3.5
    assert calculation.suggested == 4


def test_applies_libre_trend_adjustment() -> None:
    calculation = calculate_suggested_dose(
        glucose=180,
        carbohydrates=50,
        target_glucose=100,
        correction_factor=40,
        carbohydrate_ratio=10,
        trend=GlucoseTrend.RISING_FAST,
    )
    assert calculation.trend_adjustment == 3
    assert calculation.total == 10
    assert calculation.suggested == 10


def test_never_suggests_negative_dose() -> None:
    calculation = calculate_suggested_dose(
        glucose=80,
        carbohydrates=0,
        target_glucose=120,
        correction_factor=40,
        carbohydrate_ratio=10,
        trend=GlucoseTrend.FALLING_FAST,
    )
    assert calculation.suggested == 0
