"""CLI mínima: IA coleta parâmetros; Python calcula a sugestão final."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any

from config import (
    BASAL_MORNING_UNITS,
    CORRECTION_FACTOR,
    HYPOGLYCEMIA_THRESHOLD,
    MEAL_CARBOHYDRATE_RATIOS,
    OPENAI_MODEL,
    TARGET_GLUCOSE,
    carbohydrate_ratio_for,
)
from insulin import calculate_suggested_dose
from prompt import RESPONSE_SCHEMA, build_instructions
from ui import (
    ask_user,
    console,
    show_assistant,
    show_config,
    show_dose,
    show_error,
    show_welcome,
)


ROOT = Path(__file__).parent
FOOD_TABLE = ROOT / "data" / "foods-sbd.csv"
API_URL = f"{os.getenv('OPENAI_BASE_URL', 'https://api.openai.com/v1').rstrip('/')}/responses"
AFFIRMATIVE = {"sim", "s", "confirmo", "correto", "certa", "certo", "ok"}


def output_text(payload: dict[str, Any]) -> str:
    text = payload.get("output_text")
    if isinstance(text, str):
        return text
    for item in payload.get("output", []):
        for content in item.get("content", []):
            if content.get("type") == "output_text" and isinstance(content.get("text"), str):
                return content["text"]
    raise ValueError("A OpenAI não retornou texto utilizável.")


def ask_openai(message: str, previous_response_id: str | None) -> tuple[dict[str, Any], str]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("Defina OPENAI_API_KEY antes de iniciar o aplicativo.")

    body: dict[str, Any] = {
        "model": OPENAI_MODEL,
        # Enviamos novamente porque instructions não é herdado via previous_response_id.
        "instructions": build_instructions(
            FOOD_TABLE,
            datetime.now().astimezone().strftime("%d/%m/%Y %H:%M %Z"),
            BASAL_MORNING_UNITS,
        ),
        "input": message,
        "text": {
            "format": {
                "type": "json_schema",
                "name": "glicia_turn",
                "strict": True,
                "schema": RESPONSE_SCHEMA,
            }
        },
    }
    if previous_response_id is not None:
        body["previous_response_id"] = previous_response_id

    request = urllib.request.Request(
        API_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"OpenAI retornou erro HTTP {error.code}.") from error
    except urllib.error.URLError as error:
        raise RuntimeError("Não foi possível conectar à OpenAI.") from error

    if not isinstance(payload, dict) or not isinstance(payload.get("id"), str):
        raise RuntimeError("Resposta inválida da OpenAI.")
    turn = json.loads(output_text(payload))
    if not isinstance(turn, dict):
        raise RuntimeError("A OpenAI não retornou o JSON esperado.")
    return turn, payload["id"]


def is_ready(turn: dict[str, Any]) -> bool:
    return (
        turn.get("ready_for_confirmation") is True
        and isinstance(turn.get("total_carbohydrates"), (int, float))
        and float(turn["total_carbohydrates"]) >= 0
        and isinstance(turn.get("glucose"), (int, float))
        and float(turn["glucose"]) > 0
        and isinstance(turn.get("glucose_trend"), str)
        and isinstance(turn.get("meal_type"), str)
    )


def main() -> None:
    show_welcome()
    previous_response_id: str | None = None

    while True:
        message = ask_user()
        if not message:
            continue
        if message.casefold() == "/config":
            show_config(
                model=OPENAI_MODEL,
                target_glucose=TARGET_GLUCOSE,
                correction_factor=CORRECTION_FACTOR,
                basal_morning_units=BASAL_MORNING_UNITS,
                hypoglycemia_threshold=HYPOGLYCEMIA_THRESHOLD,
                carbohydrate_ratios=MEAL_CARBOHYDRATE_RATIOS,
            )
            continue

        try:
            with console.status("[cyan]Consultando a Glicia...[/]", spinner="dots"):
                turn, previous_response_id = ask_openai(message, previous_response_id)
        except (RuntimeError, ValueError) as error:
            show_error(str(error))
            continue
        show_assistant(str(turn.get("reply", "Não consegui responder. Tente novamente.")))

        if not is_ready(turn):
            continue

        confirmation = ask_user("Dados corretos? [sim/não]").casefold()
        if confirmation not in AFFIRMATIVE:
            correction = ask_user("O que deseja corrigir?")
            if correction:
                try:
                    with console.status("[cyan]Atualizando os dados...[/]", spinner="dots"):
                        turn, previous_response_id = ask_openai(
                            f"Os dados não foram confirmados. Correção da pessoa: {correction}",
                            previous_response_id,
                        )
                    show_assistant(str(turn.get("reply", "Informe a correção novamente.")))
                except (RuntimeError, ValueError) as error:
                    show_error(str(error))
            continue

        if float(turn["glucose"]) < HYPOGLYCEMIA_THRESHOLD:
            show_error(
                f"Glicemia abaixo de {HYPOGLYCEMIA_THRESHOLD:.0f} mg/dL: "
                "não calculei sugestão de bolus. Priorize o tratamento da hipoglicemia "
                "conforme seu plano individual."
            )
            return

        meal_type = str(turn["meal_type"])
        carbohydrate_ratio = carbohydrate_ratio_for(meal_type)
        if carbohydrate_ratio is None:
            show_error(
                "A RIC da ceia não está configurada. Defina "
                "CARBOHYDRATE_RATIO_CEIA antes de calcular a sugestão."
            )
            return

        _, _, total, suggested = calculate_suggested_dose(
            glucose=float(turn["glucose"]),
            carbohydrates=float(turn["total_carbohydrates"]),
            target_glucose=TARGET_GLUCOSE,
            correction_factor=CORRECTION_FACTOR,
            carbohydrate_ratio=carbohydrate_ratio,
        )
        show_dose(
            glucose=float(turn["glucose"]),
            carbohydrates=float(turn["total_carbohydrates"]),
            trend=str(turn["glucose_trend"]),
            meal_type=meal_type,
            carbohydrate_ratio=carbohydrate_ratio,
            total=total,
            suggested=suggested,
        )
        return


if __name__ == "__main__":
    main()
