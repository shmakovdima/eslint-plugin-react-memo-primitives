
# eslint-plugin-react-memo-primitives

An ESLint plugin that enforces the use of React.memo for functional React components that receive primitive props. This optimization can help to prevent unnecessary re-renders and improve performance in React applications, particularly when components are frequently re-rendered with the same primitive props.

## Rule: react-memo-primitives/require-memo-primitives

This rule checks if a functional React component that only receives primitive props (string, number, boolean, null, undefined, symbol, bigint) is wrapped in React.memo. If not, the rule will report an error, prompting the developer to wrap the component for potential performance benefits.

### When to Use

Use this rule when you want to ensure that all functional components in your codebase that could benefit from memoization are correctly wrapped in React.memo. This is especially useful in larger applications where unnecessary re-renders could lead to performance issues.

### Rule Details

This rule targets functional components that satisfy the following conditions:

- The component is defined as a function (either a function declaration, a function expression, or an arrow function).
- The component receives a single props argument that is deconstructed into primitive values.

When these conditions are met, and the component is not already wrapped in React.memo, the rule will report an error.

### Examples

#### Incorrect Code:

```typescript

type Props = {
  title: string;
  age: number;
}

const MyComponent = ({ title, age }: Props) => {
  return <h1>{title} - {age}</h1>;
};
```

#### Correct Code:

```typescript

type Props = {
  title: string;
  age: number;
}

const MyComponent = React.memo(({ title, age }: Props) => {
  return <h1>{title} - {age}</h1>;
});
```

### Options

This rule does not have any options.

### Installation

Install eslint-plugin-react-memo-primitives as a development dependency:

npm install eslint-plugin-react-memo-primitives --save-dev

### Usage

Add react-memo-primitives to the plugins section of your ESLint configuration file. You can omit the eslint-plugin- prefix. Then configure the react-memo-primitives/require-memo-primitives rule under the rules section.

```typescript
{
  "plugins": ["react-memo-primitives"],
  "rules": {
    "react-memo-primitives/require-memo-primitives": "error"
  }
}
```

### Compatibility

This plugin assumes you are using ESLint 6 or later and has React installed in your project.

### Contributing

Contributions, issues, and feature requests are welcome! Feel free to check issues page
