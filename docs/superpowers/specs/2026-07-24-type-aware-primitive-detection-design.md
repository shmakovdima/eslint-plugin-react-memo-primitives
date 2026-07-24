# Type-aware primitive detection for imported types (ESLint package)

## Problem

`require-memo-primitives`'s current TS-syntax-based classification (documented in `CLAUDE.md`)
can only resolve type references declared in the _same file_. For any reference it can't resolve
locally — most commonly an imported type — it falls back to a structural heuristic: a bare
reference with no type arguments (`LocaleType`, `DehydratedState`, `CoinPercentage`) is
_optimistically trusted as primitive_.

This is documented as a deliberate trade-off, but it's wrong whenever the imported bare reference
is actually an object type. Real example that triggered this work:

```ts
type Props = {
  coinPercentage: CoinPercentage;
  dehydratedState?: DehydratedState;
  locale: LocaleType;
};

export const EtfPage = ({ coinPercentage, dehydratedState, locale }: Props) => {
```

`DehydratedState` (from `@tanstack/react-query`) is an object type. The heuristic can't tell it
apart from `LocaleType` (a primitive alias), so it guesses "primitive" for both — sometimes
right, sometimes wrong, with no way to know which from AST alone.

## Goal

When project type information is actually available to the linter (the user has configured
`parserOptions.project`, i.e. standard type-aware ESLint), stop guessing — ask the real
TypeScript checker what the type actually is, for every type reference, not just unresolvable
ones. This fixes both false positives and false negatives the heuristic can produce, for both
local and imported types.

## Scope

**ESLint package only.** oxlint's JS plugin API has no type-checker access at all (native-Rust
only); Biome's GritQL has no type checker access either. Both keep the existing AST/heuristic
behavior; this is now a documented capability gap between packages (ESLint can do more when the
consumer opts in via `parserOptions.project`).

## Design

### Opt-in mechanism: automatic capability detection, not a rule option

Type-aware mode activates automatically when `context.sourceCode.parserServices` (or the legacy
`context.parserServices`) exposes a `program` (a real `ts.Program`) and
`esTreeNodeToTSNodeMap` — i.e. whenever the consumer's own ESLint config already sets
`parserOptions.project` for type-aware linting (the standard typescript-eslint convention). No
new rule option, no new config surface. If those aren't present, every function falls back to
today's exact AST-only behavior — zero behavior change for non-type-aware consumers.

### Checker-based classification

New helpers in `lib/utils.js`:

- `getParserServices(context)` — returns `{ program, checker, esTreeNodeToTSNodeMap } | null`.
  Wraps the parserServices lookup + the two capability checks above.
- `isPrimitiveByChecker(tsNode, checker)` — calls `checker.getTypeAtLocation(tsNode)`, then
  recursively classifies: for a union/intersection type, _all_ constituent types must be
  primitive (recurse into `type.types`); for everything else, check `type.flags` against the
  primitive `ts.TypeFlags` bitmask (`String | Number | Boolean | BigInt | Null | Undefined |
VoidLike | EnumLiteral | Literal` families). Any `Object`-flagged type (interfaces, type
  literals, arrays, tuples, function types, mapped types, class instances) is non-primitive,
  matching the existing AST rule's treatment of those shapes.

### Integration point

`isPrimitiveTsType(typeNode, programNode, checkerCtx)` gets an optional third parameter. When
`checkerCtx` is non-null and `typeNode` is a `TSTypeReference` (previously: only the
_unresolvable_ branch used a heuristic fallback), it maps the ESTree node to its TS node via
`esTreeNodeToTSNodeMap.get(typeNode)` and calls `isPrimitiveByChecker` first — the checker's
answer wins outright, replacing the local-resolution attempt and the bare/generic-argument
heuristic for that reference. If `checkerCtx` is null, behavior is unchanged (today's
`resolveLocalTypeDeclaration`-then-heuristic path).

`checkerCtx` threads through the existing call chain: rule files (`require-memo-primitives.js`)
already have `context` → pass `getParserServices(context)` into `hasOnlyPrimitiveProps` →
`getObjectPatternMemberTypes` → `isPrimitiveTsType` → (new) `resolvePropsWithChildrenMembers` for
its own reference-to-T resolution.

### Non-goals

- No new ESLint rule option/flag — capability is inferred from parser services only.
- No change to oxlint or Biome behavior or docs beyond noting the gap already exists.
- No caching layer beyond what the TS `Program`/checker already does internally.

## Testing

New `test/require-memo-primitives-type-aware.test.js` using a second `RuleTester` configured with
`parserOptions.project` pointing at a real fixture tsconfig, since type-aware linting requires
real files on disk (the checker needs an actual `ts.Program`, not an in-memory code string).

New fixture tree:

```
test/fixtures-type-aware/
  tsconfig.json          # includes ./*.ts, ./*.tsx
  types.ts                # exports an object type and a primitive/enum type, simulating an
                           # imported third-party type like DehydratedState / LocaleType
  cases.tsx                # one component per RuleTester case, imports from types.ts
```

Cases to cover:

- Imported object-shaped type (bare reference, no type args) → must require memo when otherwise
  all-primitive-by-heuristic, and must flag unnecessary memo when wrapped — the exact false
  negative from the bug report.
- Imported enum / primitive type alias (bare reference) → must still correctly require memo
  (regression: don't break the case the heuristic already got right).
- Local interface/type alias, now going through the checker instead of local AST resolution → same
  verdict as before (regression coverage for the pre-existing local-resolution path).
- A prop with a generic imported reference (`Promise<T>`-shaped) → still non-primitive.

## Documentation

`CLAUDE.md`'s ESLint package section gets a new paragraph documenting: the automatic
type-aware upgrade path, that it's ESLint-only, and that it fully supersedes the "bare reference
trusted as primitive" heuristic for any reference (local or imported) when active — the
heuristic remains exactly as documented today for consumers who haven't configured
`parserOptions.project`.
