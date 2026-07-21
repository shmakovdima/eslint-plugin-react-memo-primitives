# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An npm workspaces monorepo providing the same three lint rules for three different linters:

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

## The three rules (implemented identically in all three packages)

1. **require-memo-primitives** — bidirectional, since 1.2.0: a functional component (arrow
   function, function expression, or function declaration) that returns JSX and destructures a
   single object parameter is checked for whether **all** its props are primitive.
   - All-primitive + NOT wrapped in `memo(...)`/`React.memo(...)` → flagged as missing memo (the
     pre-1.2.0 behavior).
   - NOT all-primitive (at least one prop is an object, function, ref, or other unresolvable
     type) + wrapped in `memo(...)`/`React.memo(...)` → flagged as unnecessary/harmful memo (new
     in 1.2.0) — a non-primitive prop can still change identity every render, so memo buys
     nothing. Before 1.2.0 this direction silently passed (mixed-prop components just weren't
     required to have memo; wrapping one in memo anyway was never itself an error).
2. **no-unnecessary-memo** — a component wrapped in `memo(...)` / `React.memo(...)` that takes no
   props (no parameters, or an empty `{}` destructure) shouldn't be memoized.
3. **require-memo-displayname** (new in 1.2.0) — a component wrapped in `memo(...)` /
   `React.memo(...)` must have a `Foo.displayName = "..."` assignment for its name, written as a
   direct top-level statement in the file (an assignment nested inside another function/block
   isn't recognized). `hasDisplayNameAssignment(programNode, componentName)` in
   ESLint/oxlint's `utils.js` walks `Program.body` for a top-level `ExpressionStatement` wrapping
   an `AssignmentExpression` whose left side is `componentName.displayName`; Biome's
   `require-memo-displayname.grit` expresses the same check via `` not $program <: contains
`$name.displayName = $dn` `` (reusing `$name`, bound by the outer component pattern, as a join
   key against the whole file — no self-containment issue here since `$program` is a genuinely
   separate part of the tree from `$name`'s own declaration).

None of the three linter APIs expose a real TypeScript type _checker_ to a lint rule (no
cross-file type resolution), but as of 1.2.0 all three read a component's actual TS type
_syntax_ when it's present, instead of guessing from the destructured binding's name. A prop's
declared type is classified as primitive/non-primitive as follows:

- **Always primitive**: `string`/`number`/`boolean`/`bigint`/`null`/`undefined`/`void`, a literal
  type, a template literal type, or a union/intersection of only those.
- **Always non-primitive**: an object type (`TsObjectType`/`TSTypeLiteral`), a function type
  (`TsFunctionType`/`TSFunctionType`), an array type (`TsArrayType`/`TSArrayType`), a tuple type
  (`TsTupleType`/`TSTupleType`), or a mapped type (`TsMappedType`/`TSMappedType`) — collections and
  functions are never primitive even when their contents are (an array of strings is still an
  object by identity).
- **A named type reference** (`TsReferenceType`/`TSTypeReference`, e.g. `LocaleType`,
  `MutableRefObject<T>`) is resolved against local declarations in the same file, in order of
  priority: a local `enum` (`TSEnumDeclaration`/`TsEnumDeclaration`) is always primitive (TS enums
  compile to string/number values); a local `interface`/object-shaped `type` alias is non-primitive
  (object shape); a local `type` alias to a non-object type (e.g. `type ID = string | number`) is
  unwrapped and its RHS is classified recursively. **If the reference can't be resolved in this
  file at all** (imported type, global, generic type parameter — the common real-world case, e.g.
  an enum imported from a shared types file), it falls back to a structural signal instead of a
  blanket default: a reference **with type arguments** (`MutableRefObject<T>`, `Promise<T>`,
  `Record<K, V>`) is always non-primitive (no real primitive type takes type arguments), while a
  **bare** reference with no type arguments (`LocaleType`, `Status`) is trusted as primitive — this
  is deliberately optimistic (an imported object-shaped type alias with no generics would be
  misclassified as primitive) but fixes the common case of enums/simple aliases imported from a
  shared types file. **This exact trade-off was hardened through two real false-positive reports
  in production use**, not just designed upfront — see the extensive regression coverage in each
  package's tests for the full sweep of cases (enum, imported bare reference, generic reference,
  nested object alias, array, tuple, mapped type, JSX.Element as a qualified-name reference,
  destructuring default values).
- Destructuring a prop with a **default value** (`{ variant = 'trade' }`) represents the binding
  as `Property.value.type === "AssignmentPattern"` (`value.left` is the real binding) in
  ESLint/oxlint's ASTs — unwrap it before checking the binding shape, or every prop with a default
  value gets misclassified as non-primitive regardless of its actual type. GritQL's
  `JsObjectBindingPattern` structural matcher handles default values natively, no equivalent fix
  needed in the Biome package.
- When there's no type annotation at all (plain JS/JSX), all three fall back to the pre-1.2.0
  naming heuristic (lowercase first letter, not literally `props`) — see each package's section
  below for how each reads TS type syntax, and for Biome's narrower coverage (GritQL can't reliably
  resolve a bare reference to a local declaration when there's more than one prop — see that
  section).

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
(`returnsJsx`, `getFunctionAndDeclarator`, `hasOnlyPrimitiveProps`, `isWrappedInMemo`,
`hasDisplayNameAssignment`, etc.); `lib/rules/*.js` (one file per rule, including
`require-memo-displayname.js`) are thin rule definitions built on top of those helpers.
`lib/index.js` exports both `configs.recommended` (legacy) and `configs['flat/recommended']`
(ESLint 9 flat config array) from the same plugin object, and registers all three rules.

