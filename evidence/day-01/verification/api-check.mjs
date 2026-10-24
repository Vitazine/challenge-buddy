import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

// Same behavior checks for both generations; only the route adapter may differ.
const root = resolve(process.argv[2]);
const adapter = JSON.parse(readFileSync(process.argv[3], "utf8"));
const output = process.argv[4];
const { buildApp } = await import(pathToFileURL(join(root, "server/app.ts")));
const { signedInitData, token, challengeInput, now } = await import(
  pathToFileURL(join(root, "tests/helpers.ts"))
);
const headers = { authorization: `tma ${signedInitData()}` };
const other = { authorization: `tma ${signedInitData(43)}` };
const results = [];
async function check(name, operation) {
  try {
    await operation();
    results.push({ name, status: "pass" });
  } catch (error) {
    results.push({ name, status: "fail", detail: error.message });
  }
}
const archiveUrl = (id) => adapter.archivePath.replace(":id", id);
const archive = (app, id, identity = headers) =>
  app.inject({
    method: adapter.archiveMethod,
    url: archiveUrl(id),
    headers: identity,
  });
const archiveListUrl = `/api/challenges?${adapter.archiveQuery}`;
const app = await buildApp({
  databasePath: ":memory:",
  botToken: token,
  clock: () => now,
});
let id;
let firstArchive;
try {
  await check("create and mark a synthetic challenge", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/challenges",
      headers,
      payload: challengeInput,
    });
    assert.equal(created.statusCode, 201);
    id = created.json().id;
    const marked = await app.inject({
      method: "PUT",
      url: `/api/challenges/${id}/check-ins/today`,
      headers,
    });
    assert.equal(marked.statusCode, 200);
    assert.equal(marked.json().progress, 14);
  });
  await check("archive requires authentication", async () => {
    const response = await app.inject({
      method: adapter.archiveMethod,
      url: archiveUrl(id),
    });
    assert.equal(response.statusCode, 401);
  });
  await check(
    "foreign and missing archives return indistinguishable 404",
    async () => {
      const foreign = await archive(app, id, other);
      const missing = await archive(
        app,
        "00000000-0000-4000-8000-000000000001",
        other,
      );
      assert.equal(foreign.statusCode, 404);
      assert.equal(missing.statusCode, 404);
      assert.deepEqual(foreign.json(), missing.json());
    },
  );
  await check(
    "owner archives and preserves history, progress and dates",
    async () => {
      const response = await archive(app, id);
      assert.equal(response.statusCode, 200);
      firstArchive = response.json();
      assert.deepEqual(firstArchive.checkIns, [challengeInput.startDate]);
      assert.equal(firstArchive.progress, 14);
      assert.equal(firstArchive.startDate, challengeInput.startDate);
      assert.equal(firstArchive.ownerId, undefined);
      assert.equal(firstArchive.canCheckIn, false);
    },
  );
  await check("repeat archive is idempotent", async () => {
    const response = await archive(app, id);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), firstArchive);
  });
  await check("active list and count exclude archived record", async () => {
    const response = await app.inject({ url: "/api/challenges", headers });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().total, 0);
    assert.equal(response.json().items.length, 0);
  });
  await check("archive list and count contain the owned record", async () => {
    const response = await app.inject({ url: archiveListUrl, headers });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().total, 1);
    assert.equal(response.json().items[0].id, id);
  });
  await check("archive remains private to owner", async () => {
    const response = await app.inject({ url: archiveListUrl, headers: other });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().total, 0);
    assert.equal(
      (await app.inject({ url: `/api/challenges/${id}`, headers: other }))
        .statusCode,
      404,
    );
  });
  await check(
    "archived details remain available without leaking ownerId",
    async () => {
      const response = await app.inject({
        url: `/api/challenges/${id}`,
        headers,
      });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json().checkIns, [challengeInput.startDate]);
      assert.equal(response.json().ownerId, undefined);
    },
  );
  for (const method of ["PUT", "DELETE"]) {
    await check(
      `archived check-in ${method} is denied without changing history`,
      async () => {
        const response = await app.inject({
          method,
          url: `/api/challenges/${id}/check-ins/today`,
          headers,
        });
        assert.equal(response.statusCode, 409);
        assert.equal(typeof response.json().error.code, "string");
        const detail = (
          await app.inject({ url: `/api/challenges/${id}`, headers })
        ).json();
        assert.deepEqual(detail.checkIns, [challengeInput.startDate]);
        assert.equal(detail.progress, 14);
      },
    );
  }
  await check("list rejects invalid archive selector", async () => {
    const response = await app.inject({
      url: `/api/challenges?${adapter.invalidArchiveQuery}`,
      headers,
    });
    assert.equal(response.statusCode, 422);
  });
  await check("active pagination counts only active records", async () => {
    for (let index = 0; index < 3; index++) {
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/api/challenges",
            headers,
            payload: { ...challengeInput, title: `Pagination ${index + 1}` },
          })
        ).statusCode,
        201,
      );
    }
    const page = (
      await app.inject({ url: "/api/challenges?page=2&pageSize=2", headers })
    ).json();
    assert.equal(page.total, 3);
    assert.equal(page.items.length, 1);
    assert.equal(
      page.items.some((item) => item.id === id),
      false,
    );
    const archived = (
      await app.inject({ url: `${archiveListUrl}&page=1&pageSize=2`, headers })
    ).json();
    assert.equal(archived.total, 1);
    assert.equal(archived.items.length, 1);
  });
} finally {
  await app.close();
}

