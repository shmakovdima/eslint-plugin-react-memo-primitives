"use strict";

const {
  returnsJsx,
  getFunctionAndDeclarator,
  hasOnlyPrimitiveProps,
  getReactImportBindings,
  isWrappedInMemo,
  getObjectPatternParam,
  getReportNode,
} = require("../utils");

module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Enforce the use of React.memo for components with primitive props",
      category: "Performance",
      recommended: false,
    },
    fixable: null,
    schema: [],
    messages: {
      missingMemo:
        "Component with primitive props should be wrapped in React.memo",
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
          node: getReportNode(fn, declarator),
          messageId: "missingMemo",
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
};
