"""Apresentação da CLI baseada em Rich."""

from __future__ import annotations

from collections.abc import Iterator

from prompt_toolkit import prompt as terminal_prompt
from prompt_toolkit.completion import CompleteEvent, Completer, Completion
from prompt_toolkit.document import Document
from prompt_toolkit.formatted_text import HTML
from rich.console import Console, Group
from rich.markdown import Markdown
from rich.panel import Panel
from rich.table import Table

from glicia.config import EDITABLE_PARAMETER_LABELS, Settings, parameter_value
from glicia.domain.insulin import DoseCalculation
from glicia.domain.models import ConversationTurn, GlucoseTrend, InteractionMode, MealType

console = Console()


class GliciaCommandCompleter(Completer):
    """Completa comandos slash, inclusive o argumento de /mode."""

    commands = ("/config", "/edit", "/mode", "/quit", "/exit")
    modes = ("preciso", "rapido")

    def get_completions(
        self, document: Document, complete_event: CompleteEvent
    ) -> Iterator[Completion]:
        text = document.text_before_cursor.casefold()
        if text.startswith("/mode "):
            prefix = text.removeprefix("/mode ").rsplit(" ", maxsplit=1)[-1]
            for mode in self.modes:
                if mode.startswith(prefix):
                    yield Completion(mode, start_position=-len(prefix))
            return
        if not text.startswith("/") or " " in text:
            return
        for command in self.commands:
            if command.startswith(text):
                yield Completion(command, start_position=-len(text))


COMMAND_COMPLETER = GliciaCommandCompleter()

TREND_LABELS = {
    GlucoseTrend.RISING_FAST: "↑↑ Subindo rápido",
    GlucoseTrend.RISING: "↑ Subindo",
    GlucoseTrend.STABLE: "→ Estável",
    GlucoseTrend.FALLING: "↓ Caindo",
    GlucoseTrend.FALLING_FAST: "↓↓ Caindo rápido",
    GlucoseTrend.NOT_INFORMED: "— Tendência não informada",
}
MEAL_LABELS = {
    MealType.BREAKFAST: "Café da manhã",
    MealType.LUNCH: "Almoço",
    MealType.AFTERNOON_SNACK: "Café da tarde",
    MealType.DINNER: "Jantar",
    MealType.BEDTIME_SNACK: "Ceia",
}
MODE_LABELS = {
    InteractionMode.PRECISE: "Preciso",
    InteractionMode.FAST: "Rápido",
}


def show_welcome() -> None:
    console.print(
        Panel(
            "[bold]Descreva sua refeição, glicemia e a seta do sensor.[/]\n"
            "A IA calcula os carboidratos pela sua tabela e confirma os dados antes da sugestão.\n"
            "[dim]Use /config para ver os parâmetros ativos ou /quit para sair.[/]",
            title="[bold cyan]Glicia[/]",
            subtitle="[dim]Assistente de carboidratos e glicemia[/]",
            border_style="cyan",
        )
    )


def ask_user(label: str = "Você") -> str:
    try:
        return terminal_prompt(
            HTML(f"<ansicyan><b>{label}</b></ansicyan>: "),
            completer=COMMAND_COMPLETER,
            complete_while_typing=True,
        ).strip()
    except (EOFError, KeyboardInterrupt):
        return "/quit"


def render_assistant_reply(reply: str) -> Markdown:
    """Converte a resposta Markdown da IA em um renderizável Rich."""
    return Markdown(reply)


def show_assistant(reply: str) -> None:
    """Renderiza Markdown retornado pela IA, incluindo listas e negrito."""
    console.print(
        Panel(
            render_assistant_reply(reply), title="[bold magenta]Glicia[/]", border_style="magenta"
        )
    )


def show_error(message: str) -> None:
    console.print(Panel(message, title="[bold red]Erro[/]", border_style="red"))


def show_warning(message: str) -> None:
    console.print(Panel(message, title="[bold yellow]Atenção[/]", border_style="yellow"))


def show_confirmation_summary(turn: ConversationTurn) -> None:
    """Mostra os campos estruturados antes da confirmação, mesmo se a IA os omitir no texto."""
    assert turn.glucose is not None and turn.total_carbohydrates is not None
    assert turn.glucose_trend is not None and turn.meal_type is not None
    table = Table(show_header=False, box=None, padding=(0, 1))
    table.add_row("Carboidratos totais", f"[bold]{turn.total_carbohydrates:.1f} g[/]")
    table.add_row("Glicemia", f"[bold]{turn.glucose:.0f} mg/dL[/]")
    table.add_row("Tendência", TREND_LABELS[turn.glucose_trend])
    table.add_row("Refeição", MEAL_LABELS[turn.meal_type])
    console.print(
        Panel(table, title="[bold cyan]Dados extraídos para confirmação[/]", border_style="cyan")
    )


