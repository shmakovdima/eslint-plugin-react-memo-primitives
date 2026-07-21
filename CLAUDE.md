# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An npm workspaces monorepo providing the same two lint rules for three different linters:

- `packages/eslint-plugin-react-memo-primitives` — ESLint plugin (legacy `.eslintrc` config +
  ESLint 9 flat config, exported from the same package).
- `packages/biome-plugin-react-memo-primitives` — [Biome](https://biomejs.dev) GritQL plugins
  (`.grit` files, no JS).
- `packages/oxlint-plugin-react-memo-primitives` — [oxlint](https://oxc.rs) JS plugin, using the
  official `@oxlint/plugins` helper (`definePlugin`/`defineRule`) with an ESLint-compatible
  `create(context)` visitor API.

Each package is published independently to npm; there's no shared build step and no cross-package
imports — the ESLint and oxlint packages each keep their own local copy of the AST-walking helpers
(`utils.js`/`lib/utils.js`) rather than sharing a package, since they're published separately and
the logic is small.

## The two rules (implemented identically in all three packages)

1. **require-memo-primitives** — a functional component (arrow function, function expression, or
   function declaration) that returns JSX and destructures a single object parameter made up
   entirely of primitive-looking props must be wrapped in `memo(...)` or `React.memo(...)`.
2. **no-unnecessary-memo** — a component wrapped in `memo(...)` / `React.memo(...)` that takes no
   props (no parameters, or an empty `{}` destructure) shouldn't be memoized.

None of the three linter APIs expose real TypeScript type information to a lint rule, so
"primitive prop" is approximated structurally in all three, not via a type check — see each
package's section below for the exact heuristic (they differ between ESLint/oxlint and Biome).

`memo` detection recognizes both a bare `memo(...)` call (`import { memo } from 'react'`) and
`React.memo(...)` (member expression) — keep both forms in sync across all three implementations
when changing detection logic.

**Import-source verification** (all three packages, since 1.1.0): a bare `memo`/`React` identifier
is only trusted as real memoization if there's no import statement in the file that provably binds
that name to something other than `'react'`. No import info at all (isolated snippets, globals)
falls back to trusting the name — this preserves the pre-1.1.0 behavior for the common case and
only rejects a _provable_ shadow (`import { memo } from 'some-other-lib'`). In ESLint/oxlint,
`getReactImportBindings()` in `utils.js` walks `Program.body` for `ImportDeclaration`s once per
file and returns a `shadowedNames` Set consulted by `isMemoCallExpression`. A separate, purely
structural `looksLikeMemoCallExpression()` (no import awareness) still decides whether
`getFunctionAndDeclarator` unwraps a `CallExpression` wrapper at all — without it, a shadowed
`memo(...)` call would be skipped entirely as an "unrecognized component shape" instead of being
correctly treated as _not_ memoized (this was a real regression caught by the RuleTester/fixture
suite while first implementing the feature: `require-memo-primitives` silently stopped flagging
shadowed-memo components instead of catching them). In Biome/GritQL, the same check is expressed
via `not $program <: contains \`import { memo } from $source\` where { $source <: not \`'react'\` }`
(`$program`is Biome's implicit metavariable for the file root) —`require-memo-primitives.grit`additionally needs dedicated`or`alternatives for the shadowed-memo-wrapped shape (mirroring the`looksLikeMemoCallExpression`split above), since its other alternatives structurally exclude any`memo(...)`-wrapped call by design.

**Gotcha when walking up from the function node to find the enclosing declarator**: a
memo-wrapped component's function node's _direct_ parent is the `memo(...)` `CallExpression`, not
the `VariableDeclarator` — `const Foo = memo((props) => ...)` puts a CallExpression between the
declarator and the arrow function. The ESLint and oxlint `utils.js`/`lib/utils.js`
`getFunctionAndDeclarator()` helpers unwrap one extra level for this case (check `parent.type ===
'CallExpression' && isMemoCallExpression(parent)` before falling back to the direct-declarator
check). Getting this wrong silently breaks `no-unnecessary-memo` (whose entire job is to inspect
memo-wrapped components) rather than throwing — it was found via a RuleTester failure, not a
compile error, so if either rule seems to silently no-op on a memo-wrapped case, check this first.

## Working in each package

### `packages/eslint-plugin-react-memo-primitives`

Plain CommonJS, no build step. `lib/utils.js` holds the shared AST-walking helpers
(`returnsJsx`, `getFunctionAndDeclarator`, `hasOnlyPrimitiveProps`, `isWrappedInMemo`, etc.);
`lib/rules/*.js` are thin rule definitions built on top of those helpers. `lib/index.js` exports
both `configs.recommended` (legacy) and `configs['flat/recommended']` (ESLint 9 flat config array)
from the same plugin object. "Primitive prop" is a naming heuristic: a destructured prop counts
as primitive if its local binding is a plain identifier starting with a lowercase letter and
isn't literally named `props`. Tests: `test/*.test.js`, using ESLint's `RuleTester`, run via
`npm test` (`node --test test/`).

### `packages/biome-plugin-react-memo-primitives`

Two standalone `.grit` files (`require-memo-primitives.grit`, `no-unnecessary-memo.grit`), no JS,
registered via `biome.jsonc`'s `plugins` array. GritQL is purely structural — no type inference —
and its primitive-prop check here is coarser than the ESLint version: it only checks that the
parameter destructures into an object pattern at all (`JsObjectBindingPattern`), without
inspecting property names or excluding nested object/array sub-patterns.

Hard-won GritQL syntax notes (Biome 2.5.4 — re-verify against the installed version if these stop
working, since the docs themselves warn the grammar changes between releases):

- **Node-kind matchers are PascalCase Biome-internal names** (`JsObjectBindingPattern()`,
  `JsArrayBindingPattern()`, `JsxTagExpression()` — the last one covers `jsx_element`,
  `jsx_fragment`, and self-closing JSX all at once), not the snake_case tree-sitter-style names
  the top-level docs prose implies (`object_pattern()` etc. do not compile). Find real names via
  the Biome Playground's "Syntax" tab, or the `.ungram` grammar files in
  `biomejs/biome`'s `xtask/codegen/`.
- A bare metavariable inside object-pattern braces (`` `({ $props }) => ...` ``) does **not**
  act as an arity wildcard for "one or more properties" — it silently matches nothing. Bind the
  whole parameter to a metavariable in the outer snippet instead, then filter with `<: contains
JsObjectBindingPattern()` in a `where` clause.
- `contains` with a nested `or` of multiple conditions (`$x <: contains or { a, b }`, or `or { $x
<: contains a, $x <: contains b }` nested inside an outer `where`) reliably fails to compile
  once there's more than one branch — this looks like a real parser bug, not a documented
  restriction. Work around it by duplicating the whole top-level pattern once per alternative
  (see `no-unnecessary-memo.grit`'s 8-branch `or`) instead of nesting `or` inside a `where`.
- `$x <: not contains SomeKind()` where `$x` was itself bound via `contains SomeKind() as $x` is
  always false (the node trivially "contains" itself) — this compiles cleanly but silently
  matches nothing, no error. If you need "no other instance of X inside this subtree," this naive
  form doesn't express it; no working alternative was found for this repo's needs, so
  `require-memo-primitives.grit` just accepts the coarser "any object pattern" check instead (see
  its file comment).
- Config `plugins` paths resolve relative to the config file's own directory — a temp config
  written into a nested `test/fixtures/` dir with a `../foo.grit` reference fails with `Cannot
read file`; the config must sit next to the `.grit` files.
- Diagnostic CLI output goes to **stderr**, not stdout, when `biome lint` exits non-zero — a
  naive `execFileSync` wrapper that only reads `err.stdout` on failure gets an empty string.

Tests: `test/run.js` shells out to the local `biome` binary against fixtures in `test/fixtures/`
(one file per rule, `// expect-error:` / `// expect-ok:` comments mark expected lines) and diffs
expected vs. actual diagnostic line numbers — there's no `RuleTester`-equivalent for GritQL, so
this is the only way to actually validate `.grit` syntax compiles and matches as intended. Run
via `npm test` (`node test/run.js`).

### `packages/oxlint-plugin-react-memo-primitives`

Plain CommonJS using `@oxlint/plugins`' `definePlugin`/`defineRule`. `utils.js` mirrors the
ESLint package's helpers (kept as a separate copy, not shared) and uses the same naming
heuristic. oxlint's JS plugin API is **alpha and not covered by semver** — expect breaking
changes on oxlint upgrades; `@oxlint/plugins` and `oxlint` are versioned in lockstep (both
tracked at the same `^1.x` release). oxlint JS plugins have no access to type information
(type-aware linting is native-Rust-only in oxlint).

Local dev note: oxlint's native binding is an optional dependency
(`@oxlint/binding-darwin-arm64` etc.) that can fail to install due to a known npm bug
(npm/cli#4828) even after a clean `rm -rf node_modules package-lock.json && npm install` — if
`oxlint --version` throws "Cannot find native binding," install the platform package directly
(e.g. `npm install @oxlint/binding-darwin-arm64@<version> --save-optional`).

Tests: `test/run.js` shells out to the local `oxlint` binary (`--format=json`) against fixtures
in `test/fixtures/`, same `expect-error`/`expect-ok` convention as the Biome package. Run via
`npm test` (`node test/run.js`).

## Repo-wide notes

- `npm test` at the root runs every package's test suite (`npm test --workspaces --if-present`).
  Each package tests against the real linter binary/API it targets, not a shared harness.
- When changing rule _behavior_ (not just one implementation), update all three packages plus
  their READMEs and tests — they're independent packages, so nothing enforces staying in sync.
