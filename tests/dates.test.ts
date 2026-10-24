import test from "node:test";
import assert from "node:assert/strict";
import { addDays, todayInZone } from "../shared/dates";

test("calendar addition handles reverse boundaries, century leap rules and zero", () => {
  const cases = [
    ["2026-01-01", -1, "2025-12-31"],
    ["2024-03-01", -1, "2024-02-29"],
    ["2100-02-28", 1, "2100-03-01"],
    ["2000-02-28", 2, "2000-03-01"],
    ["2026-10-24", 0, "2026-10-24"],
    ["2026-12-15", 30, "2027-01-14"],
  ] as const;
  for (const [date, shift, expected] of cases) {
    assert.equal(addDays(date, shift), expected, `${date} + ${shift}`);
  }
});

test("local today changes exactly at midnight in positive and negative zones", () => {
  for (const [zone, before, boundary, yesterday, today] of [
    [
      "Asia/Manila",
      "2026-10-23T15:59:59.999Z",
      "2026-10-23T16:00:00.000Z",
      "2026-10-23",
      "2026-10-24",
    ],
    [
      "America/Los_Angeles",
      "2026-10-24T06:59:59.999Z",
      "2026-10-24T07:00:00.000Z",
      "2026-10-23",
      "2026-10-24",
    ],
    [
      "Pacific/Kiritimati",
      "2026-12-31T09:59:59.999Z",
      "2026-12-31T10:00:00.000Z",
      "2026-12-31",
      "2027-01-01",
    ],
  ]) {
    assert.equal(todayInZone(zone, new Date(before)), yesterday);
    assert.equal(todayInZone(zone, new Date(boundary)), today);
  }
});

test("DST clock jumps do not change the local calendar day", () => {
  for (const [before, after, expected] of [
    ["2026-03-08T06:59:59Z", "2026-03-08T07:00:00Z", "2026-03-08"],
    ["2026-11-01T05:59:59Z", "2026-11-01T06:00:00Z", "2026-11-01"],
  ]) {
    assert.equal(todayInZone("America/New_York", new Date(before)), expected);
    assert.equal(todayInZone("America/New_York", new Date(after)), expected);
  }
});
