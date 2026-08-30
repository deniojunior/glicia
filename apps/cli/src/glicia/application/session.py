"""Coordena o fluxo conversacional sem depender de terminal ou provedor."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from types import MappingProxyType
from typing import Protocol

from glicia.domain.models import ConversationTurn, InteractionMode, merge_food_memory

CORRECTION_PREFIX = "Os dados não foram confirmados. Correção da pessoa:"


class SessionState(StrEnum):
    READY = "ready"
    COLLECTING = "collecting"
    AWAITING_CONFIRMATION = "awaiting_confirmation"
    CONFIRMED = "confirmed"


@dataclass(frozen=True)
class ConversationExchange:
    user_message: str
    assistant_turn: ConversationTurn


@dataclass(frozen=True)
class AiRequest:
    message: str
    history: tuple[ConversationExchange, ...]
    interaction_mode: InteractionMode
    food_memory: Mapping[str, str]


class AiProvider(Protocol):
    """Porta dirigida implementada pelo provedor real ou por um fake de testes."""

    def ask(self, request: AiRequest) -> ConversationTurn: ...

    def reset(self) -> None: ...


@dataclass(frozen=True)
class SessionSnapshot:
    state: SessionState
    history: tuple[ConversationExchange, ...]
    current_turn: ConversationTurn | None
    interaction_mode: InteractionMode
    food_memory: Mapping[str, str]


class InvalidSessionTransition(RuntimeError):
    pass


class ConversationSession:
    """Caso de uso que coleta e confirma os dados de uma refeição."""

    def __init__(
        self,
        provider: AiProvider,
        *,
        interaction_mode: InteractionMode,
        food_memory: Mapping[str, str] | None = None,
    ) -> None:
        self._provider = provider
        self._interaction_mode = interaction_mode
        self._food_memory = dict(food_memory or {})
        self._state = SessionState.READY
        self._history: list[ConversationExchange] = []
        self._current_turn: ConversationTurn | None = None

    @property
    def snapshot(self) -> SessionSnapshot:
        return SessionSnapshot(
            state=self._state,
            history=tuple(self._history),
            current_turn=self._current_turn,
            interaction_mode=self._interaction_mode,
            food_memory=MappingProxyType(self._food_memory.copy()),
        )

    def submit(self, message: str) -> ConversationTurn:
        if self._state not in {SessionState.READY, SessionState.COLLECTING}:
            raise InvalidSessionTransition("A sessão não está coletando dados.")
        return self._send(message)

    def correct(self, correction: str) -> ConversationTurn:
        if self._state is not SessionState.AWAITING_CONFIRMATION:
            raise InvalidSessionTransition("Não há dados aguardando correção.")
        return self._send(f"{CORRECTION_PREFIX} {self._required_message(correction)}")

    def confirm(self) -> ConversationTurn:
        if self._state is not SessionState.AWAITING_CONFIRMATION or self._current_turn is None:
            raise InvalidSessionTransition("Não há dados completos aguardando confirmação.")
        self._state = SessionState.CONFIRMED
        return self._current_turn

    def change_interaction_mode(self, mode: InteractionMode) -> None:
        """Mantém compatibilidade com a CLI enquanto a PWA bloqueará a troca por refeição."""
        self._interaction_mode = mode

    def reset(self) -> None:
        self._provider.reset()
        self._state = SessionState.READY
        self._history.clear()
        self._current_turn = None

    def _send(self, message: str) -> ConversationTurn:
        normalized_message = self._required_message(message)
        request = AiRequest(
            message=normalized_message,
            history=tuple(self._history),
            interaction_mode=self._interaction_mode,
            food_memory=MappingProxyType(self._food_memory.copy()),
        )
        turn = self._provider.ask(request)

        self._history.append(ConversationExchange(normalized_message, turn))
        self._current_turn = turn
        self._food_memory = merge_food_memory(self._food_memory, turn.food_memory_updates)
        self._state = (
            SessionState.AWAITING_CONFIRMATION if turn.is_complete else SessionState.COLLECTING
        )
        return turn

    @staticmethod
    def _required_message(message: str) -> str:
        normalized = message.strip()
        if not normalized:
            raise ValueError("A mensagem não pode estar vazia.")
        return normalized
