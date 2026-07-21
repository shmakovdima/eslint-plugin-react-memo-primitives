# eslint-plugin-react-memo-primitives

An ESLint plugin that enforces the use of `React.memo` for functional React components that
receive primitive props, flags `React.memo` used on components that don't receive any props at
all or that receive a non-primitive prop, and requires a `displayName` on memoized components.

## Rules

### `react-memo-primitives/require-memo-primitives`

Flags a functional component (arrow function, function expression, or function declaration) that
returns JSX and destructures a single object parameter of props, based on whether **all** of
those props are primitive (string, number, boolean, bigint, null, undefined, literal types, or
unions/intersections of those):

- If every prop is primitive and the component **isn't** wrapped in `memo(...)` /
  `React.memo(...)`, memo is required.
- If **any** prop is non-primitive (object, function, ref, or other unresolvable type) and the
  component **is** wrapped in `memo(...)` / `React.memo(...)`, memo is flagged as unnecessary —
  a non-primitive prop can still change identity on every render, so memo buys nothing.

When the parameter has a TS type annotation, each prop's actual declared type is checked — a
function, ref, or object-shaped prop (even with an otherwise "primitive-looking" name) is
correctly treated as non-primitive.

#### Incorrect

```tsx
type Props = { title: string; age: number };

const MyComponent = ({ title, age }: Props) => {
  return (
    <h1>
      {title} - {age}
    </h1>
  );
};

type OtherProps = { title: string; onClick: () => void };

const OtherComponent = memo(({ title, onClick }: OtherProps) => {
  return <h1 onClick={onClick}>{title}</h1>;
});
```

#### Correct

```tsx
type Props = { title: string; age: number };

const MyComponent = React.memo(({ title, age }: Props) => {
  return (
    <h1>
      {title} - {age}
    </h1>
  );
});

type OtherProps = { title: string; onClick: () => void };

const OtherComponent = ({ title, onClick }: OtherProps) => {
  return <h1 onClick={onClick}>{title}</h1>;
};
```

### `react-memo-primitives/no-unnecessary-memo`

Flags a component wrapped in `memo(...)` or `React.memo(...)` that doesn't receive any props —
memoizing a component with no props buys nothing and adds overhead.

#### Incorrect

```tsx
const MyComponent = React.memo(() => {
  return <h1>Static</h1>;
});
```

#### Correct

```tsx
const MyComponent = () => {
  return <h1>Static</h1>;
};
```

### `react-memo-primitives/require-memo-displayname`

Flags a component wrapped in `memo(...)` or `React.memo(...)` that has no `displayName`
assignment — memoized components lose their function name in React DevTools/error boundaries
unless `displayName` is set explicitly.

#### Incorrect

```tsx
const MyComponent = React.memo(({ title }) => {
  return <h1>{title}</h1>;
});
```

#### Correct

```tsx
const MyComponent = React.memo(({ title }) => {
  return <h1>{title}</h1>;
});
MyComponent.displayName = "MyComponent";
```

## Installation

```sh
npm install eslint-plugin-react-memo-primitives --save-dev
```

## Usage

### Flat config (`eslint.config.js`, ESLint 9+)

```js
import reactMemoPrimitives from "eslint-plugin-react-memo-primitives";

export default [...reactMemoPrimitives.configs["flat/recommended"]];
```

Or wire the rules up manually:

```js
import reactMemoPrimitives from "eslint-plugin-react-memo-primitives";

export default [
  {
    plugins: { "react-memo-primitives": reactMemoPrimitives },
    rules: {
      "react-memo-primitives/require-memo-primitives": "error",
      "react-memo-primitives/no-unnecessary-memo": "error",
      "react-memo-primitives/require-memo-displayname": "error",
    },
  },
];
```

### Legacy config (`.eslintrc`)

```json
{
  "plugins": ["react-memo-primitives"],
  "extends": ["plugin:react-memo-primitives/recommended"]
}
```

Or wire the rules up manually:

```json
{
  "plugins": ["react-memo-primitives"],
  "rules": {
    "react-memo-primitives/require-memo-primitives": "error",
    "react-memo-primitives/no-unnecessary-memo": "error",
    "react-memo-primitives/require-memo-displayname": "error"
  }
}
```

## Compatibility

Requires ESLint 8 or later. ESLint 9's flat config is supported via
`configs['flat/recommended']`. Type-aware primitive-prop detection works when your ESLint config
parses TypeScript files with `@typescript-eslint/parser` (a `dependencies` entry of this package,
so it's installed automatically); projects parsing `.tsx` with the default parser, or linting
plain `.jsx`, fall back to the naming heuristic described below.

## Limitations

`require-memo-primitives` reads the destructured parameter's real TS type annotation when one is
present (an inline object type, or a reference to a `type`/`interface` declared in the same
file) to decide whether each prop is primitive. A type imported from another file, or a generic
type alias, can't be resolved from a single file's AST and is conservatively treated as
non-primitive. When there's no type annotation at all (plain JS/JSX), both rules fall back to a
naming heuristic: a prop bound to a lowercase identifier (other than `props`) is treated as
primitive regardless of its actual runtime value — there's no false-positive-proof way to do this
without type information.

All three rules check that `memo`/`React` are actually imported from `'react'` in the same file,
so a same-named identifier imported from elsewhere (`import { memo } from 'some-other-lib'`)
isn't mistaken for real memoization. When there's no relevant import in the file at all (e.g. a
global `React`, or an isolated code snippet), all three rules fall back to trusting the name,
same as before.

`require-memo-displayname` only recognizes a `Foo.displayName = "..."` assignment written as a
direct top-level statement in the file — one nested inside another function, conditional, or
block isn't detected.

## Testing

```sh
npm test
```

Runs all three rules through ESLint's `RuleTester` (`test/*.test.js`) via Node's built-in test
runner.
