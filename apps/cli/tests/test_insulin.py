"""Testes do cálculo determinístico de insulina."""

import pytest

from glicia.domain.insulin import (
    calculate_suggested_dose,
    round_half_away_from_zero,
    trend_adjustment,
)
from glicia.domain.models import GlucoseTrend


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


@pytest.mark.parametrize(
    ("trend", "expected"),
    [
        (GlucoseTrend.RISING_FAST, [2, 2, 2, 1, 1, 1]),
        (GlucoseTrend.RISING, [1, 1, 1, 1, 1, 0]),
        (GlucoseTrend.STABLE, [0, 0, 0, 0, 0, 0]),
        (GlucoseTrend.FALLING, [-1, -1, -1, -1, -1, 0]),
        (GlucoseTrend.FALLING_FAST, [-2, -2, -2, -1, -1, 0]),
        (GlucoseTrend.NOT_INFORMED, [0, 0, 0, 0, 0, 0]),
    ],
)
def test_trend_at_correction_factor_boundaries(trend: GlucoseTrend, expected: list[int]) -> None:
    factors = [24.99, 25, 49.99, 50, 75, 75.01]
    assert [trend_adjustment(trend, factor) for factor in factors] == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (0, 0),
        (0.4999, 0),
        (0.5, 1),
        (0.5001, 1),
        (2.4999, 2),
        (2.5, 3),
        (-2.4999, -2),
        (-2.5, -3),
        (-2.5001, -3),
    ],
)
def test_rounding_boundaries(value: float, expected: int) -> None:
    assert round_half_away_from_zero(value) == expected


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("glucose", 0),
        ("glucose", -1),
        ("carbohydrates", -1),
        ("correction_factor", 0),
        ("correction_factor", -1),
        ("carbohydrate_ratio", 0),
        ("carbohydrate_ratio", -1),
    ],
)
def test_rejects_invalid_calculation_inputs(field: str, value: float) -> None:
    values = dict(
        glucose=120.0,
        carbohydrates=40.0,
        target_glucose=120.0,
        correction_factor=40.0,
        carbohydrate_ratio=10.0,
    )
    values[field] = value
    with pytest.raises(ValueError):
        calculate_suggested_dose(**values, trend=GlucoseTrend.STABLE)
