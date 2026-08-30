import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

import {
  assessBolusSafety,
  calculateSuggestedDose,
  conversationTurnFromResponse,
  createClinicalSettings,
  isConversationTurnComplete,
  roundHalfAwayFromZero,
  trendAdjustment,
  type ClinicalSettings,
  type DoseCalculation,
  type GlucoseTrend,
  type SafetyAssessment
} from ".";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const contractsDirectory = resolve(currentDirectory, "../../../../packages/contracts");

function readContract(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(contractsDirectory, relativePath), "utf8")) as Record<
    string,
    unknown
  >;
}

function casesFrom(fixtureName: string): readonly Record<string, unknown>[] {
  const cases = readContract(`fixtures/${fixtureName}`).cases;
  if (!Array.isArray(cases)) {
    throw new Error(`Fixture ${fixtureName} não contém casos.`);
  }
  return cases as readonly Record<string, unknown>[];
}

function contractValidator() {
  const validator = new Ajv2020({ strict: false });
  addFormats(validator);
  return validator;
}

function expectedSettings(environment: Record<string, string>): ClinicalSettings {
  const defaults = createClinicalSettings();
  return createClinicalSettings({
    target_glucose: Number(environment.TARGET_GLUCOSE ?? defaults.target_glucose),
    correction_factor: Number(environment.CORRECTION_FACTOR ?? defaults.correction_factor),
    carbohydrate_ratios: {
      CAFE_DA_MANHA: Number(
        environment.CARBOHYDRATE_RATIO_CAFE_DA_MANHA ?? defaults.carbohydrate_ratios.CAFE_DA_MANHA
      ),
      ALMOCO: Number(environment.CARBOHYDRATE_RATIO_ALMOCO ?? defaults.carbohydrate_ratios.ALMOCO),
      CAFE_DA_TARDE: Number(
        environment.CARBOHYDRATE_RATIO_CAFE_DA_TARDE ??
          defaults.carbohydrate_ratios.CAFE_DA_TARDE
      ),
      JANTAR: Number(environment.CARBOHYDRATE_RATIO_JANTAR ?? defaults.carbohydrate_ratios.JANTAR),
      CEIA: Number(environment.CARBOHYDRATE_RATIO_CEIA ?? defaults.carbohydrate_ratios.CEIA)
    },
    basal_morning_units: Number(environment.BASAL_MORNING_UNITS ?? defaults.basal_morning_units),
    hypoglycemia_threshold: Number(
      environment.HYPOGLYCEMIA_THRESHOLD ?? defaults.hypoglycemia_threshold
    )
  });
}

describe("contratos compartilhados", () => {
  it("mantém schemas e fixtures na versão declarada", () => {
    const manifest = readContract("manifest.json");
    expect(manifest.contract_version).toBe(1);

    const ajv = contractValidator();
    for (const schemaPath of manifest.schemas as readonly string[]) {
      expect(() => ajv.compile(readContract(schemaPath))).not.toThrow();
    }
    for (const fixturePath of manifest.fixtures as readonly string[]) {
      expect(readContract(fixturePath).contract_version).toBe(manifest.contract_version);
    }
  });

  it("executa os casos de cálculo de dose", () => {
    const validate = contractValidator().compile(
      readContract("schemas/dose-calculation.schema.json")
    );

    for (const testCase of casesFrom("dose-cases.json")) {
      const actual = calculateSuggestedDose(testCase.input as Parameters<typeof calculateSuggestedDose>[0]);
      expect(validate(actual), String(testCase.id)).toBe(true);
      expect(actual).toEqual(testCase.expected as DoseCalculation);
    }
  });

  it("executa os casos de arredondamento", () => {
    for (const testCase of casesFrom("rounding-cases.json")) {
      expect(roundHalfAwayFromZero(testCase.input as number), String(testCase.id)).toBe(
        testCase.expected
      );
    }
  });

  it("executa os casos de tendência", () => {
    for (const testCase of casesFrom("trend-adjustment-cases.json")) {
      expect(
        trendAdjustment(testCase.trend as GlucoseTrend, testCase.correction_factor as number),
        String(testCase.id)
      ).toBe(testCase.expected);
    }
  });

  it("executa os casos de segurança", () => {
    const validate = contractValidator().compile(
      readContract("schemas/safety-assessment.schema.json")
    );

    for (const testCase of casesFrom("safety-cases.json")) {
      const input = testCase.input as {
        glucose: number;
        trend: GlucoseTrend;
        hypoglycemia_threshold: number;
      };
      const actual = assessBolusSafety(input.glucose, input.trend, input.hypoglycemia_threshold);
      expect(validate(actual), String(testCase.id)).toBe(true);
      expect(actual).toEqual(testCase.expected as SafetyAssessment);
    }
  });

  it("aceita as configurações válidas", () => {
    const fixture = readContract("fixtures/settings-cases.json");
    const validate = contractValidator().compile(
      readContract("schemas/clinical-settings.schema.json")
    );

    for (const testCase of fixture.valid_cases as readonly Record<string, unknown>[]) {
      const actual = expectedSettings(testCase.environment as Record<string, string>);
      expect(validate(actual), String(testCase.id)).toBe(true);
      expect(actual).toEqual(testCase.expected as ClinicalSettings);
    }
  });

  it("rejeita as configurações inválidas", () => {
    const fixture = readContract("fixtures/settings-cases.json");
    for (const testCase of fixture.invalid_cases as readonly Record<string, unknown>[]) {
      expect(
        () => expectedSettings(testCase.environment as Record<string, string>),
        String(testCase.id)
      ).toThrow(testCase.error_contains as string);
    }
  });

  it("executa os casos de turnos de conversa", () => {
    const validate = contractValidator().compile(
      readContract("schemas/conversation-turn.schema.json")
    );

    for (const testCase of casesFrom("turn-cases.json")) {
      expect(validate(testCase.payload), String(testCase.id)).toBe(true);
      expect(isConversationTurnComplete(conversationTurnFromResponse(testCase.payload))).toBe(
        testCase.expected_complete
      );
    }
  });
});
