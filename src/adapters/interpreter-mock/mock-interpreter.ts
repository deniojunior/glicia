// src/adapters/interpreter-mock/mock-interpreter.ts
//
// MockInterpreter — implementação local, determinística e configurável da porta
// Interpreter (Req 3.11). NÃO realiza chamadas de rede (Req 1.7, 3.11).
//
// Princípio arquitetural central:
//   "IA interpreta. Banco fornece dados. Código calcula. Usuária confirma."
//
// O interpretador APENAS extrai dados explicitamente presentes na mensagem
// (Req 3.2, 3.12). NUNCA calcula dose, NUNCA inventa alimentos/quantidades/
// unidades/carboidratos/glicemia e NUNCA emite campo de dose. A saída sempre
// passa por sanitizeInterpretation, garantindo um MealInterpretation bem
// formado e livre de qualquer campo de dose (Req 3.1, 3.9, 3.10).
//
// Duas formas de uso combináveis:
//   1. Roteiro pré-programado (mapa `texto → MealInterpretation`): se o texto
//      (após trim) for uma chave do mapa, a interpretação correspondente é
//      retornada (ainda assim sanitizada por segurança).
//   2. Parsing leve baseado em regras, para as frases do fluxo e2e em
//      português (extrai glicemia, tipo de refeição e itens alimentares).

import type { Interpreter } from "../../domain/ports/interpreter.js";
import type {
  InterpretedItem,
  MealInterpretation,
  MealType,
  GlucoseTrend,
  MissingInfo,
} from "../../domain/types.js";
import { sanitizeInterpretation } from "../../domain/conversation/sanitize-interpretation.js";

// Número máximo de itens extraídos (Req 3.5). sanitizeInterpretation reforça
// esse limite; aqui evitamos construir coleções desnecessariamente grandes.
const MAX_ITEMS = 50;

