"use strict";

const {
  returnsJsx,
  getFunctionAndDeclarator,
  hasOnlyPrimitiveProps,
  getReactImportBindings,
  isWrappedInMemo,
  getObjectPatternParam,
  getReportNode,
  getParserServices,
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
      unnecessaryMemoNonPrimitive:
        "Component with a non-primitive prop (object, function, ref, or other unresolvable type) should not be wrapped in React.memo — memo only pays off when every prop is primitive, since a non-primitive prop can still change identity on every render",
    },
  },
  create(context) {
    let reactImports;
    let programNode;
    const checkerCtx = getParserServices(context);

    function check(node) {
      const match = getFunctionAndDeclarator(node, reactImports);
      if (!match) return;
      const { fn, declarator } = match;

      if (!returnsJsx(fn.body)) return;

      const objectPattern = getObjectPatternParam(fn);
      if (!objectPattern || objectPattern.properties.length === 0) return;

      const wrapped = isWrappedInMemo(declarator, reactImports);
      const allPrimitive = hasOnlyPrimitiveProps(
        objectPattern,
        programNode,
        checkerCtx,
      );

      if (allPrimitive && !wrapped) {
        context.report({
          node: getReportNode(fn, declarator),
          messageId: "missingMemo",
        });
      } else if (!allPrimitive && wrapped) {
        context.report({
          node: getReportNode(fn, declarator),
          messageId: "unnecessaryMemoNonPrimitive",
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
};
