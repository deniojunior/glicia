import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { importSbdFoods } from "./import-sbd-foods.ts";

const db = new Database(":memory:");
db.pragma("foreign_keys = ON");
db.exec(readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8"));
db.exec(readFileSync(new URL("../migrations/0002_seed_patient_defaults.sql", import.meta.url), "utf8"));

const report = importSbdFoods(db); // default CSVs
console.log("Default CSV report:", JSON.stringify(report, null, 2));

const multi = db.prepare(
  "SELECT f.name, COUNT(*) c FROM food_measure m JOIN food f ON f.id = m.food_id GROUP BY f.id HAVING c > 1 ORDER BY f.name"
).all();
console.log("Foods with multiple measures:", multi);
db.close();
