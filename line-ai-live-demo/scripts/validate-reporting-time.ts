import { getPreviousTaipeiDate, getTaipeiDateRange, isTaipeiNight } from "../src/lib/reporting-time";

type TestCase = {
  actual: unknown;
  expected: unknown;
  name: string;
};

const range = getTaipeiDateRange("2026-07-12");
const cases: TestCase[] = [
  {
    name: "Taipei day starts at the matching UTC boundary",
    actual: range.start,
    expected: "2026-07-11T16:00:00.000Z",
  },
  {
    name: "Taipei day ends 24 hours later",
    actual: range.end,
    expected: "2026-07-12T16:00:00.000Z",
  },
  { name: "night includes 21:00 Taipei", actual: isTaipeiNight("2026-07-12T13:00:00.000Z"), expected: true },
  { name: "night excludes 09:00 Taipei", actual: isTaipeiNight("2026-07-12T01:00:00.000Z"), expected: false },
  {
    name: "previous date respects Taipei timezone",
    actual: getPreviousTaipeiDate(new Date("2026-07-12T16:30:00.000Z")),
    expected: "2026-07-12",
  },
];

let failed = false;
for (const testCase of cases) {
  if (testCase.actual !== testCase.expected) {
    failed = true;
    console.error(`FAIL ${testCase.name}: expected ${testCase.expected}, got ${testCase.actual}`);
  } else {
    console.log(`PASS ${testCase.name}`);
  }
}

if (failed) {
  process.exitCode = 1;
}
