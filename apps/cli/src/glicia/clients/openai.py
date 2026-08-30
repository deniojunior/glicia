"""Adaptador da CLI para a API Responses da OpenAI."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from datetime import datetime
from typing import Any

from glicia.application.session import AiRequest
from glicia.clients.prompt import RESPONSE_SCHEMA, build_instructions
from glicia.config import Settings
from glicia.domain.models import ConversationTurn


class OpenAIResponsesClient:
    def __init__(self, settings: Settings, api_key: str) -> None:
        if not api_key:
            raise ValueError("Defina OPENAI_API_KEY antes de iniciar o aplicativo.")
        self._settings = settings
        self._api_key = api_key
        self._url = f"{settings.openai_base_url}/responses"
        self._previous_response_id: str | None = None

    def ask(self, ai_request: AiRequest) -> ConversationTurn:
        body: dict[str, Any] = {
            "model": self._settings.openai_model,
            "instructions": build_instructions(
                self._settings.food_table_path,
                datetime.now().astimezone().strftime("%d/%m/%Y %H:%M %Z"),
                self._settings.basal_morning_units,
                ai_request.interaction_mode,
                dict(ai_request.food_memory),
            ),
            "input": ai_request.message,
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "glicia_turn",
                    "strict": True,
                    "schema": RESPONSE_SCHEMA,
                }
            },
        }
        if self._previous_response_id:
            body["previous_response_id"] = self._previous_response_id
        http_request = urllib.request.Request(
            self._url,
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(http_request, timeout=30) as response:
                payload = json.load(response)
        except urllib.error.HTTPError as error:
            raise RuntimeError(f"OpenAI retornou erro HTTP {error.code}.") from error
        except urllib.error.URLError as error:
            raise RuntimeError("Não foi possível conectar à OpenAI.") from error
        if not isinstance(payload, dict):
            raise RuntimeError("Resposta inválida da OpenAI.")
        response_id = payload.get("id")
        if not isinstance(response_id, str):
            raise RuntimeError("Resposta inválida da OpenAI.")
        turn = ConversationTurn.from_response(json.loads(_output_text(payload)))
        self._previous_response_id = response_id
        return turn

    def reset(self) -> None:
        self._previous_response_id = None


def _output_text(payload: dict[str, Any]) -> str:
    output_text = payload.get("output_text")
    if isinstance(output_text, str):
        return output_text
    output = payload.get("output")
    if not isinstance(output, list):
        raise ValueError("A OpenAI não retornou texto utilizável.")
    for item in output:
        if not isinstance(item, dict):
            continue
        contents = item.get("content")
        if not isinstance(contents, list):
            continue
        for content in contents:
            if not isinstance(content, dict):
                continue
            text = content.get("text")
            if content.get("type") == "output_text" and isinstance(text, str):
                return text
    raise ValueError("A OpenAI não retornou texto utilizável.")
