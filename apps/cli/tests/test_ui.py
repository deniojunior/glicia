"""Testes da apresentação do terminal."""

from prompt_toolkit.completion import CompleteEvent
from prompt_toolkit.document import Document
from rich.markdown import Markdown

from glicia.presentation.ui import COMMAND_COMPLETER, render_assistant_reply


def test_assistant_reply_uses_rich_markdown_renderer() -> None:
    assert isinstance(render_assistant_reply("**negrito**"), Markdown)


def test_command_completer_suggests_mode_and_subcommands() -> None:
    event = CompleteEvent(completion_requested=True)
    commands = [item.text for item in COMMAND_COMPLETER.get_completions(Document("/mo"), event)]
    modes = [item.text for item in COMMAND_COMPLETER.get_completions(Document("/mode "), event)]
    assert "/mode" in commands
    assert {"preciso", "rapido"}.issubset(modes)
