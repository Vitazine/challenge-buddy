import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

// Exploratory diagnostic added AFTER generation 1, before writing rules v2.
// It is reported separately from the predeclared acceptance checks.
const root = resolve(process.argv[2]);
const output = process.argv[3];
const { buildApp } = await import(pathToFileURL(join(root, "server/app.ts")));
const databasePath = join(
  mkdtempSync(join(tmpdir(), "day01-future-schema-")),
  "future.sqlite",
);
const seed = new DatabaseSync(databasePath);
seed.exec(
  "CREATE TABLE future_sentinel (value TEXT); INSERT INTO future_sentinel VALUES ('synthetic'); PRAGMA user_version = 99;",
);
const before = seed
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all()
  .map((row) => row.name);
seed.close();
let startup = "accepted";
let message = null;
let app;
try {
  app = await buildApp({ databasePath, devAuth: true });
} catch (error) {
  startup = "refused";
  message = error.message;
} finally {
  await app?.close();
}
const afterDb = new DatabaseSync(databasePath);
const after = afterDb
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all()
  .map((row) => row.name);
const version = afterDb.prepare("PRAGMA user_version").get().user_version;
const sentinel = afterDb
  .prepare("SELECT value FROM future_sentinel")
  .get().value;
afterDb.close();
const result = {
  category: "exploratory; added after generation 1",
  startup,
  schemaUnchanged: JSON.stringify(before) === JSON.stringify(after),
  before,
  after,
  version,
  sentinel,
  message,
  desiredOutcome:
    "refuse unsupported future version before modifying its schema",
};
if (output) writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
