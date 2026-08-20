"""Pequena camada visual do terminal, baseada em Rich."""

from __future__ import annotations

from rich.console import Console, Group
from rich.panel import Panel
from rich.prompt import Prompt
from rich.table import Table


console = Console()

TREND_LABELS = {
    "SUBINDO_RAPIDO": "↑↑ Subindo rápido",
    "SUBINDO": "↑ Subindo",
    "ESTAVEL": "→ Estável",
    "CAINDO": "↓ Caindo",
    "CAINDO_RAPIDO": "↓↓ Caindo rápido",
    "NAO_INFORMADA": "— Tendência não informada",
}

MEAL_LABELS = {
    "CAFE_DA_MANHA": "Café da manhã",
    "ALMOCO": "Almoço",
    "CAFE_DA_TARDE": "Café da tarde",
    "JANTAR": "Jantar",
    "CEIA": "Ceia",
}


def show_welcome() -> None:
    console.print(
        Panel(
            "[bold]Descreva sua refeição, glicemia e a seta do sensor.[/]\n"
            "A IA calcula os carboidratos pela sua tabela e confirma os dados antes da sugestão.\n"
            "[dim]Use /config para ver os parâmetros ativos.[/]",
            title="[bold cyan]Glicia[/]",
            subtitle="[dim]Assistente de carboidratos e glicemia[/]",
            border_style="cyan",
        )
    )


def ask_user(label: str = "Você") -> str:
    return Prompt.ask(f"[bold cyan]{label}[/]").strip()


def show_assistant(reply: str) -> None:
    console.print(Panel(reply, title="[bold magenta]Glicia[/]", border_style="magenta"))


def show_error(message: str) -> None:
    console.print(Panel(message, title="[bold red]Erro[/]", border_style="red"))


def show_config(
    *,
    model: str,
    target_glucose: float,
    correction_factor: float,
    basal_morning_units: float,
    hypoglycemia_threshold: float,
    carbohydrate_ratios: dict[str, float | None],
) -> None:
    """Exibe somente a configuração clínica e técnica não sensível em uso."""
    calculation = Table(show_header=False, box=None, padding=(0, 1))
    calculation.add_row("Glicemia-alvo", f"{target_glucose:g} mg/dL")
    calculation.add_row("Fator de sensibilidade", f"{correction_factor:g} mg/dL por U")
    calculation.add_row("Limite de hipoglicemia", f"{hypoglycemia_threshold:g} mg/dL")

    basal = Table(show_header=False, box=None, padding=(0, 1))
    basal.add_row("Basal aplicada pela manhã", f"{basal_morning_units:g} U")

    ratios = Table(show_header=False, box=None, padding=(0, 1))
    for meal_type, label in MEAL_LABELS.items():
        ratio = carbohydrate_ratios.get(meal_type)
        value = f"1 U : {ratio:g} g CHO" if ratio is not None else "não configurada"
        ratios.add_row(label, value)

    technical = Table(show_header=False, box=None, padding=(0, 1))
    technical.add_row("Modelo da IA", model)

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


def show_dose(
    glucose: float,
    carbohydrates: float,
    trend: str,
    meal_type: str,
    carbohydrate_ratio: float,
    total: float,
    suggested: int,
) -> None:
    table = Table(show_header=False, box=None, padding=(0, 1))
    table.add_row("Carboidratos", f"[bold]{carbohydrates:.1f} g[/]")
    table.add_row("Glicemia", f"[bold]{glucose:.0f} mg/dL[/]")
    table.add_row("Tendência", TREND_LABELS.get(trend, trend))
    table.add_row("Refeição", MEAL_LABELS.get(meal_type, meal_type))
    table.add_row("RIC", f"1 U : {carbohydrate_ratio:g} g CHO")
    table.add_row("Dose bruta", f"{total:.2f} unidades")
    table.add_row("[bold]Dose sugerida[/]", f"[bold green]{suggested} unidade(s)[/]")
    console.print(Panel(table, title="[bold green]Resumo confirmado[/]", border_style="green"))
    console.print("[dim]A sugestão não substitui orientação médica.[/]")
