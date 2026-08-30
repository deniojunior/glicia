"""Testes do prompt e da leitura da tabela nutricional."""

from pathlib import Path

import pytest

from glicia.clients.prompt import build_instructions, load_food_table
from glicia.domain.models import InteractionMode


def test_loads_only_fields_used_by_prompt(tmp_path: Path) -> None:
    table = tmp_path / "foods.csv"
    table.write_text(
        "Alimento,Medida usual,g ou ml,CHO (g),Calorias (kcal)\nPão,1 unidade,50,29,135\n",
        encoding="utf-8",
    )
    assert load_food_table(table) == "Pão | medida: 1 unidade | referência: 50 g/ml | CHO: 29 g"


def test_rejects_table_without_required_columns(tmp_path: Path) -> None:
    table = tmp_path / "foods.csv"
    table.write_text("Alimento,CHO (g)\nPão,29\n", encoding="utf-8")
    with pytest.raises(ValueError, match="colunas esperadas"):
        load_food_table(table)


def test_instructions_include_selected_mode_and_food_memory(tmp_path: Path) -> None:
    table = tmp_path / "foods.csv"
    table.write_text(
        "Alimento,Medida usual,g ou ml,CHO (g)\nFeijão carioquinha,1 colher,20,4\n",
        encoding="utf-8",
    )
    instructions = build_instructions(
        table,
        "20/08/2026 10:00 BRT",
        28,
        InteractionMode.FAST,
        {"feijão": "carioquinha"},
    )
    assert "MODO RÁPIDO" in instructions
    assert '"feijão": "carioquinha"' in instructions
