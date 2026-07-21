const { definePlugin, defineRule } = require("@oxlint/plugins");
const {
  returnsJsx,
  getFunctionAndDeclarator,
  hasOnlyPrimitiveProps,
  getReactImportBindings,
  isWrappedInMemo,
  getObjectPatternParam,
  getReportNode,
  hasDisplayNameAssignment,
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
    let programNode;

    function check(node) {
      const match = getFunctionAndDeclarator(node, reactImports);
      if (!match) return;
      const { fn, declarator } = match;

      if (!returnsJsx(fn.body)) return;

      const objectPattern = getObjectPatternParam(fn);
      if (!objectPattern || objectPattern.properties.length === 0) return;

      const wrapped = isWrappedInMemo(declarator, reactImports);
      const allPrimitive = hasOnlyPrimitiveProps(objectPattern, programNode);

      if (allPrimitive && !wrapped) {
        context.report({
          message:
            "Component with primitive props should be wrapped in React.memo",
          node: getReportNode(fn, declarator),
        });
      } else if (!allPrimitive && wrapped) {
        context.report({
          message:
            "Component with a non-primitive prop (object, function, ref, or other unresolvable type) should not be wrapped in React.memo — memo only pays off when every prop is primitive, since a non-primitive prop can still change identity on every render",
          node: getReportNode(fn, declarator),
        });
      }
    }

    return {
      Program(node) {
        reactImports = getReactImportBindings(node);
        programNode = node;
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

const requireMemoDisplayname = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Require a displayName assignment for components wrapped in React.memo",
    },
  },
  create(context) {
    let reactImports;
    let programNode;

    function check(node) {
      const match = getFunctionAndDeclarator(node, reactImports);
      if (!match) return;
      const { fn, declarator } = match;

      if (!returnsJsx(fn.body)) return;
      if (!isWrappedInMemo(declarator, reactImports)) return;
      if (!declarator || declarator.id.type !== "Identifier") return;

      const componentName = declarator.id.name;
      if (!hasDisplayNameAssignment(programNode, componentName)) {
        context.report({
          message: `Component wrapped in React.memo should have a displayName assigned (e.g. \`${componentName}.displayName = "${componentName}";\`)`,
          node: declarator,
        });
      }
    }

    return {
      Program(node) {
        reactImports = getReactImportBindings(node);
        programNode = node;
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
    "require-memo-displayname": requireMemoDisplayname,
  },
});

module.exports = plugin;
