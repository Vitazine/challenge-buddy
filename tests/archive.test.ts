import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildApp } from "../server/app";
import { ChallengeService } from "../server/challenges";
import { AppError } from "../server/errors";
import { ChallengeRepository } from "../server/repository";
import { challengeInput, now, signedInitData, token } from "./helpers";

test("archive enforces ownership, preserves history, is idempotent and blocks both mark operations", (t) => {
  const repository = new ChallengeRepository(":memory:");
  t.after(() => repository.close());
  let clock = now;
  const service = new ChallengeService(repository, () => clock);
  const created = service.create("42", challengeInput);
  assert.equal(created.archivedAt, null);
  const marked = service.checkIn("42", created.id, true);
  assert.throws(
    () => service.archive("43", created.id),
    (error: unknown) => error instanceof AppError && error.statusCode === 404,
  );
  assert.equal(service.get("42", created.id).archivedAt, null);
  const archived = service.archive("42", created.id);
  assert.equal(archived.archivedAt, now.toISOString());
  assert.equal(archived.canCheckIn, false);
  assert.equal(archived.progress, marked.progress);
  assert.deepEqual(archived.checkIns, marked.checkIns);
  assert.equal(service.list("42", 1, 20).total, 0);
  assert.equal(service.list("42", 1, 20, true).total, 1);
  clock = new Date(now.getTime() + 60_000);
  assert.equal(
    service.archive("42", created.id).archivedAt,
    archived.archivedAt,
  );
  for (const checked of [true, false]) {
    assert.throws(
      () => service.checkIn("42", created.id, checked),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 409 &&
        error.code === "ARCHIVED",
    );
  }
  assert.deepEqual(service.get("42", created.id).checkIns, marked.checkIns);
  assert.equal(service.get("42", created.id).progress, marked.progress);
});

test("upcoming and finished challenges can be archived with their calendar status preserved", (t) => {
  const repository = new ChallengeRepository(":memory:");
  t.after(() => repository.close());
  const service = new ChallengeService(repository, () => now);
  for (const startDate of ["2026-10-25", "2026-10-01"]) {
    const created = service.create("42", { ...challengeInput, startDate });
    const archived = service.archive("42", created.id);
    assert.equal(archived.status, created.status);
    assert.equal(archived.canCheckIn, false);
    assert.equal(archived.progress, 0);
  }
});

test("version 1 migration preserves existing records and marks; archived data survives reopening", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "challenge-archive-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "test.sqlite");
  const legacy = new DatabaseSync(path);
  legacy.exec(`
    CREATE TABLE challenges (
      id TEXT PRIMARY KEY, ownerId TEXT NOT NULL, title TEXT NOT NULL,
      startDate TEXT NOT NULL, duration INTEGER NOT NULL CHECK(duration BETWEEN 1 AND 30),
      timeZone TEXT NOT NULL, createdAt TEXT NOT NULL
    );
    CREATE TABLE check_ins (
      challengeId TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
      date TEXT NOT NULL, PRIMARY KEY(challengeId, date)
    );
    PRAGMA user_version = 1;
  `);
  const id = randomUUID();
  legacy
    .prepare("INSERT INTO challenges VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(
      id,
      "42",
      challengeInput.title,
      challengeInput.startDate,
      challengeInput.duration,
      challengeInput.timeZone,
      now.toISOString(),
    );
  legacy
    .prepare("INSERT INTO check_ins VALUES (?, ?)")
    .run(id, challengeInput.startDate);
  legacy.close();
  const repository = new ChallengeRepository(path);
  const service = new ChallengeService(repository, () => now);
  const before = service.get("42", id);
  assert.equal(before.archivedAt, null);
  assert.equal(before.title, challengeInput.title);
  assert.equal(before.progress, 14);
  assert.equal(service.list("42", 1, 20).total, 1);
  const archived = service.archive("42", id);
  repository.close();
  const reopened = new ChallengeRepository(path);
  t.after(() => reopened.close());
  const restored = new ChallengeService(reopened, () => now);
  assert.deepEqual(restored.get("42", id), archived);
  assert.equal(restored.list("42", 1, 20).total, 0);
  assert.equal(restored.list("42", 1, 20, true).items[0]?.id, id);
  const fresh = restored.create("42", challengeInput);
  assert.equal(fresh.archivedAt, null);
  assert.equal(restored.list("42", 1, 20).total, 1);
});

