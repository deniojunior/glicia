-- migrations/0001_init.sql
-- Esquema inicial do Glicia.
--
-- Fonte única de schema para Postgres/Supabase (fase futura) e SQLite (Fase 1 / MVP local).
-- Este arquivo está escrito em dialeto SQLITE-compatível (aplicado pelo SqliteRepository).
--
-- Mapeamento de dialeto em relação ao Postgres/Supabase:
--   Postgres                         -> SQLite (Fase 1)
--   uuid + DEFAULT gen_random_uuid() -> TEXT PRIMARY KEY (UUID gerado na aplicação, sem DEFAULT)
--   timestamptz + DEFAULT now()      -> TEXT ISO-8601 + DEFAULT CURRENT_TIMESTAMP
--   numeric                          -> NUMERIC
--   boolean + DEFAULT true           -> INTEGER (0/1) + CHECK (... IN (0,1)) DEFAULT 1
--   lower(btrim(x))                  -> lower(trim(x))   (btrim é exclusivo do Postgres)
--   CHECK / UNIQUE / FOREIGN KEY     -> suportados por ambos os dialetos
--
-- IMPORTANTE (SQLite): a checagem de FOREIGN KEY exige `PRAGMA foreign_keys = ON;`
-- por conexão. O SqliteRepository deve habilitar esse pragma antes de aplicar/usar o schema.

