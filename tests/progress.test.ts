import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChallengeService } from "../server/challenges";
import { AppError } from "../server/errors";
import { ChallengeRepository } from "../server/repository";
import { challengeInput, now } from "./helpers";

test("three-day progress rounds correctly and undo preserves earlier history across reopen", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "challenge-day3-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "test.sqlite");
  let repository = new ChallengeRepository(path);
  t.after(() => repository.close());
  let clock = now;
  let service = new ChallengeService(repository, () => clock);
  const item = service.create("synthetic-owner", {
    ...challengeInput,
    duration: 3,
  });
  assert.equal(item.progress, 0);
  assert.equal(item.endDate, "2026-10-26");
  assert.equal(service.checkIn("synthetic-owner", item.id, true).progress, 33);

  clock = new Date("2026-10-25T10:00:00Z");
  const second = service.checkIn("synthetic-owner", item.id, true);
  assert.equal(second.progress, 67);
  assert.deepEqual(second.checkIns, ["2026-10-24", "2026-10-25"]);
  const undone = service.checkIn("synthetic-owner", item.id, false);
  assert.equal(undone.progress, 33);
  assert.deepEqual(undone.checkIns, ["2026-10-24"]);
  assert.deepEqual(service.checkIn("synthetic-owner", item.id, false), undone);

  repository.close();
  repository = new ChallengeRepository(path);
  service = new ChallengeService(repository, () => clock);
  assert.deepEqual(service.get("synthetic-owner", item.id), undone);
  service.checkIn("synthetic-owner", item.id, true);
  clock = new Date("2026-10-26T10:00:00Z");
  const last = service.checkIn("synthetic-owner", item.id, true);
  assert.equal(last.progress, 100);
  assert.equal(last.canCheckIn, true);
  assert.equal(last.status, "active");

  clock = new Date("2026-10-27T10:00:00Z");
  const finished = service.get("synthetic-owner", item.id);
  assert.equal(finished.status, "finished");
  assert.equal(finished.canCheckIn, false);
  for (const marked of [true, false]) {
    assert.throws(
      () => service.checkIn("synthetic-owner", item.id, marked),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "OUTSIDE_PERIOD" &&
        error.statusCode === 409,
    );
  }
  assert.deepEqual(service.get("synthetic-owner", item.id), finished);
});

test("check-in date follows each challenge zone at the same midnight boundary", (t) => {
  const repository = new ChallengeRepository(":memory:");
  t.after(() => repository.close());
  let clock = new Date("2026-10-24T15:59:59.999Z");
  const service = new ChallengeService(repository, () => clock);
  const manila = service.create("synthetic-owner", {
    ...challengeInput,
    duration: 2,
  });
  const losAngeles = service.create("synthetic-owner", {
    ...challengeInput,
    duration: 2,
    timeZone: "America/Los_Angeles",
  });
  service.checkIn("synthetic-owner", manila.id, true);
  service.checkIn("synthetic-owner", losAngeles.id, true);
  clock = new Date("2026-10-24T16:00:00.000Z");
  const nextDay = service.checkIn("synthetic-owner", manila.id, true);
  const sameDay = service.checkIn("synthetic-owner", losAngeles.id, true);
  assert.equal(nextDay.today, "2026-10-25");
  assert.deepEqual(nextDay.checkIns, ["2026-10-24", "2026-10-25"]);
  assert.equal(nextDay.progress, 100);
  assert.equal(sameDay.today, "2026-10-24");
  assert.deepEqual(sameDay.checkIns, ["2026-10-24"]);
  assert.equal(sameDay.progress, 50);
  const undone = service.checkIn("synthetic-owner", manila.id, false);
  assert.deepEqual(undone.checkIns, ["2026-10-24"]);
  assert.equal(undone.progress, 50);
});
