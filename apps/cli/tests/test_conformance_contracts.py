"""Executa os contratos compartilhados contra a implementação Python."""

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

import pytest
from jsonschema import Draft202012Validator

from glicia.config import Settings, load_settings
from glicia.domain.insulin import (
    calculate_suggested_dose,
    round_half_away_from_zero,
    trend_adjustment,
)
from glicia.domain.models import ConversationTurn, GlucoseTrend
from glicia.domain.safety import assess_bolus_safety

CONTRACTS = Path(__file__).parents[3] / "packages" / "contracts"


def load_json(relative_path: str) -> dict[str, Any]:
    with (CONTRACTS / relative_path).open(encoding="utf-8") as source:
        payload = json.load(source)
    assert isinstance(payload, dict)
    return payload


def clinical_settings(settings: Settings) -> dict[str, object]:
    return {
        "target_glucose": settings.target_glucose,
        "correction_factor": settings.correction_factor,
        "carbohydrate_ratios": {
            meal_type.value: value for meal_type, value in settings.carbohydrate_ratios.items()
        },
        "basal_morning_units": settings.basal_morning_units,
        "hypoglycemia_threshold": settings.hypoglycemia_threshold,
    }


def test_contract_manifest_references_valid_json_and_schemas() -> None:
    manifest = load_json("manifest.json")
    assert manifest["contract_version"] == 1
    for relative_path in manifest["schemas"]:
        schema = load_json(relative_path)
        Draft202012Validator.check_schema(schema)
    for relative_path in manifest["fixtures"]:
        fixture = load_json(relative_path)
        assert fixture["contract_version"] == manifest["contract_version"]


def test_dose_cases_match_python_domain() -> None:
    schema = load_json("schemas/dose-calculation.schema.json")
    validator = Draft202012Validator(schema)
    for case in load_json("fixtures/dose-cases.json")["cases"]:
        inputs = case["input"]
        calculation = calculate_suggested_dose(
            glucose=inputs["glucose"],
            carbohydrates=inputs["carbohydrates"],
            target_glucose=inputs["target_glucose"],
            correction_factor=inputs["correction_factor"],
            carbohydrate_ratio=inputs["carbohydrate_ratio"],
            trend=GlucoseTrend(inputs["trend"]),
        )
        actual = asdict(calculation)
        validator.validate(actual)
        assert actual == pytest.approx(case["expected"]), case["id"]


def test_rounding_cases_match_python_domain() -> None:
    for case in load_json("fixtures/rounding-cases.json")["cases"]:
        assert round_half_away_from_zero(case["input"]) == case["expected"], case["id"]


def test_trend_adjustment_cases_match_python_domain() -> None:
    for case in load_json("fixtures/trend-adjustment-cases.json")["cases"]:
        actual = trend_adjustment(
            GlucoseTrend(case["trend"]), correction_factor=case["correction_factor"]
        )
        assert actual == case["expected"], case["id"]


def test_safety_cases_match_python_domain() -> None:
    schema = load_json("schemas/safety-assessment.schema.json")
    validator = Draft202012Validator(schema)
    for case in load_json("fixtures/safety-cases.json")["cases"]:
        inputs = case["input"]
        assessment = assess_bolus_safety(
            glucose=inputs["glucose"],
            trend=GlucoseTrend(inputs["trend"]),
            hypoglycemia_threshold=inputs["hypoglycemia_threshold"],
        )
        actual = asdict(assessment)
        validator.validate(actual)
        assert actual == case["expected"], case["id"]


def test_valid_settings_cases_match_python_domain() -> None:
    schema = load_json("schemas/clinical-settings.schema.json")
    validator = Draft202012Validator(schema)
    for case in load_json("fixtures/settings-cases.json")["valid_cases"]:
        actual = clinical_settings(load_settings(case["environment"]))
        validator.validate(actual)
        assert actual == case["expected"], case["id"]


def test_invalid_settings_cases_are_rejected_by_python_domain() -> None:
    for case in load_json("fixtures/settings-cases.json")["invalid_cases"]:
        with pytest.raises(ValueError, match=case["error_contains"]):
            load_settings(case["environment"])


def test_turn_cases_match_python_domain() -> None:
    schema = load_json("schemas/conversation-turn.schema.json")
    validator = Draft202012Validator(schema)
    for case in load_json("fixtures/turn-cases.json")["cases"]:
        validator.validate(case["payload"])
        turn = ConversationTurn.from_response(case["payload"])
        assert turn.is_complete is case["expected_complete"], case["id"]
