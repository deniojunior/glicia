"""Protege a direção das dependências internas da CLI Python."""

import ast
from pathlib import Path

PACKAGE_ROOT = Path(__file__).parents[1] / "src" / "glicia"
ALLOWED_IMPORTS = {
    "domain": {"domain"},
    "application": {"application", "domain"},
}


def _glicia_layer(module: str | None) -> str | None:
    if not module or not module.startswith("glicia."):
        return None
    return module.split(".", maxsplit=2)[1]


def test_inner_layers_do_not_depend_on_outer_layers() -> None:
    violations: list[str] = []

    for source_layer, allowed_layers in ALLOWED_IMPORTS.items():
        for path in (PACKAGE_ROOT / source_layer).glob("*.py"):
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom):
                    imported_layer = _glicia_layer(node.module)
                    if imported_layer and imported_layer not in allowed_layers:
                        violations.append(f"{path.relative_to(PACKAGE_ROOT)} importa {node.module}")
                elif isinstance(node, ast.Import):
                    for alias in node.names:
                        imported_layer = _glicia_layer(alias.name)
                        if imported_layer and imported_layer not in allowed_layers:
                            violations.append(
                                f"{path.relative_to(PACKAGE_ROOT)} importa {alias.name}"
                            )

    assert violations == []
