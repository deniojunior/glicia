import foodTable from "../../../../cli/src/glicia/data/foods-sbd.csv?raw";

import type { AiRequest } from "../../application";

export function buildOpenAiContext(request: AiRequest) {
  return { foodMemory: request.food_memory, foodTable };
}
