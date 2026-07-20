"use strict";

const { RuleTester } = require("eslint");
const rule = require("../lib/rules/no-unnecessary-memo");

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

ruleTester.run("no-unnecessary-memo", rule, {
  valid: [
    "const MyComponent = React.memo(({ title }) => { return <h1>{title}</h1>; });",
    "const MyComponent = memo(({ title }) => { return <h1>{title}</h1>; });",
    // No memo at all — out of scope for this rule.
    "const MyComponent = () => { return <h1>Static</h1>; };",
    // Not a component (no JSX).
    "const util = memo(() => 1);",
  ],
  invalid: [
    {
      code: "const MyComponent = React.memo(() => { return <h1>Static</h1>; });",
      errors: [{ messageId: "unnecessaryMemo" }],
    },
    {
      code: "const MyComponent = memo(() => { return <h1>Static</h1>; });",
      errors: [{ messageId: "unnecessaryMemo" }],
    },
    {
      code: "const MyComponent = memo(({}) => { return <h1>Static</h1>; });",
      errors: [{ messageId: "unnecessaryMemo" }],
    },
    {
      code: "const MyComponent = React.memo(function () { return <h1>Static</h1>; });",
      errors: [{ messageId: "unnecessaryMemo" }],
    },
  ],
});
