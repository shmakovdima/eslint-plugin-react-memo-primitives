"use strict";

const {
  returnsJsx,
  getFunctionAndDeclarator,
  getReactImportBindings,
  isWrappedInMemo,
  hasDisplayNameAssignment,
} = require("../utils");

module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Require a displayName assignment for components wrapped in React.memo",
      category: "Best Practices",
      recommended: false,
    },
    fixable: null,
    schema: [],
    messages: {
      missingDisplayName:
        'Component wrapped in React.memo should have a displayName assigned (e.g. `{{name}}.displayName = "{{name}}";`)',
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
          node: declarator,
          messageId: "missingDisplayName",
          data: { name: componentName },
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
};
