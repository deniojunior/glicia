import { readFileSync, writeFileSync, rmSync } from "node:fs";
import Database from "better-sqlite3";
import { importSbdFoods } from "./import-sbd-foods.ts";

const db = new Database(":memory:");
db.pragma("foreign_keys = ON");
db.exec(readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8"));
db.exec(readFileSync(new URL("../migrations/0002_seed_patient_defaults.sql", import.meta.url), "utf8"));

// Build a temp foods CSV that includes a malformed row to prove tolerance.
const foodsCsv = `name,serving_unit,serving_quantity,carbohydrates
Arroz branco cozido,colher de sopa,25,6.2
Arroz branco cozido,escumadeira,90,22.3
Banana prata,unidade,60,15.0
Banana prata,rodela,10,2.5
Malformada,unidade,-5,3
`;
const tmpFoods = new URL("./_smoke-foods.csv", import.meta.url);
const tmpAliases = new URL("./_smoke-aliases.csv", import.meta.url);
writeFileSync(tmpFoods, foodsCsv);
writeFileSync(tmpAliases, "food_name,alias\nArroz branco cozido,arroz\n");

const report = importSbdFoods(db, {
  foodsCsvPath: new URL("./_smoke-foods.csv", import.meta.url).pathname,
  aliasesCsvPath: new URL("./_smoke-aliases.csv", import.meta.url).pathname,
});

console.log("Report:", JSON.stringify(report, null, 2));

const foods = db.prepare("SELECT id, name FROM food ORDER BY name").all() as { id: string; name: string }[];
console.log("Distinct foods:", foods.map((f) => f.name));

for (const f of foods) {
  const measures = db
    .prepare("SELECT serving_unit, serving_quantity, carbohydrates FROM food_measure WHERE food_id = ? ORDER BY serving_unit")
    .all(f.id);
  console.log(`  ${f.name} → measures:`, measures);
}

const arroz = foods.find((f) => f.name === "Arroz branco cozido")!;
const arrozMeasures = db.prepare("SELECT COUNT(*) c FROM food_measure WHERE food_id = ?").get(arroz.id) as { c: number };
console.log("Arroz measures count (expect 2):", arrozMeasures.c);
console.log("Foods count (expect 2 distinct):", foods.length);
console.log("Malformed reported:", report.errors);

rmSync(tmpFoods);
rmSync(tmpAliases);
db.close();
