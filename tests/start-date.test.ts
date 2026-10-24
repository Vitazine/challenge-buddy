import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../server/app";
import { ChallengeRepository } from "../server/repository";
import { ChallengeService } from "../server/challenges";
import { challengeInput } from "./helpers";

const cases = [
  [
    "2026-10-24T10:00:00Z",
    "Asia/Manila",
    "2026-10-24",
    "2026-10-31",
    "2026-11-01",
    "2026-10-23",
  ],
  [
    "2026-12-28T12:00:00Z",
    "UTC",
    "2026-12-28",
    "2027-01-04",
    "2027-01-05",
    "2026-12-27",
  ],
  [
    "2024-02-23T12:00:00Z",
    "UTC",
    "2024-02-23",
    "2024-03-01",
    "2024-03-02",
    "2024-02-22",
  ],
  [
    "2026-10-24T02:00:00Z",
    "America/Los_Angeles",
    "2026-10-23",
    "2026-10-30",
    "2026-10-31",
    "2026-10-22",
  ],
  [
    "2026-10-24T02:00:00Z",
    "Asia/Manila",
    "2026-10-24",
    "2026-10-31",
    "2026-11-01",
    "2026-10-23",
  ],
  [
    "2026-03-06T12:00:00Z",
    "America/New_York",
    "2026-03-06",
    "2026-03-13",
    "2026-03-14",
    "2026-03-05",
  ],
  [
    "2026-10-30T12:00:00Z",
    "America/New_York",
    "2026-10-30",
    "2026-11-06",
    "2026-11-07",
    "2026-10-29",
  ],
] as const;

for (const [instant, timeZone, today, boundary, rejected, yesterday] of cases) {
  test(`API start date today/+7 and yesterday/+8: ${instant} ${timeZone}`, async (t) => {
    const app = await buildApp({
      databasePath: ":memory:",
      devAuth: true,
      clock: () => new Date(instant),
    });
    t.after(() => app.close());
    const headers = { "x-local-development": "true" };
    const url = `/api/challenge-creation?${new URLSearchParams({ timeZone })}`;
    const limits = await app.inject({ url, headers });
    assert.equal(limits.statusCode, 200);
    assert.deepEqual(limits.json(), {
      today,
      maxStartDate: boundary,
      timeZone,
    });
    assert.equal(limits.headers["cache-control"], "no-store");
    const post = (startDate: string, duration = 7) =>
      app.inject({
        method: "POST",
        url: "/api/challenges",
        headers,
        payload: { ...challengeInput, startDate, timeZone, duration },
      });
    const invalid = await post(rejected);
    assert.equal(invalid.statusCode, 422);
    assert.equal(invalid.json().error.code, "START_DATE_TOO_LATE");
    const past = await post(yesterday);
    assert.equal(past.statusCode, 422);
    assert.equal(past.json().error.code, "START_DATE_TOO_EARLY");
    assert.equal(
      (await app.inject({ url: "/api/challenges", headers })).json().total,
      0,
    );
    const valid = await post(boundary);
    assert.equal(valid.statusCode, 201);
    const saved = await app.inject({
      url: `/api/challenges/${valid.json().id}`,
      headers,
    });
    assert.equal(saved.json().startDate, boundary);
    assert.equal(saved.json().timeZone, timeZone);
    for (const duration of [1, 30]) {
      const current = await post(today, duration);
      assert.equal(current.statusCode, 201);
      assert.equal(current.json().startDate, today);
      assert.equal(current.json().duration, duration);
    }
    for (const duration of [0, 31, 1.5]) {
      assert.equal((await post(today, duration)).statusCode, 422);
    }
    const list = (await app.inject({ url: "/api/challenges", headers })).json();
    assert.equal(list.total, 3);
    assert.ok(
      list.items.every(
        (item: { startDate: string }) =>
          item.startDate !== rejected && item.startDate !== yesterday,
      ),
    );
  });
}

test("creation limits endpoint validates strict query and authentication", async (t) => {
  const app = await buildApp({ databasePath: ":memory:", devAuth: true });
  t.after(() => app.close());
  assert.equal(
    (await app.inject("/api/challenge-creation?timeZone=UTC")).statusCode,
    401,
  );
  const headers = { "x-local-development": "true" };
  for (const query of [
    "",
    "?timeZone=Invalid",
    "?timeZone=UTC&today=2099-01-01",
    "?timeZone=UTC&timeZone=UTC",
  ]) {
    const response = await app.inject({
      url: `/api/challenge-creation${query}`,
      headers,
    });
    assert.equal(response.statusCode, 422);
    assert.equal(response.json().error.code, "VALIDATION_ERROR");
  }
});

test("service enforces the boundary before storage and POST recomputes stale limits", async (t) => {
  let clock = new Date("2026-10-24T10:00:00Z");
  const repository = new ChallengeRepository(":memory:");
  t.after(() => repository.close());
  const service = new ChallengeService(repository, () => clock);
  assert.throws(
    () =>
      service.create("synthetic", {
        ...challengeInput,
        startDate: "2026-11-01",
      }),
    /не позднее/,
  );
  assert.equal(service.list("synthetic", 1, 20).total, 0);
  assert.throws(
    () =>
      service.create("synthetic", {
        ...challengeInput,
        startDate: "2026-10-06",
      }),
    /не раньше/,
  );
  assert.equal(service.list("synthetic", 1, 20).total, 0);

  const app = await buildApp({
    databasePath: ":memory:",
    devAuth: true,
    clock: () => clock,
  });
  t.after(() => app.close());
  const headers = { "x-local-development": "true" };
  const limits = (
    await app.inject({
      url: "/api/challenge-creation?timeZone=Asia%2FManila",
      headers,
    })
  ).json();
  assert.equal(limits.maxStartDate, "2026-10-31");
  clock = new Date("2026-10-23T10:00:00Z");
  const response = await app.inject({
    method: "POST",
    url: "/api/challenges",
    headers,
    payload: { ...challengeInput, startDate: limits.maxStartDate },
  });
  assert.equal(response.statusCode, 422);
  assert.equal(
    (await app.inject({ url: "/api/challenges", headers })).json().total,
    0,
  );
  clock = new Date("2026-10-25T10:00:00Z");
  const afterMidnight = await app.inject({
    method: "POST",
    url: "/api/challenges",
    headers,
    payload: { ...challengeInput, startDate: limits.today },
  });
  assert.equal(afterMidnight.statusCode, 422);
  assert.equal(afterMidnight.json().error.code, "START_DATE_TOO_EARLY");
  assert.equal(
    (await app.inject({ url: "/api/challenges", headers })).json().total,
    0,
  );
});
