import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Local-only screenshot fixture; never reads the real application's database.
const root = resolve(process.argv[2]);
const adapter = JSON.parse(readFileSync(process.argv[3], "utf8"));
const { buildApp } = await import(pathToFileURL(join(root, "server/app.ts")));
const { challengeInput, now } = await import(
  pathToFileURL(join(root, "tests/helpers.ts"))
);
const headers = { "x-local-development": "true" };
const app = await buildApp({
  databasePath: join(
    mkdtempSync(join(tmpdir(), "day01-ui-")),
    "fixture.sqlite",
  ),
  devAuth: true,
  clock: () => now,
  staticRoot: join(root, "dist"),
});
for (const [index, title] of [
  "Читать каждый день",
  "Прогулка 20 минут",
  "Сохранённая история",
].entries()) {
  const created = await app.inject({
    method: "POST",
    url: "/api/challenges",
    headers,
    payload: { ...challengeInput, title },
  });
  if (created.statusCode !== 201)
    throw new Error("Synthetic fixture creation failed");
  const id = created.json().id;
  if (index !== 1) {
    await app.inject({
      method: "PUT",
      url: `/api/challenges/${id}/check-ins/today`,
      headers,
    });
  }
  if (index === 2) {
    const archived = await app.inject({
      method: adapter.archiveMethod,
      url: adapter.archivePath.replace(":id", id),
      headers,
    });
    if (archived.statusCode !== 200)
      throw new Error("Synthetic archive creation failed");
  }
}
await app.listen({ host: "127.0.0.1", port: 3001 });
process.stdout.write("Day 1 synthetic UI fixture: http://127.0.0.1:3001\n");
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
}