-- ---------------------------------------------------------------------------
-- Paciente única (Req 14.1, 14.5) — sem multi-tenancy (Req 20.6)
-- ---------------------------------------------------------------------------
CREATE TABLE patient (
    id             TEXT PRIMARY KEY,             -- UUID gerado na aplicação
    name           TEXT NOT NULL,
    whatsapp_phone TEXT,                          -- usado só na fase futura (Req 14.4)
    created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- Parâmetros globais de cálculo (Req 8.1) — um registro por paciente
-- ---------------------------------------------------------------------------
CREATE TABLE insulin_settings (
    id                TEXT PRIMARY KEY,           -- UUID gerado na aplicação
    patient_id        TEXT NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
    target_glucose    NUMERIC NOT NULL CHECK (target_glucose    > 0 AND target_glucose    <= 999),
    correction_factor NUMERIC NOT NULL CHECK (correction_factor > 0 AND correction_factor <= 999),
    updated_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (patient_id)
);

-- ---------------------------------------------------------------------------
-- Relação insulina/carboidrato por tipo de refeição (Req 8.2)
-- ---------------------------------------------------------------------------
CREATE TABLE insulin_meal_settings (
    id                 TEXT PRIMARY KEY,          -- UUID gerado na aplicação
    patient_id         TEXT NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
    meal_type          TEXT NOT NULL CHECK (meal_type IN ('BREAKFAST','LUNCH','SNACK','DINNER')),
    carbohydrate_ratio NUMERIC NOT NULL CHECK (carbohydrate_ratio > 0 AND carbohydrate_ratio <= 999),
    updated_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (patient_id, meal_type)
);

-- ---------------------------------------------------------------------------
-- Base de alimentos (identidade) (Req 12)
-- ---------------------------------------------------------------------------
CREATE TABLE food (
    id         TEXT PRIMARY KEY,   -- UUID gerado na aplicação
    name       TEXT NOT NULL,
    -- Postgres: boolean NOT NULL DEFAULT true. SQLite não possui BOOLEAN nativo -> INTEGER 0/1.
    active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Nome exato normalizado (case/trim) para resolução (Req 4.2, 4.4)
-- Postgres: lower(btrim(name)). SQLite: lower(trim(name)).
CREATE UNIQUE INDEX ux_food_name_norm ON food (lower(trim(name)));

-- Medidas por alimento — cada par (alimento + medida) é um registro próprio (Req 12.2)
CREATE TABLE food_measure (
    id               TEXT PRIMARY KEY,  -- UUID gerado na aplicação
    food_id          TEXT NOT NULL REFERENCES food(id) ON DELETE CASCADE,
    serving_unit     TEXT NOT NULL,     -- medida usual (ex.: "colher de sopa")
    serving_quantity NUMERIC NOT NULL,  -- em g/ml
    carbohydrates    NUMERIC NOT NULL,  -- em g por medida
    -- Postgres: boolean NOT NULL DEFAULT true. SQLite não possui BOOLEAN nativo -> INTEGER 0/1.
    active           INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Medida exata normalizada (case/trim) por alimento.
-- Postgres: lower(btrim(serving_unit)). SQLite: lower(trim(serving_unit)).
CREATE UNIQUE INDEX ux_food_measure_food_unit ON food_measure (food_id, lower(trim(serving_unit)));
CREATE INDEX ix_food_measure_food_id ON food_measure (food_id);

CREATE TABLE food_alias (
    id      TEXT PRIMARY KEY,                     -- UUID gerado na aplicação
    food_id TEXT NOT NULL REFERENCES food(id) ON DELETE CASCADE,
    alias   TEXT NOT NULL                         -- (Req 4.3, 12.5)
);
-- Alias exato normalizado (case/trim) para resolução (Req 4.2, 4.3)
-- Postgres: lower(btrim(alias)). SQLite: lower(trim(alias)).
CREATE UNIQUE INDEX ux_food_alias_norm ON food_alias (lower(trim(alias)));
CREATE INDEX ix_food_alias_food_id ON food_alias (food_id);

-- ---------------------------------------------------------------------------
-- Conversa (Req 16)
-- ---------------------------------------------------------------------------
CREATE TABLE conversation (
    id         TEXT PRIMARY KEY,                  -- UUID gerado na aplicação
    patient_id TEXT NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
    status     TEXT NOT NULL CHECK (status IN ('ACTIVE','WAITING_CONFIRMATION','COMPLETED','CANCELLED')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_conversation_patient_id ON conversation (patient_id);

CREATE TABLE conversation_message (
    id                  TEXT PRIMARY KEY,         -- UUID gerado na aplicação
    conversation_id     TEXT NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
    direction           TEXT NOT NULL CHECK (direction IN ('INBOUND','OUTBOUND')),                    -- (Req 16.5)
    message_type        TEXT NOT NULL DEFAULT 'TEXT' CHECK (message_type IN ('TEXT','AUDIO')),        -- suporta AUDIO futuro (Req 16.6)
    content             TEXT NOT NULL,
    external_message_id TEXT,                      -- dedupe (Req 13)
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_conversation_message_conversation_id ON conversation_message (conversation_id);

-- ---------------------------------------------------------------------------
-- Refeição (Req 9, 10, 13)
-- ---------------------------------------------------------------------------
CREATE TABLE meal (
    id                  TEXT PRIMARY KEY,          -- UUID gerado na aplicação
    patient_id          TEXT NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
    conversation_id     TEXT REFERENCES conversation(id) ON DELETE SET NULL,
    external_message_id TEXT NOT NULL,             -- restrição de unicidade (Req 13.1)
    meal_type           TEXT NOT NULL CHECK (meal_type IN ('BREAKFAST','LUNCH','SNACK','DINNER')),
    glucose             NUMERIC NOT NULL,
    total_carbohydrates NUMERIC NOT NULL,          -- 2 casas (Req 5.2)
    -- Applied_Dose independente da Calculated_Dose (Req 10); nullable enquanto não informada.
    applied_dose        NUMERIC CHECK (applied_dose IS NULL OR (applied_dose >= 0.1 AND applied_dose <= 250)),
    created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ux_meal_external_message_id UNIQUE (external_message_id) -- idempotência (Req 13.1, 13.2)
);
CREATE INDEX ix_meal_patient_id ON meal (patient_id);
CREATE INDEX ix_meal_conversation_id ON meal (conversation_id);

-- ---------------------------------------------------------------------------
-- Itens da refeição — CHO congelado no item (Req 9.8, 9.9)
-- ---------------------------------------------------------------------------
CREATE TABLE meal_item (
    id                 TEXT PRIMARY KEY,           -- UUID gerado na aplicação
    meal_id            TEXT NOT NULL REFERENCES meal(id) ON DELETE CASCADE,
    food_id            TEXT REFERENCES food(id) ON DELETE SET NULL,
    food_name_snapshot TEXT NOT NULL,              -- (Req 9.8)
    quantity           NUMERIC NOT NULL,
    unit               TEXT,
    carbohydrates      NUMERIC NOT NULL            -- CHO do item, congelado (Req 5.4, 9.8)
);
CREATE INDEX ix_meal_item_meal_id ON meal_item (meal_id);
CREATE INDEX ix_meal_item_food_id ON meal_item (food_id);

-- ---------------------------------------------------------------------------
-- Cálculo de insulina — snapshot de parâmetros + formula_version (Req 9.5, 9.6, 9.7)
-- ---------------------------------------------------------------------------
CREATE TABLE insulin_calculation (
    id                          TEXT PRIMARY KEY,  -- UUID gerado na aplicação
    meal_id                     TEXT NOT NULL REFERENCES meal(id) ON DELETE CASCADE,
    glucose                     NUMERIC NOT NULL,
    total_carbohydrates         NUMERIC NOT NULL,
    correction_dose             NUMERIC NOT NULL,
    carbohydrate_dose           NUMERIC NOT NULL,
    total_dose                  NUMERIC NOT NULL,  -- Calculated_Dose bruta (Req 9.7, 10.1)
    rounded_dose                NUMERIC NOT NULL,  -- (Req 9.7)
    snapshot_target_glucose     NUMERIC NOT NULL,  -- Parameter_Snapshot (Req 9.5)
    snapshot_correction_factor  NUMERIC NOT NULL,  -- Parameter_Snapshot (Req 9.5)
    snapshot_carbohydrate_ratio NUMERIC NOT NULL,  -- Parameter_Snapshot (Req 9.5)
    formula_version             TEXT NOT NULL DEFAULT '1.0', -- (Req 9.6)
    created_at                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (meal_id)
);