`hasOnlyPrimitiveProps(objectPattern, programNode)` (since 1.2.0) reads the object pattern's TS
`typeAnnotation` (present when parsed with `@typescript-eslint/parser`, a `dependencies` entry so
consumers get it transitively): a `TSTypeLiteral` is used directly, a `TSTypeReference` is
resolved to a same-file `TSInterfaceDeclaration`/`TSTypeAliasDeclaration` by name via
`resolveLocalTypeMembers()`. Each member's type is classified by `isPrimitiveTsType()` per the
rules in the section above — `PRIMITIVE_TS_TYPE_KINDS`/`NON_PRIMITIVE_TS_TYPE_KINDS` Sets list the
always-primitive/always-non-primitive node kinds explicitly (rather than relying on a fallthrough
default) specifically so a future edit can't silently misclassify one without a test catching it;
`resolveLocalTypeDeclaration()` handles the `enum`/object-alias/primitive-alias/unresolvable-name
resolution, returning a discriminated `{ kind: ... }` result so callers can tell "resolved to this
shape" apart from "not declared in this file." When there's no type annotation, `hasOnlyPrimitiveNames()`
— the original lowercase-first-letter/not-literally-`props` naming heuristic — is used as a
fallback for that property, preserving pre-1.2.0 behavior for plain JS/JSX; both this function and
`hasOnlyPrimitiveProps` unwrap a `Property.value.type === "AssignmentPattern"` (a destructured
default value, e.g. `{ variant = 'trade' }`) to its `.left` binding before checking the shape —
without this, every prop with a default value is misclassified as non-primitive regardless of its
actual type. Regression coverage lives in `test/require-memo-primitives.test.js`'s `tsRuleTester`
blocks (a second `RuleTester` configured with `@typescript-eslint/parser`), including every false
positive/negative actually reported in production use: a `MutableRefObject<T>` ref alongside
primitive props (must NOT require memo unwrapped, must actively flag memo when wrapped); a bare
unresolved `LocaleType` reference with a defaulted sibling prop (must require memo); an array
member + a `JSX.Element` union member (must NOT require memo); a local `enum` and a local
primitive type alias (must require memo); a local object-shaped type alias member and a tuple
type (must NOT require memo). Tests: `test/*.test.js`, using ESLint's `RuleTester`, run via
`npm test` (`node --test test/`).

### `packages/biome-plugin-react-memo-primitives`

Three standalone `.grit` files (`require-memo-primitives.grit`, `no-unnecessary-memo.grit`,
`require-memo-displayname.grit`), no JS, registered via `biome.jsonc`'s `plugins` array. Since
GritQL requires exactly one top-level pattern per file, `require-memo-primitives.grit`'s two
directions (missing-memo and unnecessary-memo-on-non-primitive) both live inside one top-level
`or`, each alternative doing its own `register_diagnostic` with its own message — see the file's
comment for why (this is also what a per-file, single-top-level-pattern GritQL file requires in
general: two logically distinct checks that need separate diagnostics can't be split into two
top-level patterns in the same `.grit` file, confirmed by a compile error when tried). GritQL has
no type _checker_, but it does parse TS syntax, and since 1.2.0 `require-memo-primitives.grit`
reads it: when the destructured parameter has a TS type annotation (inline `TsObjectType`
literal, or a `` `: $typename` `` reference resolved to a same-file `` `type $typename =
$typebody` `` by reusing the metavariable name as a join key), each member is rejected as
non-primitive if its own `` `: $member` `` annotation contains, anywhere in it: `TsObjectType`
(nested object shape), `TsFunctionType`, `TsArrayType`, `TsTupleType`, `TsMappedType`, or a
`TsReferenceType` that itself contains `TsTypeArguments` (a generic instantiation, e.g.
`MutableRefObject<T>` — a bare reference with no type arguments, e.g. `LocaleType`, is trusted as
primitive; see the file comment and the primitive-detection section above for why). With no type
annotation at all (plain JS/JSX), it falls back to the pre-1.2.0 coarse check: any destructured
object pattern at all (`JsObjectBindingPattern`) counts as primitive-props, with no per-property
inspection. GritQL's `JsObjectBindingPattern` matches a destructure with a default value
(`{ variant = 'trade' }`) natively — no equivalent to ESLint's `AssignmentPattern`-unwrap fix was
needed here.

