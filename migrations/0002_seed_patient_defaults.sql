-- migrations/0002_seed_patient_defaults.sql
-- Inicializa a paciente única e os parâmetros default do protocolo (Req 8.3, 8.4).
--
-- Como os UUIDs são gerados na aplicação, este seed usa literais fixos e determinísticos
-- para ser autocontido e reprodutível. As migrations são aplicadas uma única vez pelo
-- repositório; ainda assim, usamos `INSERT OR IGNORE` para tornar o seed idempotente e
-- seguro contra reexecução (respeita UNIQUE(patient_id) e UNIQUE(patient_id, meal_type)).
--
-- Dialeto: `INSERT OR IGNORE` é sintaxe SQLite (Fase 1). No Postgres/Supabase o equivalente
-- é `INSERT ... ON CONFLICT DO NOTHING`.
--
-- Defaults (Req 8.3, 8.4):
--   target_glucose    = 120
--   correction_factor = 40
--   carbohydrate_ratio: BREAKFAST=8, LUNCH=6, SNACK=8, DINNER=10

-- Paciente única (Req 14.1, 14.5)
INSERT OR IGNORE INTO patient (id, name, whatsapp_phone)
VALUES ('00000000-0000-4000-8000-000000000001', 'Paciente', NULL);

-- Parâmetros globais (Req 8.1, 8.3)
INSERT OR IGNORE INTO insulin_settings (id, patient_id, target_glucose, correction_factor)
VALUES (
    '00000000-0000-4000-8000-000000000010',
    '00000000-0000-4000-8000-000000000001',
    120,
    40
);

-- Relação insulina/carboidrato por tipo de refeição (Req 8.2, 8.4)
INSERT OR IGNORE INTO insulin_meal_settings (id, patient_id, meal_type, carbohydrate_ratio)
VALUES ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'BREAKFAST', 8);

INSERT OR IGNORE INTO insulin_meal_settings (id, patient_id, meal_type, carbohydrate_ratio)
VALUES ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000001', 'LUNCH', 6);

INSERT OR IGNORE INTO insulin_meal_settings (id, patient_id, meal_type, carbohydrate_ratio)
VALUES ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000001', 'SNACK', 8);

INSERT OR IGNORE INTO insulin_meal_settings (id, patient_id, meal_type, carbohydrate_ratio)
VALUES ('00000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000001', 'DINNER', 10);
