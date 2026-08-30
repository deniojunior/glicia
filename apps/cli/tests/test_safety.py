"""Testes das travas determinísticas de segurança."""

import pytest

from glicia.domain.models import GlucoseTrend
from glicia.domain.safety import assess_bolus_safety


@pytest.mark.parametrize("glucose", [0, -1, float("inf"), float("nan")])
def test_rejects_invalid_glucose(glucose: float) -> None:
    with pytest.raises(ValueError, match="Glicemia"):
        assess_bolus_safety(
            glucose=glucose,
            trend=GlucoseTrend.STABLE,
            hypoglycemia_threshold=70,
        )


@pytest.mark.parametrize("threshold", [0, -1, float("inf"), float("nan")])
def test_rejects_invalid_hypoglycemia_threshold(threshold: float) -> None:
    with pytest.raises(ValueError, match="Limite de hipoglicemia"):
        assess_bolus_safety(
            glucose=100,
            trend=GlucoseTrend.STABLE,
            hypoglycemia_threshold=threshold,
        )
