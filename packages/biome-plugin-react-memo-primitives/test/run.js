"use strict";

// Runs the local `biome` binary against each fixture with only this package's plugins enabled,
// and checks that diagnostics land on exactly the lines marked `// expect-error: ...` in the
// fixture (the line directly above the flagged declaration). No test framework — this just
// shells out to Biome, which is the only thing that can actually validate GritQL syntax.

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_DIR = path.join(__dirname, "..");
const FIXTURES_DIR = path.join(__dirname, "fixtures");
const BIOME_BIN = path.join(
  PACKAGE_DIR,
  "..",
  "..",
  "node_modules",
  ".bin",
  "biome",
);

const CASES = [
  {
    plugin: "require-memo-primitives.grit",
    fixture: "require-memo-primitives.tsx",
  },
  { plugin: "no-unnecessary-memo.grit", fixture: "no-unnecessary-memo.tsx" },
  {
    plugin: "require-memo-primitives.grit",
    fixture: "require-memo-primitives-shadowed-import.tsx",
  },
  {
    plugin: "no-unnecessary-memo.grit",
    fixture: "no-unnecessary-memo-shadowed-import.tsx",
  },
  {
    plugin: "require-memo-primitives.grit",
    fixture: "require-memo-primitives-real-import.tsx",
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

function actualErrorLines(configPath, fixturePath) {
  let output;
  try {
    output = execFileSync(
      BIOME_BIN,
      ["lint", `--config-path=${configPath}`, fixturePath],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (err) {
    // biome exits non-zero when it finds lint errors — that's expected. Biome writes
    // diagnostics to stderr, not stdout.
    output = `${err.stdout || ""}${err.stderr || ""}`;
  }
  const lines = new Set();
  const fixtureBasename = path
    .basename(fixturePath)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${fixtureBasename}:(\\d+):\\d+ plugin `);
  for (const line of output.split("\n")) {
    const match = re.exec(line);
    if (match) lines.add(Number(match[1]));
  }
  return lines;
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const item of a) if (!b.has(item)) return false;
  return true;
}

let failed = 0;

for (const { plugin, fixture } of CASES) {
  const fixturePath = path.join(FIXTURES_DIR, fixture);
  // Biome resolves a plugin's relative path against the config file's own directory, so the
  // temp config has to live next to the .grit files (the package root), not inside fixtures/.
  const configPath = path.join(PACKAGE_DIR, `.biome-test-${plugin}.jsonc`);
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      $schema: "https://biomejs.dev/schemas/2.5.0/schema.json",
      plugins: [`./${plugin}`],
    }),
  );

  const expected = expectedErrorLines(fixturePath);
  const actual = actualErrorLines(configPath, fixturePath);
  fs.unlinkSync(configPath);

  const pass = setsEqual(expected, actual);
  console.log(`${pass ? "PASS" : "FAIL"} - ${plugin} against ${fixture}`);
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
