"""Histórico local de refeições confirmadas, armazenado em SQLite."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from glicia.config import Settings
from glicia.insulin import DoseCalculation
from glicia.models import ConversationTurn, InteractionMode


@dataclass(frozen=True)
class MealRecord:
    created_at: str
    meal_input: str
    assistant_summary: str
    interaction_mode: str
    meal_type: str
    carbohydrates: float
    glucose: float
    glucose_trend: str
    target_glucose: float
    correction_factor: float
    carbohydrate_ratio: float
    basal_morning_units: float
    correction_dose: float
    carbohydrate_dose: float
    trend_adjustment: int
    calculated_dose: float
    suggested_dose: int
    applied_dose: float | None

    @classmethod
    def from_calculation(
        cls,
        *,
        turn: ConversationTurn,
        meal_input: str,
        settings: Settings,
        interaction_mode: InteractionMode,
        carbohydrate_ratio: float,
        calculation: DoseCalculation,
        applied_dose: float | None,
    ) -> MealRecord:
        assert turn.glucose is not None and turn.total_carbohydrates is not None
        assert turn.glucose_trend is not None and turn.meal_type is not None
        return cls(
            created_at=datetime.now().astimezone().isoformat(timespec="seconds"),
            meal_input=meal_input,
            assistant_summary=turn.reply,
            interaction_mode=interaction_mode.value,
            meal_type=turn.meal_type.value,
            carbohydrates=turn.total_carbohydrates,
            glucose=turn.glucose,
            glucose_trend=turn.glucose_trend.value,
            target_glucose=settings.target_glucose,
            correction_factor=settings.correction_factor,
            carbohydrate_ratio=carbohydrate_ratio,
            basal_morning_units=settings.basal_morning_units,
            correction_dose=calculation.correction,
            carbohydrate_dose=calculation.carbohydrate_coverage,
            trend_adjustment=calculation.trend_adjustment,
            calculated_dose=calculation.total,
            suggested_dose=calculation.suggested,
            applied_dose=applied_dose,
        )


class HistoryStore:
    def __init__(self, path: Path) -> None:
        self.path = path

    def save(self, record: MealRecord) -> int:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self.path) as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS meal_records (
                    id INTEGER PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    meal_input TEXT NOT NULL,
                    assistant_summary TEXT NOT NULL,
                    interaction_mode TEXT NOT NULL,
                    meal_type TEXT NOT NULL,
                    carbohydrates REAL NOT NULL,
                    glucose REAL NOT NULL,
                    glucose_trend TEXT NOT NULL,
                    target_glucose REAL NOT NULL,
                    correction_factor REAL NOT NULL,
                    carbohydrate_ratio REAL NOT NULL,
                    basal_morning_units REAL NOT NULL,
                    correction_dose REAL NOT NULL,
                    carbohydrate_dose REAL NOT NULL,
                    trend_adjustment INTEGER NOT NULL,
                    calculated_dose REAL NOT NULL,
                    suggested_dose INTEGER NOT NULL,
                    applied_dose REAL
                )
                """
            )
            cursor = connection.execute(
                """
                INSERT INTO meal_records (
                    created_at, meal_input, assistant_summary, interaction_mode, meal_type,
                    carbohydrates, glucose, glucose_trend, target_glucose, correction_factor,
                    carbohydrate_ratio, basal_morning_units, correction_dose, carbohydrate_dose,
                    trend_adjustment, calculated_dose, suggested_dose, applied_dose
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record.created_at,
                    record.meal_input,
                    record.assistant_summary,
                    record.interaction_mode,
                    record.meal_type,
                    record.carbohydrates,
                    record.glucose,
                    record.glucose_trend,
                    record.target_glucose,
                    record.correction_factor,
                    record.carbohydrate_ratio,
                    record.basal_morning_units,
                    record.correction_dose,
                    record.carbohydrate_dose,
                    record.trend_adjustment,
                    record.calculated_dose,
                    record.suggested_dose,
                    record.applied_dose,
                ),
            )
        if cursor.lastrowid is None:
            raise RuntimeError("O histórico não retornou o identificador do registro.")
        return cursor.lastrowid
