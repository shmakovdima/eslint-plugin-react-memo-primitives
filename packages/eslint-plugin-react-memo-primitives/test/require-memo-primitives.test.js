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
    // Real `memo` import from react — genuinely memoized, so no error even with import info present.
    'import { memo } from "react";\nconst MyComponent = memo(({ title }) => { return <h1>{title}</h1>; });',
    'import React from "react";\nconst MyComponent = React.memo(({ title }) => { return <h1>{title}</h1>; });',
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
    // `memo` here is shadowed by a non-react import — not real memoization, so still flagged.
    {
      code: 'import { memo } from "some-other-lib";\nconst MyComponent = memo(({ title }) => { return <h1>{title}</h1>; });',
      errors: [{ messageId: "missingMemo" }],
    },
    // `React` shadowed by a non-react import (namespace import from elsewhere).
    {
      code: 'import * as React from "some-other-lib";\nconst MyComponent = React.memo(({ title }) => { return <h1>{title}</h1>; });',
      errors: [{ messageId: "missingMemo" }],
    },
  ],
});