test("API archive: authenticated owner only, isolated paginated archive, preserved read-only detail", async (t) => {
  const app = await buildApp({
    databasePath: ":memory:",
    botToken: token,
    clock: () => now,
  });
  t.after(() => app.close());
  const headers = { authorization: `tma ${signedInitData()}` };
  const other = { authorization: `tma ${signedInitData(43)}` };
  const ids: string[] = [];
  for (let index = 0; index < 3; index += 1) {
    const created = await app.inject({
      method: "POST",
      url: "/api/challenges",
      headers,
      payload: challengeInput,
    });
    assert.equal(created.statusCode, 201);
    ids.push(created.json().id);
  }
  const id = ids[0]!;
  const url = `/api/challenges/${id}/archive`;
  assert.equal((await app.inject({ method: "PUT", url })).statusCode, 401);
  assert.equal(
    (await app.inject({ method: "PUT", url, headers: other })).statusCode,
    404,
  );
  assert.equal(
    (
      await app.inject({
        method: "PUT",
        url: `/api/challenges/${randomUUID()}/archive`,
        headers,
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await app.inject({
        method: "PUT",
        url: "/api/challenges/invalid/archive",
        headers,
      })
    ).statusCode,
    422,
  );
  assert.equal(
    (
      await app.inject({
        method: "PUT",
        url,
        headers,
        payload: { ownerId: "43" },
      })
    ).statusCode,
    422,
  );
  const marked = await app.inject({
    method: "PUT",
    url: `/api/challenges/${id}/check-ins/today`,
    headers,
  });
  assert.equal(marked.statusCode, 200);
  const archive = await app.inject({ method: "PUT", url, headers });
  assert.equal(archive.statusCode, 200);
  assert.equal(archive.json().archivedAt, now.toISOString());
  assert.equal(archive.json().canCheckIn, false);
  assert.equal(archive.json().ownerId, undefined);
  assert.equal(archive.json().progress, marked.json().progress);
  assert.deepEqual(archive.json().checkIns, marked.json().checkIns);
  assert.deepEqual(
    (await app.inject({ method: "PUT", url, headers })).json(),
    archive.json(),
  );
  assert.equal(
    (
      await app.inject({
        method: "PUT",
        url: `/api/challenges/${ids[1]}/archive`,
        headers,
      })
    ).statusCode,
    200,
  );
  const active = await app.inject({ url: "/api/challenges", headers });
  assert.equal(active.json().total, 1);
  assert.equal(active.json().items[0].id, ids[2]);
  assert.deepEqual(
    (
      await app.inject({ url: "/api/challenges?archived=false", headers })
    ).json(),
    active.json(),
  );
  const pages = await Promise.all(
    [1, 2].map((page) =>
      app.inject({
        url: `/api/challenges?archived=true&pageSize=1&page=${page}`,
        headers,
      }),
    ),
  );
  pages.forEach((page) => {
    assert.equal(page.statusCode, 200);
    assert.equal(page.json().total, 2);
    assert.equal(page.json().items.length, 1);
    assert.equal(page.headers["cache-control"], "no-store");
  });
  assert.notEqual(pages[0]!.json().items[0].id, pages[1]!.json().items[0].id);
  assert.equal(
    (
      await app.inject({ url: "/api/challenges?archived=true", headers: other })
    ).json().total,
    0,
  );
  assert.equal(
    (await app.inject({ url: `/api/challenges/${id}`, headers: other }))
      .statusCode,
    404,
  );
  assert.equal(
    (await app.inject({ method: "PUT", url, headers: other })).statusCode,
    404,
  );
  for (const method of ["PUT", "DELETE"] as const) {
    const response = await app.inject({
      method,
      url: `/api/challenges/${id}/check-ins/today`,
      headers,
    });
    assert.equal(response.statusCode, 409);
    assert.equal(response.json().error.code, "ARCHIVED");
    assert.equal(
      (
        await app.inject({
          method,
          url: `/api/challenges/${id}/check-ins/today`,
          headers: other,
        })
      ).statusCode,
      404,
    );
  }
  assert.deepEqual(
    (await app.inject({ url: `/api/challenges/${id}`, headers })).json(),
    archive.json(),
  );
  for (const query of [
    "archived=yes",
    "archived=1",
    "archived=",
    "archived=true&ownerId=43",
    "archived=true&archived=false",
  ]) {
    assert.equal(
      (await app.inject({ url: `/api/challenges?${query}`, headers }))
        .statusCode,
      422,
    );
  }
});
