import { expect, test } from "vitest";

import { shouldSubmitComposer } from "./composer-keyboard";

test("Enter envia e Shift+Enter cria uma nova linha", () => {
  expect(shouldSubmitComposer({ key: "Enter", shiftKey: false, isComposing: false })).toBe(true);
  expect(shouldSubmitComposer({ key: "Enter", shiftKey: true, isComposing: false })).toBe(false);
  expect(shouldSubmitComposer({ key: "Enter", shiftKey: false, isComposing: true })).toBe(false);
  expect(shouldSubmitComposer({ key: "a", shiftKey: false, isComposing: false })).toBe(false);
});
