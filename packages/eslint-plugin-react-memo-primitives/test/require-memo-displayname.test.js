"use strict";

const { RuleTester } = require("eslint");
const rule = require("../lib/rules/require-memo-displayname");

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

ruleTester.run("require-memo-displayname", rule, {
  valid: [
    // Memo-wrapped with a matching displayName assignment.
    'const MyComponent = React.memo(({ title }) => { return <h1>{title}</h1>; });\nMyComponent.displayName = "MyComponent";',
    'const MyComponent = memo(({ title }) => { return <h1>{title}</h1>; });\nMyComponent.displayName = "MyComponent";',
    // Not memoized at all — out of scope for this rule.
    "const MyComponent = ({ title }) => { return <h1>{title}</h1>; };",
    // Not a component (no JSX).
    "const util = memo(() => 1);",
    // `memo` shadowed by a non-react import — not real memoization, so displayName isn't required.
    'import { memo } from "some-other-lib";\nconst MyComponent = memo(({ title }) => { return <h1>{title}</h1>; });',
    // FunctionDeclaration form can't be memo-wrapped (getFunctionAndDeclarator returns a null
    // declarator for it), so it's out of scope for this rule regardless of displayName.
    "function MyComponent({ title }) { return <h1>{title}</h1>; }",
  ],
  invalid: [
    {
      code: "const MyComponent = React.memo(({ title }) => { return <h1>{title}</h1>; });",
      errors: [{ messageId: "missingDisplayName" }],
    },
    {
      code: "const MyComponent = memo(({ title }) => { return <h1>{title}</h1>; });",
      errors: [{ messageId: "missingDisplayName" }],
    },
    {
      code: "const MyComponent = memo(function ({ title }) { return <h1>{title}</h1>; });",
      errors: [{ messageId: "missingDisplayName" }],
    },
    // A displayName assignment for a different identifier doesn't count.
    {
      code: 'const MyComponent = memo(({ title }) => { return <h1>{title}</h1>; });\nOtherComponent.displayName = "OtherComponent";',
      errors: [{ messageId: "missingDisplayName" }],
    },
    // Real `memo` import from react — still correctly flagged with import info present.
    {
      code: 'import { memo } from "react";\nconst MyComponent = memo(({ title }) => { return <h1>{title}</h1>; });',
      errors: [{ messageId: "missingDisplayName" }],
    },
  ],
});
