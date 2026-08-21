"""Preferências locais persistentes, sem dados de glicemia ou conversa."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from glicia.models import FoodMemoryUpdate, InteractionMode


def default_preferences_path() -> Path:
    return Path.home() / ".glicia" / "preferences.json"


@dataclass
class UserPreferences:
    interaction_mode: InteractionMode = InteractionMode.PRECISE
    food_memory: dict[str, str] = field(default_factory=dict)

    def remember(self, updates: tuple[FoodMemoryUpdate, ...]) -> bool:
        changed = False
        for update in updates:
            food = update.food.strip().casefold()
            preparation = update.usual_preparation.strip()
            if food and preparation and self.food_memory.get(food) != preparation:
                self.food_memory[food] = preparation
                changed = True
        return changed


class PreferenceStore:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or default_preferences_path()

    def load(self) -> UserPreferences:
        if not self.path.is_file():
            return UserPreferences()
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
            mode = InteractionMode(payload.get("interaction_mode", InteractionMode.PRECISE))
            memory = payload.get("food_memory", {})
            if not isinstance(memory, dict):
                memory = {}
            valid_memory = {
                key: value
                for key, value in memory.items()
                if isinstance(key, str) and isinstance(value, str) and key.strip() and value.strip()
            }
            return UserPreferences(mode, valid_memory)
        except (OSError, json.JSONDecodeError, ValueError):
            return UserPreferences()

    def save(self, preferences: UserPreferences) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "interaction_mode": preferences.interaction_mode.value,
            "food_memory": preferences.food_memory,
        }
        self.path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
