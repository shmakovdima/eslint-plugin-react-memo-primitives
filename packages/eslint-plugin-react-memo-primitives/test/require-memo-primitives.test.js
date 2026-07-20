"use strict";

const { RuleTester } = require("eslint");
const rule = require("../lib/rules/require-memo-primitives");

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

ruleTester.run("require-memo-primitives", rule, {
  valid: [
    "const MyComponent = React.memo(({ title, age }) => { return <h1>{title}-{age}</h1>; });",
    "const MyComponent = memo(({ title, age }) => { return <h1>{title}-{age}</h1>; });",
    "const MyComponent = React.memo(({ title, age }) => <h1>{title}-{age}</h1>);",
    "const MyComponent = memo(function ({ title }) { return <h1>{title}</h1>; });",
    // Non-primitive-looking prop name (heuristic: uppercase-first binding) — not flagged.
    "const MyComponent = ({ Config }) => { return <h1>{Config.title}</h1>; };",
    // Not a component at all (no JSX).
    "const util = ({ a, b }) => a + b;",
    // No props — out of scope for this rule (covered by no-unnecessary-memo instead).
    "const MyComponent = () => { return <h1>Static</h1>; };",
    "function util({ a, b }) { return a + b; }",
  ],
  invalid: [
    {
      code: "const MyComponent = ({ title, age }) => { return <h1>{title}-{age}</h1>; };",
      errors: [{ messageId: "missingMemo" }],
    },
    {
      code: "const MyComponent = ({ title }) => <h1>{title}</h1>;",
      errors: [{ messageId: "missingMemo" }],
    },
    {
      code: "const MyComponent = function ({ title }) { return <h1>{title}</h1>; };",
      errors: [{ messageId: "missingMemo" }],
    },
    {
      code: "function MyComponent({ title }) { return <h1>{title}</h1>; }",
      errors: [{ messageId: "missingMemo" }],
    },
  ],
});
