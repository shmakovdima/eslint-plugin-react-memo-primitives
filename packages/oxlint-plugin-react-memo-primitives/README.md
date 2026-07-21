# oxlint-plugin-react-memo-primitives

An [oxlint JS plugin](https://oxc.rs/docs/guide/usage/linter/js-plugins.html) that enforces the
use of `React.memo` for components with primitive props, flags `React.memo` used on components
with no props or with a non-primitive prop, and requires a `displayName` on memoized components.
This is the oxlint counterpart of
[`eslint-plugin-react-memo-primitives`](../eslint-plugin-react-memo-primitives), using oxlint's
ESLint-compatible `create(context)` visitor API.

## Rules

### `react-memo-primitives/require-memo-primitives`

Flags a component (arrow function, function expression, or function declaration) that returns
JSX and destructures a single object parameter of props, based on whether **all** of those props
are primitive:

- If every prop is primitive and the component **isn't** wrapped in `memo(...)` /
  `React.memo(...)`, memo is required.
- If **any** prop is non-primitive (object, function, ref, or other unresolvable type) and the
  component **is** wrapped in `memo(...)` / `React.memo(...)`, memo is flagged as unnecessary.

When the parameter has a TS type annotation (oxlint parses `.tsx` natively), each prop's actual
declared type is checked.

### `react-memo-primitives/no-unnecessary-memo`

Flags a component wrapped in `memo(...)` / `React.memo(...)` that takes no props (no parameters,
or an empty `{}` destructure).

### `react-memo-primitives/require-memo-displayname`

Flags a component wrapped in `memo(...)` / `React.memo(...)` that has no `Foo.displayName = ...`
assignment for its name, written as a direct top-level statement in the file.

## Installation

```sh
npm install oxlint-plugin-react-memo-primitives --save-dev
```

Register the plugin in `.oxlintrc.json`:

```json
{
  "jsPlugins": ["./node_modules/oxlint-plugin-react-memo-primitives/index.js"],
  "rules": {
    "react-memo-primitives/require-memo-primitives": "error",
    "react-memo-primitives/no-unnecessary-memo": "error",
    "react-memo-primitives/require-memo-displayname": "error"
  }
}
```

Or copy `.oxlintrc.json` from this package as a starting point.

## Limitations

- **oxlint's JS plugin API is currently alpha and not subject to semver** — breaking changes are
  possible in future oxlint releases. Pin your oxlint version accordingly.
- oxlint's JS plugins have no access to a TypeScript type _checker_ (type-aware linting is a
  native-Rust-only capability in oxlint), but oxc parses `.tsx` type syntax natively, so
  `require-memo-primitives` reads it directly: an inline object type or a same-file
  `type`/`interface` reference is resolved and each member's declared type is checked. A type
  imported from elsewhere, or a generic type alias, can't be resolved from a single file's AST and
  is conservatively treated as non-primitive. With no type annotation at all (plain JS/JSX), both
  rules fall back to the naming heuristic: a prop typed only by its destructured binding name
  (lowercase, not literally `props`) is treated as primitive regardless of its actual value.
- All three rules check that `memo`/`React` are actually imported from `'react'` in the same
  file, so a same-named identifier imported from elsewhere isn't mistaken for real memoization.
  With no relevant import in the file at all, all three rules fall back to trusting the name.
- `require-memo-displayname` only recognizes a `Foo.displayName = "..."` assignment written as a
  direct top-level statement — one nested inside another function, conditional, or block isn't
  detected.

## Testing

```sh
npm test
```

Runs the local `oxlint` binary against fixtures in `test/fixtures/` (`test/run.js`, using
oxlint's `--format=json` output) and asserts diagnostics land on exactly the expected lines.
