import { describe, expect, it } from "vitest";

import { GLUCOSE_TRENDS } from "./models";
import { assessBolusSafety } from "./safety";

describe("travas antes do cálculo", () => {
  it.each(GLUCOSE_TRENDS)("bloqueia abaixo do limite personalizado com %s", (trend) => {
    expect(assessBolusSafety(79.99, trend, 80)).toEqual({ bolus_blocked: true, rapid_fall_warning: false });
  });

  it.each([
    [80, false, true], [99.99, false, true], [100, false, false], [100.01, false, false]
  ] as const)("glicemia %s com queda rápida", (glucose, blocked, warning) => {
    expect(assessBolusSafety(glucose, "CAINDO_RAPIDO", 80)).toEqual({ bolus_blocked: blocked, rapid_fall_warning: warning });
  });

  it.each(GLUCOSE_TRENDS.filter((trend) => trend !== "CAINDO_RAPIDO"))("não emite aviso de queda rápida com %s", (trend) => {
    expect(assessBolusSafety(90, trend, 80)).toEqual({ bolus_blocked: false, rapid_fall_warning: false });
  });

  it.each([0, -1, NaN, Infinity, -Infinity])("rejeita glicemia ou limite inválido: %s", (invalid) => {
    expect(() => assessBolusSafety(invalid, "ESTAVEL", 70)).toThrow();
    expect(() => assessBolusSafety(100, "ESTAVEL", invalid)).toThrow();
  });
});
