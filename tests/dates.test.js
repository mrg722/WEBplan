import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { key, parse, add, startWeek, week, weekKey, weekNumber, minutesFromTime } from "../src/utils.js";

test("Oct 5–11 and Oct 12–18 have distinct local Monday boundaries", () => {
  for (const monday of [5, 12]) {
    const expected = Array.from({ length: 7 }, (_, i) => `2026-10-${String(monday + i).padStart(2, "0")}`);
    for (const date of expected) {
      assert.equal(key(parse(date)), date);
      assert.equal(key(date), date);
      assert.equal(weekKey(date), expected[0]);
      assert.equal(key(startWeek(date)), expected[0]);
      assert.deepEqual(week(date).map(key), expected);
    }
  }
  assert.equal(key(add("2026-10-11", 1)), "2026-10-12");
  assert.equal(key(add("2026-10-12", -1)), "2026-10-11");
});

test("local midnight and late Sunday remain in their own weeks", () => {
  assert.equal(weekKey(new Date(2026, 9, 11, 23, 59, 59)), "2026-10-05");
  assert.equal(weekKey(new Date(2026, 9, 12, 0, 0, 0)), "2026-10-12");
  const date = new Date(2026, 9, 11, 23, 59);
  const stamp = date.getTime();
  week(date);
  assert.equal(date.getTime(), stamp, "helpers must not mutate the selected date");
});

test("calendar arithmetic survives Chile DST and ISO year boundaries", () => {
  assert.equal(key(add("2026-09-05", 1)), "2026-09-06");
  assert.equal(key(add("2026-09-06", 1)), "2026-09-07");
  assert.equal(weekKey("2026-01-01"), "2025-12-29");
  assert.equal(weekNumber("2026-10-05"), 41);
  assert.equal(weekNumber("2026-10-12"), 42);
  assert.equal(weekNumber("2027-01-01"), 53);
});

test("calendar string operations agree in Santiago, UTC and Auckland", () => {
  const moduleURL = new URL("../src/utils.js", import.meta.url).href;
  for (const TZ of ["America/Santiago", "UTC", "Pacific/Auckland"]) {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import assert from 'node:assert/strict';
      import { key, add, week, weekKey, weekNumber } from ${JSON.stringify(moduleURL)};
      assert.equal(key('2026-10-05'), '2026-10-05');
      assert.equal(weekKey('2026-10-11'), '2026-10-05');
      assert.equal(weekKey('2026-10-12'), '2026-10-12');
      assert.deepEqual(week('2026-10-12').map(key), ['2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-17','2026-10-18']);
      assert.equal(key(add('2026-09-05', 1)), '2026-09-06');
      assert.equal(weekNumber('2026-10-05'), 41);
    `], { env: { ...process.env, TZ }, encoding: "utf8" });
    assert.equal(result.status, 0, `${TZ}: ${result.stderr}`);
  }
});

test("reminder time parsing rejects impossible clock times", () => {
  assert.equal(minutesFromTime("00:00"), 0);
  assert.equal(minutesFromTime("23:59"), 1439);
  for (const value of ["24:00", "12:60", "-1:00", "12:", "12:30:00", "", "noon"]) {
    assert.equal(minutesFromTime(value), null, value);
  }
});