// Remove marcas diacríticas (acentos) para comparação insensível a acentos.
// Ex.: "café" → "cafe", "três" → "tres", "feijão" preserva a letra base.
function deaccent(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Normaliza um token para classificação: minúsculas + sem acentos.
function norm(value: string): string {
  return deaccent(value.toLowerCase());
}

// Converte texto numérico ("165", "2,5") em número; NaN vira null.
function parseNumeric(value: string): number | null {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

// Palavras numéricas em português → valor (Req: "uma"/"um"→1, "duas"/"dois"→2,
// "três"→3, e alguns adicionais para robustez determinística).
const NUMBER_WORDS: ReadonlyMap<string, number> = new Map<string, number>([
  ["um", 1],
  ["uma", 1],
  ["dois", 2],
  ["duas", 2],
  ["tres", 3],
  ["quatro", 4],
  ["cinco", 5],
  ["seis", 6],
  ["sete", 7],
  ["oito", 8],
  ["nove", 9],
  ["dez", 10],
]);

// Unidades de medida reconhecidas (de-acentuadas).
const UNIT_WORDS: ReadonlySet<string> = new Set<string>([
  "colher",
  "colheres",
  "colherada",
  "colheradas",
  "concha",
  "conchas",
  "fatia",
  "fatias",
  "unidade",
  "unidades",
  "copo",
  "copos",
  "xicara",
  "xicaras",
  "pedaco",
  "pedacos",
  "prato",
  "pratos",
]);

// Preposições removidas do início do nome do alimento ("de arroz" → "arroz").
const PREPOSITIONS: ReadonlySet<string> = new Set<string>([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "com",
]);

// Palavras de ligação / verbos / palavras de refeição descartadas no início de
// uma cláusula sem quantidade explícita (ex.: "vou jantar arroz" → "arroz").
const LEADING_FILLER: ReadonlySet<string> = new Set<string>([
  "vou",
  "vamos",
  "comer",
  "comi",
  "comendo",
  "quero",
  "tomar",
  "tomei",
  "tomando",
  "fazer",
  "estou",
  "esta",
  "e",
  "no",
  "na",
  "meu",
  "minha",
  "cafe",
  "manha",
  "almoco",
  "almocar",
  "almocei",
  "lanche",
  "lanchar",
  "jantar",
  "janta",
  "jantei",
  ...PREPOSITIONS,
]);

// Palavras-chave de tipo de refeição, em ordem de avaliação (Req 3.4).
const MEAL_KEYWORDS: ReadonlyArray<readonly [string, MealType]> = [
  ["cafe", "BREAKFAST"],
  ["manha", "BREAKFAST"],
  ["almoco", "LUNCH"],
  ["almocar", "LUNCH"],
  ["almocei", "LUNCH"],
  ["lanche", "SNACK"],
  ["lanchar", "SNACK"],
  ["jantar", "DINNER"],
  ["janta", "DINNER"],
  ["jantei", "DINNER"],
];

// Termos que indicam a presença de glicemia numa cláusula (de-acentuados).
const GLUCOSE_KEYWORDS: ReadonlyArray<string> = [
  "glicemia",
  "glicose",
  "glucose",
];

// Remove pontuação nas extremidades de um token, preservando letras/números.
function cleanToken(token: string): string {
  return token.replace(/^[.,;:!?()"'\-]+|[.,;:!?()"'\-]+$/g, "");
}

// Extrai a glicemia da mensagem (Req 3.3). Retorna um número > 0 quando presente
// e explícito, ou null. Não inventa valores (Req 3.12).
function extractGlucose(text: string): number | null {
  const haystack = norm(text);

  // 1) número imediatamente após uma palavra-chave de glicemia.
  const after = haystack.match(
    /(?:glicemia|glicose|glucose)\D{0,20}(\d+(?:[.,]\d+)?)/,
  );
  // 2) número imediatamente antes de uma palavra-chave de glicemia.
  const before = haystack.match(
    /(\d+(?:[.,]\d+)?)\D{0,20}(?:glicemia|glicose|glucose)/,
  );
  // 3) número seguido da unidade mg/dl (glicemia implícita).
  const mgdl = haystack.match(/(\d+(?:[.,]\d+)?)\s*mg\s*\/?\s*dl/);

  const captured = after?.[1] ?? before?.[1] ?? mgdl?.[1];
  if (captured === undefined) {
    return null;
  }

  const value = parseNumeric(captured);
  // Somente valores estritamente positivos são aceitos (Req 3.3).
  return value !== null && value > 0 ? value : null;
}

/** Maps CGM arrows and their Portuguese textual/class-name forms to the domain enum. */
function extractGlucoseTrend(text: string): GlucoseTrend | null {
  const value = norm(text);
  if (/↑↑|seta-glicose-aumentando-rapidamente|subindo rapidamente/.test(value)) return "RISING_RAPIDLY";
  if (/↑|seta-glicose-aumentando|\bsubindo\b/.test(value)) return "RISING";
  if (/↓↓|seta-glicose-caindo-rapidamente|caindo rapidamente/.test(value)) return "FALLING_RAPIDLY";
  if (/↓|seta-glicose-caindo|\bcaindo\b/.test(value)) return "FALLING";
  if (/→|seta-glicose-mudando-lentamente|modificando lentamente|mudando lentamente/.test(value)) return "CHANGING_SLOWLY";
  return null;
}

// Detecta o tipo de refeição (Req 3.4) pela palavra-chave de menor posição no
// texto; empates são resolvidos pela ordem de MEAL_KEYWORDS. null se ausente.
function extractMeal(text: string): MealType | null {
  const haystack = norm(text);
  let bestIndex = Number.POSITIVE_INFINITY;
  let bestMeal: MealType | null = null;

  for (const [keyword, meal] of MEAL_KEYWORDS) {
    const index = haystack.indexOf(keyword);
    if (index !== -1 && index < bestIndex) {
      bestIndex = index;
      bestMeal = meal;
    }
  }

  return bestMeal;
}

// Interpreta uma palavra como quantidade: número ("3", "2,5") ou palavra
// numérica ("uma", "duas"). Retorna null quando o token não é quantidade.
function parseQuantityToken(token: string): number | null {
  const key = norm(token);
  const word = NUMBER_WORDS.get(key);
  if (word !== undefined) {
    return word;
  }
  if (/^\d+(?:[.,]\d+)?$/.test(token)) {
    return parseNumeric(token);
  }
  return null;
}

// Remove tokens de ligação/verbos no início de uma lista de tokens.
function stripLeadingFiller(tokens: readonly string[]): string[] {
  let start = 0;
  while (start < tokens.length) {
    const current = tokens[start];
    if (current === undefined || !LEADING_FILLER.has(norm(current))) {
      break;
    }
    start += 1;
  }
  return tokens.slice(start);
}

// Constrói o nome do alimento a partir de tokens, removendo preposições iniciais.
function buildFoodName(tokens: readonly string[]): string {
  let rest = tokens;
  while (rest.length > 0) {
    const first = rest[0];
    if (first === undefined || !PREPOSITIONS.has(norm(first))) {
      break;
    }
    rest = rest.slice(1);
  }
  return rest.join(" ").trim();
}

// Interpreta uma cláusula em um item alimentar, ou null quando a cláusula não
// descreve um alimento (ex.: é a cláusula de glicemia, ou está vazia).
// Extrai quantidade líder (> 0 ou null), unidade (texto ou null) e o restante
// como foodName. Nunca inventa dados ausentes (Req 3.5, 3.12).
function parseFoodClause(clause: string): InterpretedItem | null {
  const trimmed = clause.trim();
  if (trimmed.length === 0) {
    return null;
  }

  // A cláusula de glicemia não é um alimento — a glicemia já é extraída à parte.
  const normalizedClause = norm(trimmed);
  for (const keyword of GLUCOSE_KEYWORDS) {
    if (normalizedClause.includes(keyword)) {
      return null;
    }
  }

  const tokens = trimmed
    .split(/\s+/)
    .map(cleanToken)
    .filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return null;
  }

  // Localiza o primeiro token de quantidade na cláusula.
  let quantityIndex = -1;
  let quantityValue: number | null = null;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === undefined) {
      continue;
    }
    const parsed = parseQuantityToken(token);
    if (parsed !== null) {
      quantityIndex = i;
      // Quantidade deve ser > 0; caso contrário null (Req 3.5).
      quantityValue = parsed > 0 ? parsed : null;
      break;
    }
  }

  // Sem quantidade explícita: o alimento é o texto restante após ligações.
  if (quantityIndex === -1) {
    const foodName = buildFoodName(stripLeadingFiller(tokens));
    if (foodName.length === 0) {
      return null;
    }
    return { foodName, quantity: null, unit: null };
  }

  // Com quantidade: tenta unidade logo após, e o restante é o alimento.
  let rest = tokens.slice(quantityIndex + 1);
  let unit: string | null = null;
  const unitCandidate = rest[0];
  if (unitCandidate !== undefined && UNIT_WORDS.has(norm(unitCandidate))) {
    unit = norm(unitCandidate);
    rest = rest.slice(1);
  }

  let foodName = buildFoodName(rest);

  // Fallback: alimento mencionado antes da quantidade ("arroz 3 colheres").
  if (foodName.length === 0) {
    foodName = buildFoodName(stripLeadingFiller(tokens.slice(0, quantityIndex)));
  }

  if (foodName.length === 0) {
    return null;
  }

  return { foodName, quantity: quantityValue, unit };
}

// Extrai os itens alimentares da mensagem (Req 3.5), dividindo por separadores
// (",", ";", "e", "com") e interpretando cada cláusula. "Com" normalmente
// liga componentes diferentes de uma refeição (ex.: "pão com manteiga"), que
// precisam ser resolvidos e quantificados separadamente. Limita a 50 itens.
function extractItems(text: string): InterpretedItem[] {
  const clauses = text.split(/\s*,\s*|\s*;\s*|\s+e\s+|\s+com\s+/i);
  const items: InterpretedItem[] = [];
  for (const clause of clauses) {
    if (items.length >= MAX_ITEMS) {
      break;
    }
    const item = parseFoodClause(clause);
    if (item !== null) {
      items.push(item);
    }
  }
  return items;
}

// Determina quais informações estão ausentes/irresolvíveis (Req 3.6):
//   GLUCOSE       → glicemia ausente
//   MEAL          → tipo de refeição ausente
//   FOOD          → nenhum item alimentar identificado
//   FOOD_QUANTITY → algum item sem quantidade explícita
function buildMissingInformation(
  glucose: number | null,
  meal: MealType | null,
  items: readonly InterpretedItem[],
): MissingInfo[] {
  const missing: MissingInfo[] = [];
  if (glucose === null) {
    missing.push("GLUCOSE");
  }
  if (meal === null) {
    missing.push("MEAL");
  }
  if (items.length === 0) {
    missing.push("FOOD");
  }
  if (items.some((item) => item.quantity === null)) {
    missing.push("FOOD_QUANTITY");
  }
  return missing;
}

export class MockInterpreter implements Interpreter {
  // Roteiro opcional: mapa de texto exato (trim) → interpretação pré-definida.
  private readonly scripted: Map<string, MealInterpretation> | undefined;

  constructor(scripted?: Map<string, MealInterpretation>) {
    this.scripted = scripted;
  }

  // Converte texto em MealInterpretation de forma determinística e offline
  // (Req 3.11). A saída é sempre sanitizada, garantindo um contrato bem formado
  // e livre de qualquer campo de dose (Req 3.9, 3.10).
  async interpret(text: string): Promise<MealInterpretation> {
    const trimmed = text.trim();

    // 1) Roteiro pré-programado: correspondência exata pelo texto (trim).
    const scriptedResult = this.scripted?.get(trimmed);
    if (scriptedResult !== undefined) {
      return sanitizeInterpretation(scriptedResult);
    }

    // 2) Mensagem vazia ou só espaços: nada interpretável (Req 3.7, 3.8).
    if (trimmed.length === 0) {
      return sanitizeInterpretation({
        glucose: null,
        meal: null,
        items: [],
        missingInformation: ["GLUCOSE", "MEAL", "FOOD_QUANTITY", "FOOD"],
      });
    }

    // 3) Parsing leve baseado em regras (determinístico, sem rede).
    const glucose = extractGlucose(trimmed);
    const glucoseTrend = extractGlucoseTrend(trimmed);
    const meal = extractMeal(trimmed);
    const items = extractItems(trimmed);
    const missingInformation = buildMissingInformation(glucose, meal, items);

    return sanitizeInterpretation({
      glucose,
      glucoseTrend,
      meal,
      items,
      missingInformation,
    });
  }
}
