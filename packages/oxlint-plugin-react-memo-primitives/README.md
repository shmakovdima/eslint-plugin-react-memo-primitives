# oxlint-plugin-react-memo-primitives

An [oxlint JS plugin](https://oxc.rs/docs/guide/usage/linter/js-plugins.html) that enforces the
use of `React.memo` for components with primitive props, and flags `React.memo` used on
components with no props. This is the oxlint counterpart of
[`eslint-plugin-react-memo-primitives`](../eslint-plugin-react-memo-primitives), using oxlint's
ESLint-compatible `create(context)` visitor API.

## Rules

### `react-memo-primitives/require-memo-primitives`

Flags a component (arrow function, function expression, or function declaration) that returns
JSX and destructures a single object parameter made up of primitive-looking props, when it isn't
wrapped in `memo(...)` or `React.memo(...)`.

### `react-memo-primitives/no-unnecessary-memo`

Flags a component wrapped in `memo(...)` / `React.memo(...)` that takes no props (no parameters,
or an empty `{}` destructure).

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
    "react-memo-primitives/no-unnecessary-memo": "error"
  }
}
```

Or copy `.oxlintrc.json` from this package as a starting point.

## Limitations

- **oxlint's JS plugin API is currently alpha and not subject to semver** — breaking changes are
  possible in future oxlint releases. Pin your oxlint version accordingly.
- oxlint's JS plugins have no access to TypeScript type information (type-aware linting is a
  native-Rust-only capability in oxlint). Both rules approximate "primitive prop" the same way
  the ESLint/Biome versions do: from the destructured binding name, not the actual type. A prop
  typed as an object but destructured directly (`{ config }`) will still be treated as primitive.

## Testing

```sh
npm test
```

Runs the local `oxlint` binary against fixtures in `test/fixtures/` (`test/run.js`, using
oxlint's `--format=json` output) and asserts diagnostics land on exactly the expected lines.
