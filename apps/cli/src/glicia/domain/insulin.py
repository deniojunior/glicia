"""Cálculo determinístico de insulina, sem dependência da IA."""

from __future__ import annotations

import math
from dataclasses import dataclass

from glicia.domain.models import GlucoseTrend

TREND_ADJUSTMENTS: dict[GlucoseTrend, tuple[int, int, int, int]] = {
    # Limites conservadores configurados para o projeto: a seta rápida sobe
    # no máximo 2 U, a seta simples 1 U e as quedas reduzem no máximo 2 U.
    GlucoseTrend.RISING_FAST: (2, 2, 1, 1),
    # Regra conservadora configurada para o projeto: a seta simples nunca
    # acrescenta mais que 1 U, mesmo nas faixas de maior resistência.
    GlucoseTrend.RISING: (1, 1, 1, 0),
    GlucoseTrend.STABLE: (0, 0, 0, 0),
    GlucoseTrend.FALLING: (-1, -1, -1, 0),
    GlucoseTrend.FALLING_FAST: (-2, -2, -1, 0),
    GlucoseTrend.NOT_INFORMED: (0, 0, 0, 0),
}


@dataclass(frozen=True)
class DoseCalculation:
    correction: float
    carbohydrate_coverage: float
    trend_adjustment: int
    total: float
    suggested: int


def round_half_away_from_zero(value: float) -> int:
    return int(math.copysign(math.floor(abs(value) + 0.5), value))


def trend_adjustment(trend: GlucoseTrend, correction_factor: float) -> int:
    """Ajuste proposto para FreeStyle Libre, por faixa de FC em mg/dL/U."""
    adjustments = TREND_ADJUSTMENTS[trend]
    if correction_factor < 25:
        return adjustments[0]
    if correction_factor < 50:
        return adjustments[1]
    if correction_factor <= 75:
        return adjustments[2]
    return adjustments[3]


def calculate_suggested_dose(
    *,
    glucose: float,
    carbohydrates: float,
    target_glucose: float,
    correction_factor: float,
    carbohydrate_ratio: float,
    trend: GlucoseTrend,
) -> DoseCalculation:
    """Calcula MAX(0, Round(((glicemia - meta)/FC) + (CHO/RIC) + tendência))."""
    if glucose <= 0 or carbohydrates < 0:
        raise ValueError("Glicemia e carboidratos inválidos.")
    if correction_factor <= 0 or carbohydrate_ratio <= 0:
        raise ValueError("Fatores de insulina devem ser maiores que zero.")
    correction = (glucose - target_glucose) / correction_factor
    coverage = carbohydrates / carbohydrate_ratio
    adjustment = trend_adjustment(trend, correction_factor)
    total = correction + coverage + adjustment
    return DoseCalculation(
        correction, coverage, adjustment, total, max(0, round_half_away_from_zero(total))
    )
