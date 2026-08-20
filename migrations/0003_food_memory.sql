-- Memória de vocabulário e preferências alimentares por paciente.
-- Não armazena quantidade padrão nem qualquer dose de insulina.

CREATE TABLE food_memory (
    id                  TEXT PRIMARY KEY,
    patient_id          TEXT NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
    phrase              TEXT NOT NULL,
    normalized_phrase   TEXT NOT NULL,
    food_id             TEXT NOT NULL REFERENCES food(id) ON DELETE CASCADE,
    measure_id          TEXT NOT NULL REFERENCES food_measure(id) ON DELETE CASCADE,
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (patient_id, normalized_phrase)
);

CREATE INDEX ix_food_memory_patient ON food_memory(patient_id);
CREATE INDEX ix_food_memory_food ON food_memory(food_id);

