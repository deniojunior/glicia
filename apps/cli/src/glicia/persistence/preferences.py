"""Preferências persistentes da CLI, sem dados de glicemia ou conversa."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from glicia.config import EDITABLE_PARAMETER_LABELS
from glicia.domain.models import FoodMemoryUpdate, InteractionMode, merge_food_memory


def default_preferences_path() -> Path:
    return Path.home() / ".glicia" / "preferences.json"


@dataclass
class UserPreferences:
    interaction_mode: InteractionMode = InteractionMode.PRECISE
    food_memory: dict[str, str] = field(default_factory=dict)
    parameter_overrides: dict[str, float] = field(default_factory=dict)

    def remember(self, updates: tuple[FoodMemoryUpdate, ...]) -> bool:
        updated = merge_food_memory(self.food_memory, updates)
        if updated == self.food_memory:
            return False
        self.food_memory = updated
        return True


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
            overrides = payload.get("parameter_overrides", {})
            if not isinstance(overrides, dict):
                overrides = {}
            valid_overrides = {
                key: float(value)
                for key, value in overrides.items()
                if key in EDITABLE_PARAMETER_LABELS and isinstance(value, int | float)
            }
            return UserPreferences(mode, valid_memory, valid_overrides)
        except (OSError, json.JSONDecodeError, ValueError):
            return UserPreferences()

    def save(self, preferences: UserPreferences) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "interaction_mode": preferences.interaction_mode.value,
            "food_memory": preferences.food_memory,
            "parameter_overrides": preferences.parameter_overrides,
        }
        self.path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
