import test from "node:test";
import assert from "node:assert/strict";
import {
  createChallengeSchema,
  dateSchema,
  listChallengesSchema,
} from "../shared/contracts";
import { challengeInput } from "./helpers";

test("title length is bounded after trim and text stays literal", () => {
  for (const title of ["Я", "я".repeat(80), "<b>Синтетический текст</b>"]) {
    assert.equal(
      createChallengeSchema.parse({ ...challengeInput, title: `  ${title}  ` })
        .title,
      title,
    );
  }
  assert.equal(
    createChallengeSchema.safeParse({
      ...challengeInput,
      title: "я".repeat(81),
    }).success,
    false,
  );
});

test("create requires all fields and rejects values of incorrect types", () => {
  for (const key of ["title", "startDate", "duration", "timeZone"] as const) {
    const incomplete: Record<string, unknown> = { ...challengeInput };
    delete incomplete[key];
    assert.equal(createChallengeSchema.safeParse(incomplete).success, false);
    assert.equal(
      createChallengeSchema.safeParse({ ...challengeInput, [key]: null })
        .success,
      false,
    );
  }
  for (const patch of [
    { duration: "7" },
    { title: 42 },
    { startDate: "2026-10-24T00:00:00Z" },
    { timeZone: "a".repeat(101) },
  ]) {
    assert.equal(
      createChallengeSchema.safeParse({ ...challengeInput, ...patch }).success,
      false,
    );
  }
});

test("date contract distinguishes leap years and requires padded calendar dates", () => {
  for (const date of ["2000-02-29", "2024-02-29", "2026-12-31"]) {
    assert.equal(dateSchema.parse(date), date);
  }
  for (const date of ["2100-02-29", "2026-04-31", "2026-2-03", "2026-00-01"]) {
    assert.equal(dateSchema.safeParse(date).success, false, date);
  }
});

test("list contract supplies defaults, coerces pagination and preserves archive selection", () => {
  assert.deepEqual(listChallengesSchema.parse({}), {
    page: 1,
    pageSize: 20,
    archived: false,
  });
  assert.deepEqual(
    listChallengesSchema.parse({
      page: "100000",
      pageSize: "50",
      archived: "true",
    }),
    { page: 100000, pageSize: 50, archived: true },
  );
  assert.deepEqual(
    listChallengesSchema.parse({ page: "1", pageSize: "1", archived: "false" }),
    { page: 1, pageSize: 1, archived: false },
  );
});

test("list contract rejects out-of-range, ambiguous and unknown query values", () => {
  for (const query of [
    { page: "0" },
    { page: "100001" },
    { page: "1.5" },
    { page: "no" },
    { pageSize: "0" },
    { pageSize: "51" },
    { archived: true },
    { archived: "1" },
    { archived: "TRUE" },
    { ownerId: "synthetic-other" },
  ]) {
    assert.equal(listChallengesSchema.safeParse(query).success, false);
  }
});
