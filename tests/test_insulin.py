from glicia.insulin import calculate_suggested_dose, trend_adjustment
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
    assert calculation.trend_adjustment == 2
    assert calculation.total == 9
    assert calculation.suggested == 9


def test_caps_simple_rising_arrow_adjustment_at_one_unit() -> None:
    assert trend_adjustment(GlucoseTrend.RISING, correction_factor=20) == 1
    assert trend_adjustment(GlucoseTrend.RISING, correction_factor=40) == 1
    assert trend_adjustment(GlucoseTrend.RISING, correction_factor=60) == 1
    assert trend_adjustment(GlucoseTrend.RISING, correction_factor=80) == 0


def test_uses_conservative_caps_for_all_directional_arrows() -> None:
    assert trend_adjustment(GlucoseTrend.RISING_FAST, correction_factor=20) == 2
    assert trend_adjustment(GlucoseTrend.FALLING, correction_factor=20) == -1
    assert trend_adjustment(GlucoseTrend.FALLING_FAST, correction_factor=20) == -2


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
