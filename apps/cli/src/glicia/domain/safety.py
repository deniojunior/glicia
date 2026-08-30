"""Regras determinísticas para decidir se o cálculo pode prosseguir."""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite

from glicia.domain.models import GlucoseTrend


@dataclass(frozen=True)
class SafetyAssessment:
    bolus_blocked: bool
    rapid_fall_warning: bool


def assess_bolus_safety(
    *, glucose: float, trend: GlucoseTrend, hypoglycemia_threshold: float
) -> SafetyAssessment:
    """Avalia as travas que antecedem o cálculo, sem produzir texto de interface."""
    if not isfinite(glucose) or glucose <= 0:
        raise ValueError("Glicemia deve ser um número finito maior que zero.")
    if not isfinite(hypoglycemia_threshold) or hypoglycemia_threshold <= 0:
        raise ValueError("Limite de hipoglicemia deve ser um número finito maior que zero.")

    bolus_blocked = glucose < hypoglycemia_threshold
    return SafetyAssessment(
        bolus_blocked=bolus_blocked,
        rapid_fall_warning=(
            not bolus_blocked and trend is GlucoseTrend.FALLING_FAST and glucose < 100
        ),
    )