def show_mode(mode: InteractionMode) -> None:
    table = Table(show_header=False, box=None, padding=(0, 1))
    table.add_row("Modo atual", f"[bold]{MODE_LABELS[mode]}[/]")
    table.add_row("1 — Preciso", "Pergunta quando uma ambiguidade puder alterar o CHO.")
    table.add_row("2 — Rápido", "Estima quando houver base minimamente confiável.")
    console.print(Panel(table, title="[bold cyan]Modo de interação[/]", border_style="cyan"))


def show_mode_updated(mode: InteractionMode) -> None:
    console.print(f"[green]Modo alterado para: {MODE_LABELS[mode]}.[/]")


def show_config(settings: Settings) -> None:
    calculation = Table(show_header=False, box=None, padding=(0, 1))
    calculation.add_row("Glicemia-alvo", f"{settings.target_glucose:g} mg/dL")
    calculation.add_row("Fator de sensibilidade", f"{settings.correction_factor:g} mg/dL por U")
    calculation.add_row("Limite de hipoglicemia", f"{settings.hypoglycemia_threshold:g} mg/dL")
    basal = Table(show_header=False, box=None, padding=(0, 1))
    basal.add_row("Basal aplicada pela manhã", f"{settings.basal_morning_units:g} U")
    ratios = Table(show_header=False, box=None, padding=(0, 1))
    for meal_type, label in MEAL_LABELS.items():
        ratios.add_row(label, f"1 U : {settings.carbohydrate_ratio_for(meal_type):g} g CHO")
    technical = Table(show_header=False, box=None, padding=(0, 1))
    technical.add_row("Modelo da IA", settings.openai_model)
    technical.add_row("Tabela de alimentos", str(settings.food_table_path))
    technical.add_row("Histórico local", str(settings.history_db_path))
    content = Group(
        Panel(calculation, title="[bold]Cálculo de bolus[/]", border_style="green"),
        Panel(basal, title="[bold]Insulina basal[/]", border_style="blue"),
        Panel(
            ratios,
            title="[bold]Relação Insulina:Carboidrato (RIC)[/]",
            subtitle="gramas de carboidrato cobertos por 1 unidade de insulina",
            border_style="yellow",
        ),
        Panel(technical, title="[bold]Aplicativo[/]", border_style="dim"),
    )
    console.print(Panel(content, title="[bold cyan]Configuração ativa[/]", border_style="cyan"))
    console.print(
        "[dim]Digite /edit para alterar um parâmetro ou envie uma mensagem para voltar.[/]"
    )


def show_editable_parameters(settings: Settings) -> None:
    table = Table(show_header=True, header_style="bold cyan")
    table.add_column("#", justify="right")
    table.add_column("Parâmetro")
    table.add_column("Valor atual", justify="right")
    for number, (parameter, label) in enumerate(EDITABLE_PARAMETER_LABELS.items(), start=1):
        table.add_row(str(number), label, f"{parameter_value(settings, parameter):g}")
    console.print(Panel(table, title="[bold]Editar parâmetro[/]", border_style="cyan"))


def show_dose(
    turn: ConversationTurn, carbohydrate_ratio: float, calculation: DoseCalculation
) -> None:
    assert turn.glucose is not None and turn.total_carbohydrates is not None
    assert turn.glucose_trend is not None and turn.meal_type is not None
    table = Table(show_header=False, box=None, padding=(0, 1))
    table.add_row("Carboidratos", f"[bold]{turn.total_carbohydrates:.1f} g[/]")
    table.add_row("Glicemia", f"[bold]{turn.glucose:.0f} mg/dL[/]")
    table.add_row("Tendência", TREND_LABELS[turn.glucose_trend])
    table.add_row("Refeição", MEAL_LABELS[turn.meal_type])
    table.add_row("RIC", f"1 U : {carbohydrate_ratio:g} g CHO")
    table.add_row("Ajuste pela tendência", f"{calculation.trend_adjustment:+d} unidade(s)")
    table.add_row("Dose bruta", f"{calculation.total:.2f} unidades")
    table.add_row("[bold]Dose sugerida[/]", f"[bold green]{calculation.suggested} unidade(s)[/]")
    console.print(Panel(table, title="[bold green]Resumo confirmado[/]", border_style="green"))
    console.print("[dim]A sugestão não substitui orientação médica.[/]")


def show_history_saved(record_id: int, applied_dose: float | None) -> None:
    applied = f"{applied_dose:g} U" if applied_dose is not None else "não informada"
    console.print(
        Panel(
            f"Registro #{record_id} salvo no histórico local.\n"
            f"Insulina aplicada: [bold]{applied}[/]",
            title="[bold green]Registro salvo[/]",
            border_style="green",
        )
    )
