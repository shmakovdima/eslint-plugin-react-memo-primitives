# react-memo-primitives

Lint rules that enforce `React.memo` on components with primitive props, flag `React.memo` on
components with no props or with a non-primitive prop, and require a `displayName` on memoized
components — implemented for three linters. Pick the package that matches your toolchain:

| Package                                                                               | Linter                       | Config format                                  |
| ------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------- |
| [`eslint-plugin-react-memo-primitives`](packages/eslint-plugin-react-memo-primitives) | ESLint                       | legacy `.eslintrc` and flat `eslint.config.js` |
| [`biome-plugin-react-memo-primitives`](packages/biome-plugin-react-memo-primitives)   | [Biome](https://biomejs.dev) | GritQL plugins (`biome.jsonc`)                 |
| [`oxlint-plugin-react-memo-primitives`](packages/oxlint-plugin-react-memo-primitives) | [oxlint](https://oxc.rs)     | JS plugin (`.oxlintrc.json`)                   |

## Rules

Every package implements the same three rules:

- **require-memo-primitives** — bidirectional: a functional component that returns JSX and
  destructures a single object parameter of props is checked for whether **all** props are
  primitive (string, number, boolean, bigint, null, undefined, literal types, or
  unions/intersections of those). All-primitive and not memoized → memo is required.
  Non-primitive (object, function, ref, or other unresolvable type) and memoized → memo is
  flagged as unnecessary, since a non-primitive prop can still change identity every render.
- **no-unnecessary-memo** — a component wrapped in `memo(...)` / `React.memo(...)` that takes no
  props doesn't need to be — memoizing a component with no props buys nothing.
- **require-memo-displayname** — a component wrapped in `memo(...)` / `React.memo(...)` must have
  a `Foo.displayName = "..."` assignment for its name.

```tsx
// require-memo-primitives: reports MyComponent (has primitive props, not memoized)
const MyComponent = ({ title, age }: { title: string; age: number }) => {
  return (
    <h1>
      {title} - {age}
    </h1>
  );
};

// require-memo-primitives: reports Card (has a non-primitive prop, memo is unnecessary)
const Card = React.memo(
  ({ title, onClick }: { title: string; onClick: () => void }) => {
    return <h1 onClick={onClick}>{title}</h1>;
  },
);

// no-unnecessary-memo: reports Header (memoized, but takes no props)
const Header = React.memo(() => {
  return <h1>Static</h1>;
});

// require-memo-displayname: reports Correct (memoized, no displayName assigned)
const Correct = React.memo(({ title }: { title: string }) => {
  return <h1>{title}</h1>;
});
Correct.displayName = "Correct"; // add this to satisfy require-memo-displayname
```

None of the three linter APIs give a lint rule access to a full TypeScript type checker, but all
three read a component's actual TS type syntax when it's present (resolving a same-file
`type`/`interface` by name) to decide whether each prop is primitive — a function, ref, or
object-shaped prop is correctly excluded even if its binding name looks "primitive." When there's
no type annotation at all (plain JS/JSX), each implementation falls back to a naming heuristic
instead (see each package's README for the exact fallback and its known false positives/negatives).

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
