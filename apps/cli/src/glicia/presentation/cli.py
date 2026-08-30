"""Fluxo interativo da CLI Glicia."""

from __future__ import annotations

import os
import sqlite3
from math import isfinite

from glicia.application.session import ConversationSession, InvalidSessionTransition
from glicia.clients.openai import OpenAIResponsesClient
from glicia.config import (
    EDITABLE_PARAMETER_LABELS,
    Settings,
    apply_parameter_overrides,
    load_settings,
    parameter_value,
    with_parameter,
)
from glicia.domain.insulin import calculate_suggested_dose
from glicia.domain.models import InteractionMode
from glicia.domain.safety import assess_bolus_safety
from glicia.persistence.history import HistoryStore, MealRecord
from glicia.persistence.preferences import PreferenceStore, UserPreferences
from glicia.presentation.ui import (
    ask_user,
    console,
    show_assistant,
    show_config,
    show_confirmation_summary,
    show_dose,
    show_editable_parameters,
    show_error,
    show_history_saved,
    show_mode,
    show_mode_updated,
    show_warning,
    show_welcome,
)

AFFIRMATIVE = {"sim", "s", "confirmo", "correto", "certa", "certo", "ok"}
CONFUSION = {"nao entendi", "não entendi", "nao sei", "não sei", "ajuda"}
MODE_CHOICES = {
    "1": InteractionMode.PRECISE,
    "preciso": InteractionMode.PRECISE,
    "2": InteractionMode.FAST,
    "rapido": InteractionMode.FAST,
    "rápido": InteractionMode.FAST,
}
CONFIG_CHOICES = dict(enumerate(EDITABLE_PARAMETER_LABELS, start=1))


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


def _handle_edit_command(
    settings: Settings, preferences: UserPreferences, store: PreferenceStore
) -> Settings:
    show_config(settings)
    show_editable_parameters(settings)
    choice = ask_user("Digite o número para editar ou Enter para voltar")
    if not choice:
        return settings
    try:
        parameter = CONFIG_CHOICES[int(choice)]
    except (KeyError, ValueError):
        show_error("Opção inválida. Use um dos números exibidos.")
        return settings
    label = EDITABLE_PARAMETER_LABELS[parameter]
    current = parameter_value(settings, parameter)
    raw_value = ask_user(f"Novo valor para {label} (atual: {current:g})")
    try:
        value = float(raw_value.replace(",", "."))
        updated = with_parameter(settings, parameter, value)
    except ValueError as error:
        show_error(str(error))
        return settings
    confirmation = ask_user(
        f"Confirmar {label}: {current:g} → {parameter_value(updated, parameter):g}? [sim/não]"
    ).casefold()
    if confirmation not in AFFIRMATIVE:
        show_warning("Alteração cancelada.")
        return settings
    preferences.parameter_overrides[parameter] = value
    _save_preferences(store, preferences)
    show_assistant(f"**{label}** atualizado para **{value:g}**.")
    return updated


def _ask_applied_dose() -> tuple[float | None, bool]:
    while True:
        raw_value = ask_user("Quantidade de insulina aplicada (U; Enter se não informou ainda)")
        if raw_value.casefold() in {"/quit", "/exit"}:
            return None, True
        if not raw_value:
            return None, False
        try:
            applied_dose = float(raw_value.replace(",", "."))
        except ValueError:
            show_error("Informe uma quantidade numérica em unidades ou pressione Enter.")
            continue
        if not isfinite(applied_dose) or applied_dose < 0:
            show_error("A quantidade aplicada deve ser um número finito maior ou igual a zero.")
            continue
        return applied_dose, False