**Known gap, not fixed**: unlike ESLint/oxlint, this package does **not** attempt to resolve a
bare `TsReferenceType` member to a local `enum`/`interface`/`type` declaration by name (e.g.
`status: Status` where `enum Status {...}` is declared in the same file) — it always trusts a bare
unresolvable-looking reference as primitive regardless of whether it happens to match a local
declaration. This is a deliberate simplification, not an oversight: attempting it surfaced a
previously-undocumented GritQL bug (see syntax notes below) where resolving an arbitrary member's
type name via a join key is order-dependent and silently fails when the resolving member isn't
the first one Biome's `contains` happens to structurally match. A locally-declared mapped/array
type referenced by name (not inline) can therefore slip through as "trusted primitive" in this
package specifically — see README limitations.

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
  matches nothing, no error. **Found a working alternative for this** (used in 1.2.0's per-member
  primitive check): never test `not $typebody <: contains TsObjectType()` when `$typebody` is
  itself a `TsObjectType` (the type-literal wrapper for the whole props type). Instead, first
  narrow to each _member's own_ annotation via `` $typebody <: contains `: $member` ``, then test
  `not $member <: contains TsObjectType()` — `$member` is a proper descendant of `$typebody`, not
  `$typebody` itself, so the self-containment trap doesn't apply. This is also why three separate
  `not $typebody <: contains Kind()` clauses for three different `Kind`s in the same `where` can
  silently compile to zero matches even when each one works in isolation — always scope the
  `contains` check to the narrowest sub-pattern that could actually match the excluded kind, not
  to a variable that might BE that kind.
- `TsObjectType()`, `TsFunctionType()`, `TsReferenceType()`, `TsArrayType()`, `TsTupleType()`,
  `TsMappedType()`, `TsTypeArguments()`, `TsEnumDeclaration()` are the real TS type-node kind
  names (verified by probing with `register_diagnostic` against known snippets — same "PascalCase
  Biome-internal name, not the docs' snake_case" gotcha as the JS node kinds above applies to TS
  nodes too). **Correction to an earlier version of this doc**: the primitive-keyword names are
  `TsStringType()`/`TsNumberType()`/`TsBooleanType()`/`TsUndefinedType()`/`TsVoidType()`/
  `TsBigintType()`/`TsAnyType()`/`TsTemplateLiteralType()` (suffix `Type`, not the previously
  (incorrectly) documented `Keyword`) — `TsStringKeyword()` etc. fail to compile. `TsNullType()`
  and `TsLiteralType()` (any spelling tried) also fail to compile — no working name was found for
  these two; they were never actually needed in the shipped `.grit` files since this package only
  ever checks for non-primitive kinds by name (object/function/array/tuple/mapped/reference), never
  asserts a primitive kind by name, so this gap doesn't block anything currently implemented.
- **`contains` binds to the first structural match in source order and does not backtrack** if a
  later `where` clause fails to join against that specific match — confirmed by testing ``$typebody
<: contains `: $membertype` where { $program <: contains `type $membertype = $resolved` }``
  against a type with two members where only the _second_ member's type name resolves locally:
  the pattern fails to match at all, because `contains` grabs the _first_ member (`$membertype`
  bound to the first member's type, e.g. `string`) and the `where` join against that fails — it
  never retries against the second member even though the whole pattern would succeed if member
  order were reversed. Reordering the members in the fixture changes whether the pattern matches,
  which is the tell. This means "resolve any member's type name against a local declaration" is
  NOT reliably expressible in GritQL when a type has more than one member — this is why
  `require-memo-primitives.grit` doesn't attempt to resolve a bare reference to a local
  declaration at all (see the package section above); it only handles structural
  array/tuple/mapped/generic-reference checks, which don't need this kind of resolution.
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
ESLint package's helpers (kept as a separate copy, not shared). oxlint's JS plugin API is
**alpha and not covered by semver** — expect breaking changes on oxlint upgrades; `@oxlint/plugins`
and `oxlint` are versioned in lockstep (both tracked at the same `^1.x` release). oxlint JS
plugins have no access to a type _checker_ (type-aware linting is native-Rust-only in oxlint) —
but oxc parses `.tsx` natively and hands the JS plugin API a typescript-estree-compatible AST
(verified by probing: same node names as `@typescript-eslint` — `TSTypeAliasDeclaration`,
`TSTypeLiteral`, `TSPropertySignature`, `TSTypeReference`, `TSUnionType`, `TSFunctionType`, etc.,
including `ObjectPattern.typeAnnotation.typeAnnotation`). So since 1.2.0,
`hasOnlyPrimitiveProps(objectPattern, programNode)` in `utils.js` runs the exact same
type-annotation-reading logic as the ESLint package's `lib/utils.js` (same helper names:
`isPrimitiveTsType`, `resolveLocalTypeMembers`, `getObjectPatternMemberTypes`,
`hasOnlyPrimitiveNames` fallback, `hasDisplayNameAssignment`) — copy changes to one into the other
when touching this logic. `index.js` defines all three rules inline (no `rules/*.js` split like
the ESLint package) and registers them in one `definePlugin({ rules: {...} })` call.

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
