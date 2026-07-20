# react-memo-primitives

Lint rules that enforce `React.memo` on components with primitive props, and flag `React.memo` on
components with no props — implemented for three linters. Pick the package that matches your
toolchain:

| Package                                                                               | Linter                       | Config format                                  |
| ------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------- |
| [`eslint-plugin-react-memo-primitives`](packages/eslint-plugin-react-memo-primitives) | ESLint                       | legacy `.eslintrc` and flat `eslint.config.js` |
| [`biome-plugin-react-memo-primitives`](packages/biome-plugin-react-memo-primitives)   | [Biome](https://biomejs.dev) | GritQL plugins (`biome.jsonc`)                 |
| [`oxlint-plugin-react-memo-primitives`](packages/oxlint-plugin-react-memo-primitives) | [oxlint](https://oxc.rs)     | JS plugin (`.oxlintrc.json`)                   |

## Rules

Every package implements the same two rules:

- **require-memo-primitives** — a functional component that returns JSX and destructures a
  single object parameter made up entirely of primitive-looking props (string, number, boolean,
  etc.) must be wrapped in `memo(...)` or `React.memo(...)`.
- **no-unnecessary-memo** — a component wrapped in `memo(...)` / `React.memo(...)` that takes no
  props doesn't need to be — memoizing a component with no props buys nothing.

```tsx
// require-memo-primitives: reports MyComponent (has primitive props, not memoized)
const MyComponent = ({ title, age }: { title: string; age: number }) => {
  return (
    <h1>
      {title} - {age}
    </h1>
  );
};

// no-unnecessary-memo: reports Header (memoized, but takes no props)
const Header = React.memo(() => {
  return <h1>Static</h1>;
});

// correct: memoized component with primitive props
const Correct = React.memo(({ title }: { title: string }) => {
  return <h1>{title}</h1>;
});
```

None of the three linter APIs give a lint rule access to TypeScript's type checker, so all three
implementations approximate "primitive prop" structurally instead of by real type: the
ESLint/oxlint versions use a naming heuristic (lowercase-first identifier binding), while the
Biome/GritQL version checks only that the parameter destructures into an object pattern at all.
See each package's README for the exact heuristic and its known false positives/negatives.

## Development

This is an npm workspaces monorepo; each package under `packages/` is published independently.
There's no shared build step — every package ships its source directly (plain CommonJS for the
ESLint and oxlint packages, `.grit` files for Biome).

## Testing

```sh
npm test
```

Runs every package's test suite (`npm test --workspaces --if-present` under the hood). Each
package tests itself against the real linter binary/API it targets — see its README for details.
