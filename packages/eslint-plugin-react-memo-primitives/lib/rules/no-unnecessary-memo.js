"use strict";

const {
  returnsJsx,
  getFunctionAndDeclarator,
  isWrappedInMemo,
} = require("../utils");

module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow wrapping components with no props in React.memo",
      category: "Performance",
      recommended: false,
    },
    fixable: null,
    schema: [],
    messages: {
      unnecessaryMemo:
        "Component with no props does not need to be wrapped in React.memo",
    },
  },
  create(context) {
    function check(node) {
      const match = getFunctionAndDeclarator(node);
      if (!match) return;
      const { fn, declarator } = match;

      if (!returnsJsx(fn.body)) return;
      if (!isWrappedInMemo(declarator)) return;

      const hasProps =
        fn.params.length > 0 &&
        !(
          fn.params[0].type === "ObjectPattern" &&
          fn.params[0].properties.length === 0
        );

      if (!hasProps) {
        context.report({
          node: declarator,
          messageId: "unnecessaryMemo",
        });
      }
    }

    return {
      ArrowFunctionExpression: check,
      FunctionExpression: check,
    };
  },
};
