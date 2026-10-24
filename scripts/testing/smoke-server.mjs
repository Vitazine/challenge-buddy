import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildApp } from "../../server/app.ts";
import { currentArtifacts } from "./artifacts.mjs";

// Validate the current run; retries never delete earlier screenshots/logs.
currentArtifacts();
// No .env, production credentials or working data directory are read.
const directory = mkdtempSync(join(tmpdir(), "challenge-buddy-smoke-"));
const marker = join(directory, "day3-owner.txt");
writeFileSync(marker, "challenge-buddy-smoke-v1");
const app = await buildApp({
  databasePath: join(directory, "smoke.sqlite"),
  devAuth: true,
  production: false,
  staticRoot: resolve("dist"),
  clock: () => new Date("2026-10-24T12:00:00Z"),
});
app.addHook("onResponse", async (request, reply) => {
  // Route patterns only: never credentials, request bodies, owners or initData.
  process.stdout.write(
    `${JSON.stringify({
      at: new Date().toISOString(),
      method: request.method,
      route: request.routeOptions.url ?? "unmatched",
      status: reply.statusCode,
    })}\n`,
  );
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await app.close();
  if (readFileSync(marker, "utf8") !== "challenge-buddy-smoke-v1") {
    throw new Error("Refusing cleanup: ownership marker changed");
  }
  rmSync(directory, { recursive: true });
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
try {
  await app.listen({ host: "127.0.0.1", port: 3001 });
  process.stdout.write(
    "Day 3 smoke ready: http://127.0.0.1:3001; isolated SQLite; clock=2026-10-24T12:00:00Z\n",
  );
} catch (error) {
  await stop();
  throw error;
}
