# biome-plugin-react-memo-primitives

[Biome](https://biomejs.dev) [GritQL plugins](https://biomejs.dev/linter/plugins/) that enforce
the use of `React.memo` for components with primitive props, and flag `React.memo` used on
components with no props. This is the GritQL-plugin counterpart of
[`eslint-plugin-react-memo-primitives`](../eslint-plugin-react-memo-primitives), for projects that
lint with Biome instead of ESLint.

## Rules

### `require-memo-primitives.grit`

Flags a component (arrow function, function expression, or function declaration) that returns
JSX and destructures a single object parameter made up of primitive-looking props, when it isn't
wrapped in `memo(...)` or `React.memo(...)`.

### `no-unnecessary-memo.grit`

Flags a component wrapped in `memo(...)` / `React.memo(...)` that takes no props (no parameters,
or an empty `{}` destructure).

## Installation

```sh
npm install biome-plugin-react-memo-primitives --save-dev
```

Register both plugins in `biome.json`/`biome.jsonc`:

```jsonc
{
  "plugins": [
    "./node_modules/biome-plugin-react-memo-primitives/require-memo-primitives.grit",
    "./node_modules/biome-plugin-react-memo-primitives/no-unnecessary-memo.grit",
  ],
}
```

Or copy `biome.jsonc` from this package as a starting point.

Requires Biome 2.0+ (GritQL plugin support). Diagnostics-only plugins (no autofix) work as of
Biome 2.5; this package does not ship fixers.

## Limitations

GritQL is a purely structural/syntactic matcher — it has no access to TypeScript type
information. `require-memo-primitives.grit` approximates "primitive prop" more loosely than the
ESLint/oxlint versions: it only checks that the parameter destructures into an object pattern at
all (`JsObjectBindingPattern`), without inspecting individual property names or excluding nested
object/array sub-patterns. A destructured prop that is itself an object or array (e.g.
`{ user: { name } }`) is still treated as primitive here — GritQL's node-kind matching couldn't
express that exclusion reliably as of Biome 2.5.4 (see the comments in the `.grit` file for what
was tried).

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
