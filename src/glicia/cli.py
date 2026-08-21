"""Fluxo interativo do Glicia."""

from __future__ import annotations

import os

from glicia.config import load_settings
from glicia.insulin import calculate_suggested_dose
from glicia.models import GlucoseTrend, InteractionMode
from glicia.openai_client import OpenAIResponsesClient
from glicia.preferences import PreferenceStore, UserPreferences
from glicia.ui import (
    ask_user,
    console,
    show_assistant,
    show_config,
    show_dose,
    show_error,
    show_mode,
    show_mode_updated,
    show_warning,
    show_welcome,
)

AFFIRMATIVE = {"sim", "s", "confirmo", "correto", "certa", "certo", "ok"}
MODE_CHOICES = {
    "1": InteractionMode.PRECISE,
    "preciso": InteractionMode.PRECISE,
    "2": InteractionMode.FAST,
    "rapido": InteractionMode.FAST,
    "rápido": InteractionMode.FAST,
}


def _save_preferences(store: PreferenceStore, preferences: UserPreferences) -> None:
    try:
        store.save(preferences)
    except OSError:
        show_warning("Não foi possível salvar suas preferências locais nesta máquina.")


def _handle_mode_command(
    message: str, preferences: UserPreferences, store: PreferenceStore
) -> None:
    choice = message.removeprefix("/mode").strip().casefold()
    show_mode(preferences.interaction_mode)
    if not choice:
        choice = ask_user("Escolha 1 (Preciso), 2 (Rápido) ou Enter para manter").casefold()
    if not choice:
        return
    mode = MODE_CHOICES.get(choice)
    if mode is None:
        show_error("Modo inválido. Use /mode, /mode preciso ou /mode rapido.")
        return
    if preferences.interaction_mode != mode:
        preferences.interaction_mode = mode
        _save_preferences(store, preferences)
        show_mode_updated(mode)


def main() -> None:
    try:
        settings = load_settings()
    except ValueError as error:
        show_error(str(error))
        return

    show_welcome()
    preference_store = PreferenceStore()
    preferences = preference_store.load()
    client: OpenAIResponsesClient | None = None
    previous_response_id: str | None = None
    while True:
        message = ask_user()
        if not message:
            continue
        if message.casefold() == "/config":
            show_config(settings)
            continue
        if message.casefold().partition(" ")[0] == "/mode":
            _handle_mode_command(message, preferences, preference_store)
            continue
        try:
            if client is None:
                client = OpenAIResponsesClient(settings, os.getenv("OPENAI_API_KEY", ""))
            with console.status("[cyan]Consultando a Glicia...[/]", spinner="dots"):
                turn, previous_response_id = client.ask(
                    message,
                    previous_response_id,
                    interaction_mode=preferences.interaction_mode,
                    food_memory=preferences.food_memory,
                )
        except (RuntimeError, ValueError) as error:
            show_error(str(error))
            continue
        show_assistant(turn.reply)
        if preferences.remember(turn.food_memory_updates):
            _save_preferences(preference_store, preferences)
        if not turn.is_ready:
            continue

        confirmation = ask_user("Dados corretos? [sim/não]").casefold()
        if confirmation not in AFFIRMATIVE:
            correction = ask_user("O que deseja corrigir?")
            if correction:
                try:
                    with console.status("[cyan]Atualizando os dados...[/]", spinner="dots"):
                        turn, previous_response_id = client.ask(
                            f"Os dados não foram confirmados. Correção da pessoa: {correction}",
                            previous_response_id,
                            interaction_mode=preferences.interaction_mode,
                            food_memory=preferences.food_memory,
                        )
                    show_assistant(turn.reply)
                    if preferences.remember(turn.food_memory_updates):
                        _save_preferences(preference_store, preferences)
                except (RuntimeError, ValueError) as error:
                    show_error(str(error))
            continue

        assert turn.glucose is not None and turn.total_carbohydrates is not None
        assert turn.glucose_trend is not None and turn.meal_type is not None
        if turn.glucose < settings.hypoglycemia_threshold:
            show_error(
                f"Glicemia abaixo de {settings.hypoglycemia_threshold:.0f} mg/dL: não calculei sugestão de bolus. Priorize o tratamento da hipoglicemia conforme seu plano individual."
            )
            return
        calculation = calculate_suggested_dose(
            glucose=turn.glucose,
            carbohydrates=turn.total_carbohydrates,
            target_glucose=settings.target_glucose,
            correction_factor=settings.correction_factor,
            carbohydrate_ratio=settings.carbohydrate_ratio_for(turn.meal_type),
            trend=turn.glucose_trend,
        )
        if turn.glucose_trend is GlucoseTrend.FALLING_FAST and turn.glucose < 100:
            show_warning(
                "Queda rápida com glicemia abaixo de 100 mg/dL. Confirme a leitura se ela não corresponder aos seus sintomas e siga seu plano individual para prevenir hipoglicemia."
            )
        show_dose(turn, settings.carbohydrate_ratio_for(turn.meal_type), calculation)
        return
