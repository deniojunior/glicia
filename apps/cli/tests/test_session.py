"""Testes do caso de uso conversacional da CLI."""

from collections.abc import Iterable

import pytest

from glicia.application.session import (
    CORRECTION_PREFIX,
    AiRequest,
    ConversationSession,
    InvalidSessionTransition,
    SessionState,
)
from glicia.domain.models import (
    ConversationTurn,
    FoodMemoryUpdate,
    GlucoseTrend,
    InteractionMode,
    MealType,
)


def turn(
    *,
    complete: bool,
    reply: str = "Resposta fictícia.",
    memory_updates: tuple[FoodMemoryUpdate, ...] = (),
) -> ConversationTurn:
    return ConversationTurn(
        reply=reply,
        total_carbohydrates=42 if complete else None,
        glucose=150 if complete else None,
        glucose_trend=GlucoseTrend.STABLE if complete else None,
        meal_type=MealType.LUNCH if complete else None,
        food_memory_updates=memory_updates,
    )


class FakeAiProvider:
    def __init__(self, replies: Iterable[ConversationTurn | Exception]) -> None:
        self._replies = iter(replies)
        self.requests: list[AiRequest] = []
        self.reset_count = 0

    def ask(self, request: AiRequest) -> ConversationTurn:
        self.requests.append(request)
        reply = next(self._replies)
        if isinstance(reply, Exception):
            raise reply
        return reply

    def reset(self) -> None:
        self.reset_count += 1


def test_collects_until_turn_is_complete_then_confirms() -> None:
    provider = FakeAiProvider([turn(complete=False), turn(complete=True)])
    session = ConversationSession(provider, interaction_mode=InteractionMode.PRECISE)

    session.submit("Refeição fictícia")
    assert session.snapshot.state is SessionState.COLLECTING

    completed = session.submit("150, seta estável, almoço")
    assert completed.is_complete
    assert session.snapshot.state is SessionState.AWAITING_CONFIRMATION
    assert len(provider.requests[1].history) == 1

    assert session.confirm() is completed
    assert session.snapshot.state is SessionState.CONFIRMED


def test_correction_preserves_history_and_returns_to_confirmation() -> None:
    provider = FakeAiProvider([turn(complete=True), turn(complete=True, reply="Corrigido.")])
    session = ConversationSession(provider, interaction_mode=InteractionMode.FAST)
    session.submit("Refeição fictícia")

    corrected = session.correct("O total correto é 35 g")

    assert corrected.reply == "Corrigido."
    assert provider.requests[1].message == (f"{CORRECTION_PREFIX} O total correto é 35 g")
    assert len(provider.requests[1].history) == 1
    assert session.snapshot.state is SessionState.AWAITING_CONFIRMATION


def test_memory_update_is_available_to_next_provider_request() -> None:
    provider = FakeAiProvider(
        [
            turn(
                complete=False,
                memory_updates=(FoodMemoryUpdate(" Alimento ", " preparo habitual "),),
            ),
            turn(complete=True),
        ]
    )
    session = ConversationSession(
        provider,
        interaction_mode=InteractionMode.PRECISE,
        food_memory={"outro": "preparo"},
    )

    session.submit("Primeira mensagem")
    session.submit("Segunda mensagem")

    assert dict(provider.requests[1].food_memory) == {
        "outro": "preparo",
        "alimento": "preparo habitual",
    }


def test_provider_failure_does_not_mutate_session() -> None:
    provider = FakeAiProvider([RuntimeError("falha fictícia"), turn(complete=False)])
    session = ConversationSession(provider, interaction_mode=InteractionMode.PRECISE)

    with pytest.raises(RuntimeError, match="falha fictícia"):
        session.submit("Mensagem que falha")

    assert session.snapshot.state is SessionState.READY
    assert session.snapshot.history == ()
    assert session.snapshot.current_turn is None

    session.submit("Nova tentativa")
    assert session.snapshot.state is SessionState.COLLECTING


def test_rejects_commands_in_invalid_states_and_empty_messages() -> None:
    provider = FakeAiProvider([turn(complete=True)])
    session = ConversationSession(provider, interaction_mode=InteractionMode.PRECISE)

    with pytest.raises(ValueError, match="vazia"):
        session.submit("  ")
    with pytest.raises(InvalidSessionTransition, match="correção"):
        session.correct("algo")

    session.submit("Refeição fictícia")
    with pytest.raises(InvalidSessionTransition, match="coletando"):
        session.submit("Mensagem fora de hora")

    session.confirm()
    with pytest.raises(InvalidSessionTransition, match="confirmação"):
        session.confirm()


def test_reset_starts_a_new_meal_and_preserves_preferences() -> None:
    provider = FakeAiProvider([turn(complete=True), turn(complete=False)])
    session = ConversationSession(
        provider,
        interaction_mode=InteractionMode.FAST,
        food_memory={"alimento": "preparo"},
    )
    session.submit("Primeira refeição")
    session.confirm()

    session.reset()

    snapshot = session.snapshot
    assert snapshot.state is SessionState.READY
    assert snapshot.history == ()
    assert snapshot.current_turn is None
    assert snapshot.interaction_mode is InteractionMode.FAST
    assert dict(snapshot.food_memory) == {"alimento": "preparo"}
    assert provider.reset_count == 1

    session.submit("Segunda refeição")
    assert provider.requests[1].history == ()


def test_cli_can_change_mode_during_collection_without_restarting_history() -> None:
    provider = FakeAiProvider([turn(complete=False), turn(complete=True)])
    session = ConversationSession(provider, interaction_mode=InteractionMode.PRECISE)
    session.submit("Primeira mensagem")

    session.change_interaction_mode(InteractionMode.FAST)
    session.submit("Segunda mensagem")

    assert provider.requests[1].interaction_mode is InteractionMode.FAST
    assert len(provider.requests[1].history) == 1
