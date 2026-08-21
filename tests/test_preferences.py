from pathlib import Path

from glicia.models import FoodMemoryUpdate, InteractionMode
from glicia.preferences import PreferenceStore, UserPreferences


def test_persists_mode_and_food_memory(tmp_path: Path) -> None:
    store = PreferenceStore(tmp_path / "preferences.json")
    preferences = UserPreferences(interaction_mode=InteractionMode.FAST)
    assert preferences.remember((FoodMemoryUpdate("Feijão", "carioquinha"),))
    store.save(preferences)

    loaded = store.load()
    assert loaded.interaction_mode is InteractionMode.FAST
    assert loaded.food_memory == {"feijão": "carioquinha"}


def test_memory_does_not_change_when_value_is_identical() -> None:
    preferences = UserPreferences(food_memory={"feijão": "carioquinha"})
    assert not preferences.remember((FoodMemoryUpdate("feijão", "carioquinha"),))
