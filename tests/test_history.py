import sqlite3
from pathlib import Path

from glicia.config import load_settings
from glicia.history import HistoryStore, MealRecord
from glicia.insulin import calculate_suggested_dose
from glicia.models import ConversationTurn, GlucoseTrend, InteractionMode, MealType


def test_saves_confirmed_meal_record(tmp_path: Path) -> None:
    settings = load_settings()
    turn = ConversationTurn(
        reply="Resumo da refeição",
        total_carbohydrates=50,
        glucose=180,
        glucose_trend=GlucoseTrend.STABLE,
        meal_type=MealType.DINNER,
        food_memory_updates=(),
    )
    calculation = calculate_suggested_dose(
        glucose=180,
        carbohydrates=50,
        target_glucose=settings.target_glucose,
        correction_factor=settings.correction_factor,
        carbohydrate_ratio=10,
        trend=GlucoseTrend.STABLE,
    )
    store = HistoryStore(tmp_path / "history.sqlite3")
    record_id = store.save(
        MealRecord.from_calculation(
            turn=turn,
            meal_input="Vou jantar arroz.",
            settings=settings,
            interaction_mode=InteractionMode.PRECISE,
            carbohydrate_ratio=10,
            calculation=calculation,
            applied_dose=7,
        )
    )

    with sqlite3.connect(store.path) as connection:
        row = connection.execute(
            "SELECT carbohydrates, glucose, suggested_dose, applied_dose FROM meal_records WHERE id = ?",
            (record_id,),
        ).fetchone()
    assert row == (50.0, 180.0, calculation.suggested, 7.0)
