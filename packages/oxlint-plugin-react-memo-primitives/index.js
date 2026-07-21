const { definePlugin, defineRule } = require("@oxlint/plugins");
const {
  returnsJsx,
  getFunctionAndDeclarator,
  hasOnlyPrimitiveProps,
  getReactImportBindings,
  isWrappedInMemo,
  getObjectPatternParam,
  getReportNode,
} = require("./utils");

const requireMemoPrimitives = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Enforce the use of React.memo for components with primitive props",
    },
  },
  create(context) {
    let reactImports;

    function check(node) {
      const match = getFunctionAndDeclarator(node, reactImports);
      if (!match) return;
      const { fn, declarator } = match;

      if (!returnsJsx(fn.body)) return;

      const objectPattern = getObjectPatternParam(fn);
      if (!objectPattern || objectPattern.properties.length === 0) return;

      if (!hasOnlyPrimitiveProps(objectPattern)) return;

      if (!isWrappedInMemo(declarator, reactImports)) {
        context.report({
          message:
            "Component with primitive props should be wrapped in React.memo",
          node: getReportNode(fn, declarator),
        });
      }
    }

    return {
      Program(node) {
        reactImports = getReactImportBindings(node);
      },
      ArrowFunctionExpression: check,
      FunctionExpression: check,
      FunctionDeclaration: check,
    };
  },
});

const noUnnecessaryMemo = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow wrapping components with no props in React.memo",
    },
  },
  create(context) {
    let reactImports;

    function check(node) {
      const match = getFunctionAndDeclarator(node, reactImports);
      if (!match) return;
      const { fn, declarator } = match;

      if (!returnsJsx(fn.body)) return;
      if (!isWrappedInMemo(declarator, reactImports)) return;

      const hasProps =
        fn.params.length > 0 &&
        !(
          fn.params[0].type === "ObjectPattern" &&
          fn.params[0].properties.length === 0
        );

      if (!hasProps) {
        context.report({
          message:
            "Component with no props does not need to be wrapped in React.memo",
          node: declarator,
        });
      }
    }

    return {
      Program(node) {
        reactImports = getReactImportBindings(node);
      },
      ArrowFunctionExpression: check,
      FunctionExpression: check,
    };
  },
});

const plugin = definePlugin({
  meta: { name: "react-memo-primitives" },
  rules: {
    "require-memo-primitives": requireMemoPrimitives,
    "no-unnecessary-memo": noUnnecessaryMemo,
  },
});

module.exports = plugin;
