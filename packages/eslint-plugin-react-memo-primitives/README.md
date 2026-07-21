# eslint-plugin-react-memo-primitives

An ESLint plugin that enforces the use of `React.memo` for functional React components that
receive primitive props, and flags `React.memo` used on components that don't receive any props
at all.

## Rules

### `react-memo-primitives/require-memo-primitives`

Flags a functional component (arrow function, function expression, or function declaration) that
returns JSX and destructures a single object parameter made up entirely of primitive-looking props
(string, number, boolean, etc. — based on binding name, not type) when it isn't wrapped in
`memo(...)` or `React.memo(...)`.

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
    "react-memo-primitives/no-unnecessary-memo": "error"
  }
}
```

## Compatibility

Requires ESLint 8 or later. ESLint 9's flat config is supported via
`configs['flat/recommended']`.

## Limitations

Both rules use naming heuristics, not type information, to decide whether a prop is "primitive."
A prop bound to a lowercase identifier (other than `props`) is treated as primitive regardless of
its actual type. There's no false-positive-proof way to do this without a type checker.

Both rules check that `memo`/`React` are actually imported from `'react'` in the same file, so a
same-named identifier imported from elsewhere (`import { memo } from 'some-other-lib'`) isn't
mistaken for real memoization. When there's no relevant import in the file at all (e.g. a global
`React`, or an isolated code snippet), both rules fall back to trusting the name, same as before.

## Testing

```sh
npm test
```

Runs both rules through ESLint's `RuleTester` (`test/*.test.js`) via Node's built-in test runner.
