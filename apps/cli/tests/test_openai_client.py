"""Testes do adaptador da OpenAI sem chamadas de rede."""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from glicia.application.session import AiRequest
from glicia.clients.openai import OpenAIResponsesClient
from glicia.config import load_settings
from glicia.domain.models import InteractionMode


class FakeResponse:
    def __init__(self, payload: Mapping[str, Any]) -> None:
        self._payload = payload

    def __enter__(self) -> FakeResponse:
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self._payload).encode("utf-8")


def request(message: str) -> AiRequest:
    return AiRequest(
        message=message,
        history=(),
        interaction_mode=InteractionMode.PRECISE,
        food_memory={},
    )


def response_payload(response_id: str) -> dict[str, object]:
    turn = {
        "reply": "Resposta fictícia.",
        "total_carbohydrates": None,
        "glucose": None,
        "glucose_trend": None,
        "meal_type": None,
        "food_memory_updates": [],
    }
    return {"id": response_id, "output_text": json.dumps(turn)}


def test_keeps_openai_response_id_inside_adapter_and_resets(monkeypatch: Any) -> None:
    sent_bodies: list[dict[str, object]] = []
    responses = iter(
        [
            FakeResponse(response_payload("resp-1")),
            FakeResponse(response_payload("resp-2")),
            FakeResponse(response_payload("resp-3")),
        ]
    )

    def fake_urlopen(http_request: Any, timeout: int) -> FakeResponse:
        assert timeout == 30
        sent_bodies.append(json.loads(http_request.data))
        return next(responses)

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    client = OpenAIResponsesClient(load_settings(), "chave-ficticia")

    client.ask(request("Primeira mensagem"))
    client.ask(request("Segunda mensagem"))
    client.reset()
    client.ask(request("Nova refeição"))

    assert "previous_response_id" not in sent_bodies[0]
    assert sent_bodies[1]["previous_response_id"] == "resp-1"
    assert "previous_response_id" not in sent_bodies[2]
