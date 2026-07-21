"use strict";

// Runs the local `oxlint` binary against each fixture with only the rule under test enabled,
// and checks that diagnostics land on exactly the lines marked `// expect-error: ...` in the
// fixture (the line directly above the flagged declaration). No test framework — oxlint's JS
// plugin API can only be validated by actually running the oxlint binary.

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_DIR = path.join(__dirname, "..");
const FIXTURES_DIR = path.join(__dirname, "fixtures");
const OXLINT_BIN = path.join(
  PACKAGE_DIR,
  "..",
  "..",
  "node_modules",
  ".bin",
  "oxlint",
);

const CASES = [
  { rule: "require-memo-primitives", fixture: "require-memo-primitives.tsx" },
  { rule: "no-unnecessary-memo", fixture: "no-unnecessary-memo.tsx" },
  {
    rule: "require-memo-primitives",
    fixture: "require-memo-primitives-shadowed-import.tsx",
  },
  {
    rule: "no-unnecessary-memo",
    fixture: "no-unnecessary-memo-shadowed-import.tsx",
  },
  {
    rule: "require-memo-primitives",
    fixture: "require-memo-primitives-real-import.tsx",
  },
  {
    rule: "require-memo-displayname",
    fixture: "require-memo-displayname.tsx",
  },
];

function expectedErrorLines(fixturePath) {
  const lines = fs.readFileSync(fixturePath, "utf8").split("\n");
  const expected = new Set();
  lines.forEach((line, i) => {
    if (line.includes("expect-error")) {
      // The diagnostic lands on the declaration line, one line below the comment.
      expected.add(i + 2);
    }
  });
  return expected;
}

function actualErrorLines(configPath, fixturePath, ruleCode) {
  let output;
  try {
    output = execFileSync(
      OXLINT_BIN,
      ["--config", configPath, "--format=json", fixturePath],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (err) {
    output = err.stdout || "";
  }
  const parsed = JSON.parse(output);
  const lines = new Set();
  for (const diagnostic of parsed.diagnostics) {
    if (diagnostic.code !== `react-memo-primitives(${ruleCode})`) continue;
    for (const label of diagnostic.labels) {
      if (label.span?.line) lines.add(label.span.line);
    }
  }
  return lines;
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const item of a) if (!b.has(item)) return false;
  return true;
}

let failed = 0;

for (const { rule, fixture } of CASES) {
  const fixturePath = path.join(FIXTURES_DIR, fixture);
  const configPath = path.join(PACKAGE_DIR, `.oxlintrc-test-${rule}.json`);
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      jsPlugins: ["./index.js"],
      rules: {
        [`react-memo-primitives/${rule}`]: "error",
      },
    }),
  );

  const expected = expectedErrorLines(fixturePath);
  const actual = actualErrorLines(configPath, fixturePath, rule);
  fs.unlinkSync(configPath);

  const pass = setsEqual(expected, actual);
  console.log(`${pass ? "PASS" : "FAIL"} - ${rule} against ${fixture}`);
  if (!pass) {
    failed++;
    console.log(
      "  expected diagnostic lines:",
      [...expected].sort((a, b) => a - b),
    );
    console.log(
      "  actual diagnostic lines:  ",
      [...actual].sort((a, b) => a - b),
    );
  }
}

if (failed > 0) {
  console.log(`\n${failed} case(s) failed.`);
  process.exit(1);
} else {
  console.log(`\nAll ${CASES.length} case(s) passed.`);
}
