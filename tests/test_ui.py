from rich.markdown import Markdown

from glicia.ui import render_assistant_reply


def test_assistant_reply_uses_rich_markdown_renderer() -> None:
    assert isinstance(render_assistant_reply("**negrito**"), Markdown)
