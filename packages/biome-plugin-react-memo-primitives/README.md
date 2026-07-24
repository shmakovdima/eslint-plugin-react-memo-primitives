# biome-plugin-react-memo-primitives

[Biome](https://biomejs.dev) [GritQL plugins](https://biomejs.dev/linter/plugins/) that enforce
the use of `React.memo` for components with primitive props, flag `React.memo` used on
components with no props or with a non-primitive prop, and require a `displayName` on memoized
components. This is the GritQL-plugin counterpart of
[`eslint-plugin-react-memo-primitives`](../eslint-plugin-react-memo-primitives), for projects that
lint with Biome instead of ESLint.

## Rules

### `require-memo-primitives.grit`

Flags a component (arrow function, function expression, or function declaration) that returns
JSX and destructures a single object parameter of props, based on whether **all** of those props
are primitive:

- If every prop is primitive and the component **isn't** wrapped in `memo(...)` /
  `React.memo(...)`, memo is required.
- If **any** prop is non-primitive (object, function, ref, or other unresolvable type) and the
  component **is** wrapped in `memo(...)` / `React.memo(...)`, memo is flagged as unnecessary.

When the parameter has a TS type annotation, each prop's declared type is checked.

### `no-unnecessary-memo.grit`

Flags a component wrapped in `memo(...)` / `React.memo(...)` that takes no props (no parameters,
or an empty `{}` destructure).

### `require-memo-displayname.grit`

Flags a component wrapped in `memo(...)` / `React.memo(...)` that has no `Foo.displayName = ...`
assignment for its name, written as a direct top-level statement in the file.

## Installation

```sh
npm install biome-plugin-react-memo-primitives --save-dev
```

Register all three plugins in `biome.json`/`biome.jsonc`:

```jsonc
{
  "plugins": [
    "./node_modules/biome-plugin-react-memo-primitives/require-memo-primitives.grit",
    "./node_modules/biome-plugin-react-memo-primitives/no-unnecessary-memo.grit",
    "./node_modules/biome-plugin-react-memo-primitives/require-memo-displayname.grit",
  ],
}
```

Or copy `biome.jsonc` from this package as a starting point.

Requires Biome 2.0+ (GritQL plugin support). Diagnostics-only plugins (no autofix) work as of
Biome 2.5; this package does not ship fixers.

## Limitations

GritQL has no type _checker_ and no upgrade path to one — unlike the ESLint package in this same
monorepo, which can use a real checker when the consumer's config is type-aware. It does parse TS
type syntax though, and `require-memo-primitives.grit`
reads it: when the parameter has a type annotation (inline object type, or a reference to a
`type`/`interface` in the same file), each member's type is inspected and the component is only
flagged if every member is a primitive type (string/number/boolean/etc., or unions of those) — a
function-typed, object-shaped, or unresolvable-reference-typed member (e.g. `MutableRefObject<T>`)
correctly excludes the component. A type alias imported from elsewhere, or a generic type
parameter, can't be resolved from a single file's AST and is conservatively treated as
non-primitive.

When there's no type annotation at all (plain JS/JSX), this falls back to a coarser check: any
destructured object pattern at all (`JsObjectBindingPattern`) counts as primitive-props, without
inspecting property names or excluding nested object/array sub-patterns. A destructured prop that
is itself an untyped object or array (e.g. `{ user: { name } }` with no type annotation) is still
treated as primitive in this untyped fallback path only.

All three rules check that `memo`/`React` are actually imported from `'react'` in the same file
(via `$program <: contains \`import ... from $source\` where { $source <: not \`'react'\` }`), so
a same-named identifier imported from elsewhere isn't mistaken for real memoization. With no
relevant import in the file at all, all three rules fall back to trusting the name.

`require-memo-displayname.grit` only recognizes a `Foo.displayName = "..."` assignment written as
a direct top-level statement (`` `$name.displayName = $dn` `` matched against `$program`) — one
nested inside another function, conditional, or block isn't detected.

Biome's plugin system is under active development, and ancestor/"is this whole expression wrapped
in X" matching has open upstream bugs in plugin mode (see
[biomejs/biome#7363](https://github.com/biomejs/biome/issues/7363)). `require-memo-primitives.grit`
sidesteps this: it matches the _unwrapped_ declaration shape directly (`const $name = ($props) =>
$body`), which structurally cannot match a `memo(...)`-wrapped component (the wrapper changes the
declarator's init to a CallExpression), so "not wrapped in memo" falls out of the pattern shape
itself rather than an explicit ancestor check. `no-unnecessary-memo.grit` does the same in
reverse — it matches the _wrapped_ shape directly. If you extend either rule and need genuine
ancestor/"contains X anywhere above" matching, check that issue first — it's the sharp edge in
this plugin system.

## Testing

```sh
npm test
```

Runs the local `biome` binary against fixtures in `test/fixtures/` (`test/run.js`) and asserts
diagnostics land on exactly the expected lines. There's no `RuleTester`-equivalent for GritQL
plugins — this shells out to the real Biome CLI, since that's the only way to validate GritQL
syntax actually compiles and matches as intended.
