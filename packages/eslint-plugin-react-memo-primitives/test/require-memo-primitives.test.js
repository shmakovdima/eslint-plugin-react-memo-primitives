"use strict";

const { RuleTester } = require("eslint");
const tsParser = require("@typescript-eslint/parser");
const rule = require("../lib/rules/require-memo-primitives");

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const tsRuleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
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

ruleTester.run(
  "require-memo-primitives (untyped, non-primitive + memo)",
  rule,
  {
    valid: [
      // Non-primitive-looking name (`Config`) with no memo — out of scope for this rule either way
      // (it's not flagged as missing memo, and it's not wrapped in memo either).
      "const MyComponent = ({ Config }) => { return <h1>{Config.title}</h1>; };",
    ],
    invalid: [
      // Untyped code has no way to prove a prop is non-primitive by name alone, but a destructured
      // rest element is unambiguous: it always captures a subset of the props object, never a
      // primitive.
      {
        code: "const MyComponent = memo(({ title, ...rest }) => { return <h1>{title}</h1>; });",
        errors: [{ messageId: "unnecessaryMemoNonPrimitive" }],
      },
    ],
  },
);

tsRuleTester.run("require-memo-primitives (typed)", rule, {
  valid: [
    // Regression (reported false positive): emailInputRef is a MutableRefObject, register is
    // a UseFormRegisterReturn, and handleAcceptClick is a function — none of those are
    // primitives, so this component must NOT be flagged as needing memo even though most of
    // its other props (strings/booleans) look primitive.
    `
    type ReferralHeroInputProps = {
      code: string | undefined;
      emailInputRef: MutableRefObject<HTMLInputElement | null>;
      handleAcceptClick: () => void;
      isCustomCode: boolean;
      isEmailSubmitting: boolean;
      isEmailValid: boolean;
      locale: LocaleType;
      referralCodeFromCookie: string | undefined;
      register: UseFormRegisterReturn<"email">;
      routerCode: string | undefined;
    };

    export const ReferralHeroInput = ({
      code,
      emailInputRef,
      handleAcceptClick,
      isCustomCode,
      isEmailSubmitting,
      isEmailValid,
      locale,
      referralCodeFromCookie,
      register,
      routerCode,
    }: ReferralHeroInputProps) => {
      return <input ref={emailInputRef} onClick={handleAcceptClick}>{code}</input>;
    };
    `,
    // Simplified variant of the above, kept for a minimal repro.
    `
    type Props = {
      code: string | undefined;
      emailInputRef: MutableRefObject<HTMLInputElement | null>;
      handleAcceptClick: () => void;
    };
    const ReferralHeroInput = ({ code, emailInputRef, handleAcceptClick }: Props) => {
      return <input ref={emailInputRef} onClick={handleAcceptClick}>{code}</input>;
    };
    `,
    // Inline object type literal with a function member — same as above, no local alias.
    `
    const MyComponent = ({ title, onClick }: { title: string; onClick: () => void }) => {
      return <h1 onClick={onClick}>{title}</h1>;
    };
    `,
    // Nested object-shaped member.
    `
    type Props = { title: string; config: { theme: string } };
    const MyComponent = ({ title, config }: Props) => {
      return <h1>{title}-{config.theme}</h1>;
    };
    `,
  ],
  invalid: [
    // All-primitive props via a local type alias, including a union with undefined.
    {
      code: `
      type Props = { title: string; age: number | undefined };
      const MyComponent = ({ title, age }: Props) => { return <h1>{title}-{age}</h1>; };
      `,
      errors: [{ messageId: "missingMemo" }],
    },
    // All-primitive props via inline object type literal.
    {
      code: `
      const MyComponent = ({ title, isActive }: { title: string; isActive: boolean }) => {
        return <h1>{title}-{isActive}</h1>;
      };
      `,
      errors: [{ messageId: "missingMemo" }],
    },
    // Interface form.
    {
      code: `
      interface Props { title: string; }
      const MyComponent = ({ title }: Props) => { return <h1>{title}</h1>; };
      `,
      errors: [{ messageId: "missingMemo" }],
    },
    // Regression companion: the exact ReferralHeroInput shape, but wrapped in memo — since
    // emailInputRef/handleAcceptClick/register aren't primitives, memo should be actively flagged
    // as unnecessary here, not just "not required."
    {
      code: `
      type ReferralHeroInputProps = {
        code: string | undefined;
        emailInputRef: MutableRefObject<HTMLInputElement | null>;
        handleAcceptClick: () => void;
        isCustomCode: boolean;
        register: UseFormRegisterReturn<"email">;
      };
      const ReferralHeroInput = memo(({
        code,
        emailInputRef,
        handleAcceptClick,
        isCustomCode,
        register,
      }: ReferralHeroInputProps) => {
        return <input ref={emailInputRef} onClick={handleAcceptClick}>{code}</input>;
      });
      `,
      errors: [{ messageId: "unnecessaryMemoNonPrimitive" }],
    },
    // Nested object-shaped member, wrapped in memo.
    {
      code: `
      type Props = { title: string; config: { theme: string } };
      const MyComponent = React.memo(({ title, config }: Props) => {
        return <h1>{title}-{config.theme}</h1>;
      });
      `,
      errors: [{ messageId: "unnecessaryMemoNonPrimitive" }],
    },
    // Inline object type literal with a function member, wrapped in memo.
    {
      code: `
      const MyComponent = memo(({ title, onClick }: { title: string; onClick: () => void }) => {
        return <h1 onClick={onClick}>{title}</h1>;
      });
      `,
      errors: [{ messageId: "unnecessaryMemoNonPrimitive" }],
    },
  ],
});

