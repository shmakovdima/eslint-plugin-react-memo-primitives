module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce the use of React.memo for components with primitive props',
      category: 'Performance',
      recommended: false,
    },
    fixable: null, // or "code" or "whitespace"
    schema: [],
    messages: {
      missingMemo: 'Component with primitive props should be wrapped in React.memo',
    },
  },
  create(context) {
    return {
      'VariableDeclarator > ArrowFunctionExpression'(node) {
        // Check if it's a React component (heuristic: has a JSX return)
        if (
          node.body.type === 'JSXElement' ||
          (node.body.type === 'BlockStatement' &&
            node.body.body.some(
              (statement) =>
                statement.type === 'ReturnStatement' && statement.argument?.type === 'JSXElement'
            ))
        ) {
          // Check if the first parameter is an object pattern (props destructuring)
          if (node.params.length > 0 && node.params[0].type === 'ObjectPattern') {
            const props = node.params[0].properties;

            // Check if all props are primitives (heuristic: not from an object or array)
            const allPrimitives = props.every((prop) => {
              if (prop.type === 'Property' && prop.value.type === 'Identifier') {
                return (
                  prop.value.name[0] === prop.value.name[0].toLowerCase() &&
                  prop.value.name !== 'props'
                );
              }
              return false;
            });

            if (allPrimitives) {
              // Check if the component is wrapped with React.memo
              const variableDeclarator = node.parent;
              if (
                !variableDeclarator ||
                !variableDeclarator.init ||
                variableDeclarator.init.type !== 'CallExpression' ||
                variableDeclarator.init.callee.name !== 'memo'
              ) {
                context.report({
                  node: variableDeclarator,
                  messageId: 'missingMemo',
                });
              }
            }
          }
        }
      },
    };
  },
};
