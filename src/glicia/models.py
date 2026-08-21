"""Tipos compartilhados do domínio do Glicia."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class GlucoseTrend(StrEnum):
    RISING_FAST = "SUBINDO_RAPIDO"
    RISING = "SUBINDO"
    STABLE = "ESTAVEL"
    FALLING = "CAINDO"
    FALLING_FAST = "CAINDO_RAPIDO"
    NOT_INFORMED = "NAO_INFORMADA"


class MealType(StrEnum):
    BREAKFAST = "CAFE_DA_MANHA"
    LUNCH = "ALMOCO"
    AFTERNOON_SNACK = "CAFE_DA_TARDE"
    DINNER = "JANTAR"
    BEDTIME_SNACK = "CEIA"


class InteractionMode(StrEnum):
    PRECISE = "preciso"
    FAST = "rapido"


@dataclass(frozen=True)
class FoodMemoryUpdate:
    food: str
    usual_preparation: str


@dataclass(frozen=True)
class ConversationTurn:
    reply: str
    total_carbohydrates: float | None
    glucose: float | None
    glucose_trend: GlucoseTrend | None
    meal_type: MealType | None
    ready_for_confirmation: bool
    food_memory_updates: tuple[FoodMemoryUpdate, ...]

    @classmethod
    def from_response(cls, payload: dict[str, object]) -> ConversationTurn:
        def optional_number(name: str) -> float | None:
            value = payload.get(name)
            return float(value) if isinstance(value, int | float) else None

        def optional_trend(name: str) -> GlucoseTrend | None:
            value = payload.get(name)
            return GlucoseTrend(value) if isinstance(value, str) else None

        def optional_meal(name: str) -> MealType | None:
            value = payload.get(name)
            return MealType(value) if isinstance(value, str) else None

        def memory_updates() -> tuple[FoodMemoryUpdate, ...]:
            raw_updates = payload.get("food_memory_updates")
            if not isinstance(raw_updates, list):
                return ()
            updates = []
            for item in raw_updates:
                if not isinstance(item, dict):
                    continue
                food = item.get("food")
                preparation = item.get("usual_preparation")
                if isinstance(food, str) and isinstance(preparation, str):
                    updates.append(FoodMemoryUpdate(food, preparation))
            return tuple(updates)

        return cls(
            reply=str(payload.get("reply", "Não consegui responder. Tente novamente.")),
            total_carbohydrates=optional_number("total_carbohydrates"),
            glucose=optional_number("glucose"),
            glucose_trend=optional_trend("glucose_trend"),
            meal_type=optional_meal("meal_type"),
            ready_for_confirmation=payload.get("ready_for_confirmation") is True,
            food_memory_updates=memory_updates(),
        )

    @property
    def is_ready(self) -> bool:
        return (
            self.ready_for_confirmation
            and self.total_carbohydrates is not None
            and self.total_carbohydrates >= 0
            and self.glucose is not None
            and self.glucose > 0
            and self.glucose_trend is not None
            and self.meal_type is not None
        )
