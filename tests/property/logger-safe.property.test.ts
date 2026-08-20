import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  createConsoleLogger,
  type LogEvent,
} from "../../src/domain/logging/logger.js";

// Teste de propriedade — Log seguro sem dados clínicos.
//
// Validates: Requirements 15.4, 15.5
//
// Req 15.4: ao registrar eventos, apenas message_id, patient_id, event_type,
//   status, processing_time, timestamp e correlation IDs podem constar no log.
// Req 15.5: dados clínicos completos (glicemia, alimentos, doses) nunca entram
//   em log.
//
// Executado offline, sem dependências externas (Req 18.6). O logger recebe um
// sink de captura, portanto nada é escrito no console real durante o teste.

/** Conjunto EXATO das 7 chaves autorizadas em um evento de log (Req 15.4). */
const ALLOWED_KEYS = [
  "messageId",
  "patientId",
  "eventType",
  "status",
  "processingTime",
  "timestamp",
  "correlationId",
] as const;

/**
 * Nomes de campos clínicos que NUNCA podem aparecer em um log (Req 15.5).
 * Espelham os campos do domínio de cálculo/refeição.
 */
const CLINICAL_KEYS = [
  "glucose",
  "carbohydrates",
  "dose",
  "correctionDose",
  "carbohydrateDose",
  "totalDose",
  "roundedDose",
  "foodName",
  "content",
  "items",
  "meal",
  "appliedDose",
] as const;

/**
 * Gera um LogEvent válido com valores arbitrários porém finitos/serializáveis.
 * `processingTime` é um número finito (sem NaN/Infinity) para permitir o
 * round-trip via JSON.
 */
const arbLogEvent: fc.Arbitrary<LogEvent> = fc.record({
  messageId: fc.string(),
  patientId: fc.string(),
  eventType: fc.string(),
  status: fc.string(),
  processingTime: fc.double({ noNaN: true, noDefaultInfinity: true }),
  timestamp: fc.string(),
  correlationId: fc.string(),
});

/** Cria um logger que captura a última linha emitida. */
function makeCapturingLogger() {
  const captured: string[] = [];
  const logger = createConsoleLogger((line) => captured.push(line));
  return { logger, captured };
}

describe("Feature: glicia, Property 27: Log seguro sem dados clínicos", () => {
  it("o objeto emitido contém EXATAMENTE as 7 chaves autorizadas, sem campos clínicos (Req 15.4, 15.5)", () => {
    fc.assert(
      fc.property(arbLogEvent, (event) => {
        const { logger, captured } = makeCapturingLogger();

        logger.log(event);

        expect(captured).toHaveLength(1);
        const emitted = JSON.parse(captured[0]) as Record<string, unknown>;
        const emittedKeys = Object.keys(emitted).sort();

        // As chaves emitidas são exatamente as 7 permitidas (nem mais, nem menos).
        expect(emittedKeys).toEqual([...ALLOWED_KEYS].sort());

        // Nenhum nome de campo clínico aparece nas chaves emitidas.
        for (const clinicalKey of CLINICAL_KEYS) {
          expect(emittedKeys).not.toContain(clinicalKey);
        }

        // Os valores dos campos autorizados sobrevivem ao round-trip JSON.
        expect(emitted.messageId).toBe(event.messageId);
        expect(emitted.patientId).toBe(event.patientId);
        expect(emitted.eventType).toBe(event.eventType);
        expect(emitted.status).toBe(event.status);
        expect(emitted.processingTime).toBe(event.processingTime);
        expect(emitted.timestamp).toBe(event.timestamp);
        expect(emitted.correlationId).toBe(event.correlationId);
      }),
      { numRuns: 100 },
    );
  });

  it("defesa em profundidade: campos clínicos extras em runtime NÃO são serializados (Req 15.5)", () => {
    fc.assert(
      fc.property(
        arbLogEvent,
        // Valores clínicos arbitrários que tentam "vazar" via propriedades extras.
        fc.double({ noNaN: true, noDefaultInfinity: true }),
        fc.double({ noNaN: true, noDefaultInfinity: true }),
        fc.string(),
        (event, glucose, roundedDose, foodName) => {
          const { logger, captured } = makeCapturingLogger();

          // Um objeto que carrega campos clínicos extras em tempo de execução.
          // O cast contorna a checagem estrutural de compilação para provar que
          // a fábrica reconstrói o payload apenas a partir dos campos permitidos.
          const contaminated = {
            ...event,
            glucose,
            carbohydrates: 42,
            dose: 10,
            correctionDose: 1.5,
            carbohydrateDose: 2.5,
            totalDose: 4,
            roundedDose,
            foodName,
            content: "Minha glicemia está 165 e vou jantar arroz",
            items: [{ foodName, quantity: 3 }],
            meal: "DINNER",
            appliedDose: 5,
          };

          logger.log(contaminated as unknown as LogEvent);

          expect(captured).toHaveLength(1);
          const emitted = JSON.parse(captured[0]) as Record<string, unknown>;
          const emittedKeys = Object.keys(emitted).sort();

          // Apenas as 7 chaves permitidas são emitidas, mesmo com contaminação.
          expect(emittedKeys).toEqual([...ALLOWED_KEYS].sort());

          // Nenhum campo clínico contrabandeado sobreviveu à serialização.
          for (const clinicalKey of CLINICAL_KEYS) {
            expect(emittedKeys).not.toContain(clinicalKey);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