tsRuleTester.run("require-memo-primitives (typed, TS type-kind sweep)", rule, {
  valid: [
    // Regression: NumberSpeak — an array member and a JSX.Element union member are both
    // non-primitive, so this must NOT be flagged as missing memo, unwrapped.
    `
    type Props = {
      title: JSX.Element | string;
      description: JSX.Element | string;
      locale: LocaleType;
      historicalPerformance: HistoricalPerformance[];
      hideCTA?: boolean;
    };
    export const NumberSpeak = ({
      description,
      hideCTA,
      historicalPerformance,
      locale,
      title,
    }: Props) => {
      return <div>{title}</div>;
    };
    `,
    // A member typed as a local object type alias (not an inline literal, not an interface) is
    // still non-primitive.
    `
    type Config = { theme: string };
    type Props = { title: string; config: Config };
    const MyComponent = ({ title, config }: Props) => {
      return <div>{title}-{config.theme}</div>;
    };
    `,
    // Tuple types are collections, never primitive.
    `
    type Props = { pair: [string, number] };
    const MyComponent = ({ pair }: Props) => { return <div>{pair[0]}</div>; };
    `,
    // A mapped type member is object-shaped, never primitive.
    `
    type Keys = "a" | "b";
    type Config = { [K in Keys]: string };
    type Props = { title: string; config: Config };
    const MyComponent = ({ title, config }: Props) => { return <div>{title}</div>; };
    `,
    // A default value on a non-primitive-typed destructured prop doesn't change the verdict.
    `
    type Props = { title: string; onClick?: () => void };
    const MyComponent = ({ title, onClick = () => {} }: Props) => {
      return <div onClick={onClick}>{title}</div>;
    };
    `,
  ],
  invalid: [
    // Regression: a bare, unresolvable named type reference with no generic type arguments
    // (LocaleType — the common shape of an imported enum or string alias) is trusted as
    // primitive, not rejected outright the way an unresolvable *generic* reference is.
    {
      code: `
      type Props = { locale: LocaleType; variant?: "mica" | "trade" };
      const CompareRates = ({ locale, variant = "trade" }: Props) => {
        return <div>{locale}-{variant}</div>;
      };
      `,
      errors: [{ messageId: "missingMemo" }],
    },
    // A local `enum` declaration resolved by name in the same file is always primitive.
    {
      code: `
      enum Status { Active, Inactive }
      type Props = { status: Status };
      const MyComponent = ({ status }: Props) => { return <div>{status}</div>; };
      `,
      errors: [{ messageId: "missingMemo" }],
    },
    // A local type alias to a primitive (not an object literal) is resolved and unwrapped.
    {
      code: `
      type ID = string | number;
      type Props = { id: ID };
      const MyComponent = ({ id }: Props) => { return <div>{id}</div>; };
      `,
      errors: [{ messageId: "missingMemo" }],
    },
    // A default value on a primitive-typed destructured prop doesn't change the verdict.
    {
      code: `
      type Props = { title: string; count?: number };
      const MyComponent = ({ title, count = 0 }: Props) => {
        return <div>{title}-{count}</div>;
      };
      `,
      errors: [{ messageId: "missingMemo" }],
    },
    // NumberSpeak companion: memo-wrapped with the same array/JSX.Element non-primitive members
    // must be actively flagged.
    {
      code: `
      type Props = {
        title: JSX.Element | string;
        historicalPerformance: HistoricalPerformance[];
      };
      export const NumberSpeak = memo(({ historicalPerformance, title }: Props) => {
        return <div>{title}</div>;
      });
      `,
      errors: [{ messageId: "unnecessaryMemoNonPrimitive" }],
    },
    // Local object type alias member, memo-wrapped.
    {
      code: `
      type Config = { theme: string };
      type Props = { title: string; config: Config };
      const MyComponent = memo(({ title, config }: Props) => {
        return <div>{title}-{config.theme}</div>;
      });
      `,
      errors: [{ messageId: "unnecessaryMemoNonPrimitive" }],
    },
  ],
});

tsRuleTester.run("require-memo-primitives (PropsWithChildren)", rule, {
  valid: [
    // Regression: `children` from PropsWithChildren<T> is ReactNode, never primitive, so this
    // must NOT be flagged as needing memo even though `title` alone would qualify.
    `
    const MyComponent = ({ title, children }: PropsWithChildren<{ title: string }>) => {
      return <div>{title}{children}</div>;
    };
    `,
    // Qualified `React.PropsWithChildren<T>` form.
    `
    const MyComponent = ({ title, children }: React.PropsWithChildren<{ title: string }>) => {
      return <div>{title}{children}</div>;
    };
    `,
  ],
  invalid: [
    // T's members alone are all-primitive even when `children` isn't destructured — still
    // requires memo (children not being used doesn't change the component's own prop shape).
    {
      code: `
      const MyComponent = ({ title }: PropsWithChildren<{ title: string }>) => {
        return <div>{title}</div>;
      };
      `,
      errors: [{ messageId: "missingMemo" }],
    },
    // Companion: memo-wrapped with `children` destructured must be actively flagged.
    {
      code: `
      const MyComponent = memo(({ title, children }: PropsWithChildren<{ title: string }>) => {
        return <div>{title}{children}</div>;
      });
      `,
      errors: [{ messageId: "unnecessaryMemoNonPrimitive" }],
    },
  ],
});
