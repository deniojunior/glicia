export const turnSchema = {
  type: "object", additionalProperties: false,
  required: ["reply", "total_carbohydrates", "glucose", "glucose_trend", "meal_type", "meal_items", "food_memory_updates"],
  properties: {
    reply: { type: "string", maxLength: 4_000 },
    total_carbohydrates: { type: ["number", "null"], minimum: 0 },
    glucose: { type: ["number", "null"], exclusiveMinimum: 0 },
    glucose_trend: { type: ["string", "null"], enum: ["SUBINDO_RAPIDO", "SUBINDO", "ESTAVEL", "CAINDO", "CAINDO_RAPIDO", "NAO_INFORMADA", null] },
    meal_type: { type: ["string", "null"], enum: ["CAFE_DA_MANHA", "ALMOCO", "CAFE_DA_TARDE", "JANTAR", "CEIA", null] },
    meal_items: { type: "array", maxItems: 30, items: { type: "object", additionalProperties: false, required: ["name", "portion", "carbohydrates"], properties: { name: { type: "string", minLength: 1, maxLength: 160 }, portion: { type: "string", minLength: 1, maxLength: 160 }, carbohydrates: { type: "number", minimum: 0 } } } },
    food_memory_updates: { type: "array", maxItems: 20, items: { type: "object", additionalProperties: false, required: ["food", "usual_preparation"], properties: { food: { type: "string", minLength: 1, maxLength: 160 }, usual_preparation: { type: "string", minLength: 1, maxLength: 500 } } } }
  }
};
