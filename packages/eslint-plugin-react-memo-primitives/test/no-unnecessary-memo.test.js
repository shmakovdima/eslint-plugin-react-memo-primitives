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
    // `memo` shadowed by a non-react import — not real memoization, so not flagged.
    'import { memo } from "some-other-lib";\nconst MyComponent = memo(() => { return <h1>Static</h1>; });',
    // Real react import present alongside real usage — still correctly flagged (see invalid).
    'import { memo } from "react";\nconst MyComponent = memo(({ title }) => { return <h1>{title}</h1>; });',
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
    // Real `memo` import from react — still correctly flagged with import info present.
    {
      code: 'import { memo } from "react";\nconst MyComponent = memo(() => { return <h1>Static</h1>; });',
      errors: [{ messageId: "unnecessaryMemo" }],
    },
  ],
});