def main() -> None:
    preference_store = PreferenceStore()
    preferences = preference_store.load()
    try:
        settings = apply_parameter_overrides(load_settings(), preferences.parameter_overrides)
    except ValueError as error:
        show_error(str(error))
        return

    show_welcome()
    history_store = HistoryStore(settings.history_db_path)
    client: OpenAIResponsesClient | None = None
    session: ConversationSession | None = None
    in_config_context = False
    while True:
        message = ask_user()
        if not message:
            continue
        if message.casefold() in {"/quit", "/exit"}:
            show_assistant("Até logo.")
            return
        if message.casefold() == "/config":
            in_config_context = True
            show_config(settings)
            continue
        if message.casefold() == "/edit":
            if not in_config_context:
                show_error("Abra /config antes de usar /edit.")
                continue
            settings = _handle_edit_command(settings, preferences, preference_store)
            continue
        if message.casefold().partition(" ")[0] == "/mode":
            _handle_mode_command(message, preferences, preference_store)
            if session is not None:
                session.change_interaction_mode(preferences.interaction_mode)
            continue
        in_config_context = False
        try:
            if client is None:
                client = OpenAIResponsesClient(settings, os.getenv("OPENAI_API_KEY", ""))
            if session is None:
                session = ConversationSession(
                    client,
                    interaction_mode=preferences.interaction_mode,
                    food_memory=preferences.food_memory,
                )
            with console.status("[cyan]Consultando a Glicia...[/]", spinner="dots"):
                turn = session.submit(message)
        except (InvalidSessionTransition, RuntimeError, ValueError) as error:
            show_error(str(error))
            continue
        show_assistant(turn.reply)
        if preferences.remember(turn.food_memory_updates):
            _save_preferences(preference_store, preferences)
        if not turn.is_complete:
            continue

        confirmed = False
        while turn.is_complete:
            show_confirmation_summary(turn)
            confirmation = ask_user("Dados corretos? [sim/não]").casefold()
            if confirmation in AFFIRMATIVE:
                turn = session.confirm()
                confirmed = True
                break
            if confirmation in CONFUSION:
                show_assistant(
                    "Confira o resumo acima. Responda **sim** para confirmar ou informe o que deseja corrigir."
                )
                continue
            correction = ask_user("O que deseja corrigir?")
            if not correction:
                continue
            try:
                with console.status("[cyan]Atualizando os dados...[/]", spinner="dots"):
                    turn = session.correct(correction)
                show_assistant(turn.reply)
                if preferences.remember(turn.food_memory_updates):
                    _save_preferences(preference_store, preferences)
            except (RuntimeError, ValueError) as error:
                show_error(str(error))
                continue
        if not confirmed:
            continue

        assert turn.glucose is not None and turn.total_carbohydrates is not None
        assert turn.glucose_trend is not None and turn.meal_type is not None
        safety = assess_bolus_safety(
            glucose=turn.glucose,
            trend=turn.glucose_trend,
            hypoglycemia_threshold=settings.hypoglycemia_threshold,
        )
        if safety.bolus_blocked:
            show_error(
                f"Glicemia abaixo de {settings.hypoglycemia_threshold:.0f} mg/dL: não calculei sugestão de bolus. Priorize o tratamento da hipoglicemia conforme seu plano individual."
            )
            session.reset()
            continue
        calculation = calculate_suggested_dose(
            glucose=turn.glucose,
            carbohydrates=turn.total_carbohydrates,
            target_glucose=settings.target_glucose,
            correction_factor=settings.correction_factor,
            carbohydrate_ratio=settings.carbohydrate_ratio_for(turn.meal_type),
            trend=turn.glucose_trend,
        )
        if safety.rapid_fall_warning:
            show_warning(
                "Queda rápida com glicemia abaixo de 100 mg/dL. Confirme a leitura se ela não corresponder aos seus sintomas e siga seu plano individual para prevenir hipoglicemia."
            )
        carbohydrate_ratio = settings.carbohydrate_ratio_for(turn.meal_type)
        show_dose(turn, carbohydrate_ratio, calculation)
        applied_dose, quit_requested = _ask_applied_dose()
        try:
            record_id = history_store.save(
                MealRecord.from_calculation(
                    turn=turn,
                    meal_input=message,
                    settings=settings,
                    interaction_mode=preferences.interaction_mode,
                    carbohydrate_ratio=carbohydrate_ratio,
                    calculation=calculation,
                    applied_dose=applied_dose,
                )
            )
            show_history_saved(record_id, applied_dose)
        except (OSError, RuntimeError, ValueError, sqlite3.Error) as error:
            show_error(f"Não foi possível salvar o registro no histórico: {error}")
        if quit_requested:
            show_assistant("Até logo.")
            return
        session.reset()
