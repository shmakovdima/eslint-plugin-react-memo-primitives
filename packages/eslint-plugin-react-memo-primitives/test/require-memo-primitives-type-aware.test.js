"use strict";

const path = require("node:path");
const { RuleTester } = require("eslint");
const tsParser = require("@typescript-eslint/parser");
const rule = require("../lib/rules/require-memo-primitives");

const FIXTURES_DIR = path.join(__dirname, "fixtures-type-aware");
const FILENAME = path.join(FIXTURES_DIR, "cases.tsx");

// Type-aware RuleTester: `parserOptions.project` points at a real tsconfig.json on disk, and
// `filename` must resolve under that tsconfig's `include` — the checker needs an actual
// ts.Program, not just the in-memory `code` string, to resolve imports like `ImportedObjectType`
// from types.ts. This is what makes require-memo-primitives fall into the checker-based path in
// isPrimitiveTsType/getObjectPatternMemberTypes instead of the AST-only heuristic.
const typeAwareRuleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2020,
    sourceType: "module",
    parserOptions: {
      ecmaFeatures: { jsx: true },
      project: path.join(FIXTURES_DIR, "tsconfig.json"),
      tsconfigRootDir: FIXTURES_DIR,
    },
  },
});

typeAwareRuleTester.run(
  "require-memo-primitives (type-aware, imported types)",
  rule,
  {
    valid: [
      // An imported object-shaped type (bare reference, no type args) correctly seen as
      // non-primitive by the real checker means a component using it is NOT required to have
      // memo (mixed props: one non-primitive prop means memo wouldn't help anyway) — and also
      // isn't flagged for lacking memo, matching the rule's "only all-primitive needs memo" design.
      {
        filename: FILENAME,
        code: `
        import { ImportedObjectType, ImportedPrimitiveType } from './types';
        type Props = {
          data: ImportedObjectType;
          locale: ImportedPrimitiveType;
        };
        const MyComponent = ({ data, locale }: Props) => {
          return <div>{locale}-{JSON.stringify(data)}</div>;
        };
        `,
      },
      // Imported enum (bare reference), all-primitive props, memo-wrapped with a displayName —
      // fully valid, and regression against the case the old heuristic already got right.
      {
        filename: FILENAME,
        code: `
        import { memo } from 'react';
        import { ImportedEnum } from './types';
        type Props = { status: ImportedEnum };
        const MyComponent = memo(({ status }: Props) => {
          return <div>{status}</div>;
        });
        MyComponent.displayName = 'MyComponent';
        `,
      },
    ],
    invalid: [
      // The exact false negative from the bug report: all props look primitive under the old
      // bare-reference heuristic (ImportedObjectType has no type args), but the checker knows
      // ImportedObjectType is an object — so this must now correctly REQUIRE memo instead of
      // silently passing.
      {
        filename: FILENAME,
        code: `
        import { ImportedPrimitiveType } from './types';
        type Props = { locale: ImportedPrimitiveType; variant: "home" | "metal" };
        const MyComponent = ({ locale, variant }: Props) => {
          return <div>{locale}-{variant}</div>;
        };
        `,
        errors: [{ messageId: "missingMemo" }],
      },
      // Companion: memo-wrapped with a genuinely non-primitive imported prop must be flagged.
      {
        filename: FILENAME,
        code: `
        import { memo } from 'react';
        import { ImportedObjectType } from './types';
        type Props = { data: ImportedObjectType };
        const MyComponent = memo(({ data }: Props) => {
          return <div>{JSON.stringify(data)}</div>;
        });
        `,
        errors: [{ messageId: "unnecessaryMemoNonPrimitive" }],
      },
      // Imported generic wrapper instantiation — still non-primitive via the checker, same as
      // the AST heuristic's type-arguments rule, but now checker-verified rather than guessed.
      {
        filename: FILENAME,
        code: `
        import { memo } from 'react';
        import { ImportedGenericWrapper } from './types';
        type Props = { wrapped: ImportedGenericWrapper<string> };
        const MyComponent = memo(({ wrapped }: Props) => {
          return <div>{wrapped.value}</div>;
        });
        `,
        errors: [{ messageId: "unnecessaryMemoNonPrimitive" }],
      },
    ],
  },
);
