"""Cálculo de insulina sem dependência da IA."""

from __future__ import annotations

import math


def round_half_away_from_zero(value: float) -> int:
    return int(math.copysign(math.floor(abs(value) + 0.5), value))


def calculate_suggested_dose(
    glucose: float,
    carbohydrates: float,
    target_glucose: float,
    correction_factor: float,
    carbohydrate_ratio: float,
) -> tuple[float, float, float, int]:
    """Return correction, carbohydrate, total and rounded suggested dose."""
    if glucose <= 0 or carbohydrates < 0:
        raise ValueError("Glicemia e carboidratos inválidos.")
    if correction_factor <= 0 or carbohydrate_ratio <= 0:
        raise ValueError("Fatores de insulina devem ser maiores que zero.")

    correction = (glucose - target_glucose) / correction_factor
    carbohydrate = carbohydrates / carbohydrate_ratio
    total = correction + carbohydrate
    return correction, carbohydrate, total, round_half_away_from_zero(total)
