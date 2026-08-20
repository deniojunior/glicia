// src/domain/ports/interpreter.ts
//
// Porta: Interpreter (Req 2.5, 3).
//
// Converte texto em MealInterpretation. O contrato produzido NUNCA contém
// campo de dose (Req 3.1, 3.9). Implementações (Mock local, OpenAI futuro)
// são intercambiáveis pelo mesmo pipeline de domínio.

import type { MealInterpretation } from "../types.js";

export interface Interpreter {
  // Converte texto em MealInterpretation. Sem chamadas de rede no Mock (Req 3.11).
  interpret(text: string, conversationContext?: readonly string[]): Promise<MealInterpretation>;
}