await check(
  "version-1 database migrates, preserves rows and marks, and safely reopens",
  async () => {
    const databasePath = join(
      mkdtempSync(join(tmpdir(), "day01-legacy-")),
      "legacy.sqlite",
    );
    const db = new DatabaseSync(databasePath);
    db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE challenges (
      id TEXT PRIMARY KEY, ownerId TEXT NOT NULL, title TEXT NOT NULL,
      startDate TEXT NOT NULL, duration INTEGER NOT NULL CHECK(duration BETWEEN 1 AND 30),
      timeZone TEXT NOT NULL, createdAt TEXT NOT NULL
    );
    CREATE INDEX challenges_owner ON challenges(ownerId, createdAt);
    CREATE TABLE check_ins (
      challengeId TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
      date TEXT NOT NULL, PRIMARY KEY(challengeId, date)
    );
    PRAGMA user_version = 1;
  `);
    const legacyId = "00000000-0000-4000-8000-000000000042";
    db.prepare("INSERT INTO challenges VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      legacyId,
      "42",
      "Legacy synthetic record",
      challengeInput.startDate,
      7,
      challengeInput.timeZone,
      now.toISOString(),
    );
    db.prepare("INSERT INTO check_ins VALUES (?, ?)").run(
      legacyId,
      challengeInput.startDate,
    );
    db.close();
    const migrated = await buildApp({
      databasePath,
      botToken: token,
      clock: () => now,
    });
    try {
      const record = (
        await migrated.inject({ url: `/api/challenges/${legacyId}`, headers })
      ).json();
      assert.deepEqual(record.checkIns, [challengeInput.startDate]);
      assert.equal(record.progress, 14);
      assert.equal((await archive(migrated, legacyId)).statusCode, 200);
    } finally {
      await migrated.close();
    }
    const reopened = await buildApp({
      databasePath,
      botToken: token,
      clock: () => now,
    });
    try {
      const record = (
        await reopened.inject({ url: `/api/challenges/${legacyId}`, headers })
      ).json();
      assert.deepEqual(record.checkIns, [challengeInput.startDate]);
      assert.equal(record.progress, 14);
      assert.equal(record.canCheckIn, false);
      assert.equal(
        (await reopened.inject({ url: archiveListUrl, headers })).json().total,
        1,
      );
    } finally {
      await reopened.close();
    }
    const after = new DatabaseSync(databasePath);
    try {
      assert.equal(
        Number(after.prepare("PRAGMA user_version").get().user_version),
        2,
      );
    } finally {
      after.close();
    }
  },
);

const summary = {
  checks: results.length,
  passed: results.filter((row) => row.status === "pass").length,
  failed: results.filter((row) => row.status === "fail").length,
  adapter,
  results,
};
if (output) writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (summary.failed) process.exitCode = 1;
