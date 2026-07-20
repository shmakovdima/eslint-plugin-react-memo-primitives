function returnsJsx(body) {
  if (!body) return false;
  if (body.type === "JSXElement" || body.type === "JSXFragment") return true;
  if (body.type === "BlockStatement") {
    return body.body.some(
      (statement) =>
        statement.type === "ReturnStatement" &&
        (statement.argument?.type === "JSXElement" ||
          statement.argument?.type === "JSXFragment"),
    );
  }
  return false;
}

// A memo-wrapped function's direct parent is the `memo(...)` CallExpression, not the
// VariableDeclarator, so that case is unwrapped one level before falling back to the plain
// declarator check.
function getFunctionAndDeclarator(node) {
  if (node.type === "FunctionDeclaration") {
    return { fn: node, declarator: null };
  }
  if (
    node.type !== "ArrowFunctionExpression" &&
    node.type !== "FunctionExpression"
  ) {
    return null;
  }

  const parent = node.parent;
  if (parent?.type === "VariableDeclarator") {
    return { fn: node, declarator: parent };
  }
  if (
    parent?.type === "CallExpression" &&
    isMemoCallExpression(parent) &&
    parent.parent?.type === "VariableDeclarator"
  ) {
    return { fn: node, declarator: parent.parent };
  }
  return null;
}

// Heuristic, not a type check: oxlint's JS plugin API has no access to TypeScript type
// information (type-aware linting is a native-Rust-only capability), so "primitive" is
// approximated from the destructured binding name the same way the ESLint/Biome versions do.
function hasOnlyPrimitiveProps(objectPattern) {
  return objectPattern.properties.every((prop) => {
    if (prop.type === "RestElement") return false;
    return (
      prop.type === "Property" &&
      prop.value.type === "Identifier" &&
      prop.value.name[0] === prop.value.name[0].toLowerCase() &&
      prop.value.name !== "props"
    );
  });
}

function isMemoCallExpression(node) {
  if (!node || node.type !== "CallExpression") return false;
  const { callee } = node;
  if (callee.type === "Identifier" && callee.name === "memo") return true;
  if (
    callee.type === "MemberExpression" &&
    callee.object.type === "Identifier" &&
    callee.object.name === "React" &&
    callee.property.type === "Identifier" &&
    callee.property.name === "memo"
  ) {
    return true;
  }
  return false;
}

function isWrappedInMemo(declarator) {
  return Boolean(
    declarator && declarator.init && isMemoCallExpression(declarator.init),
  );
}

function getObjectPatternParam(fn) {
  if (fn.params.length !== 1) return null;
  return fn.params[0].type === "ObjectPattern" ? fn.params[0] : null;
}

function getReportNode(fn, declarator) {
  return declarator || fn;
}

module.exports = {
  returnsJsx,
  getFunctionAndDeclarator,
  hasOnlyPrimitiveProps,
  isMemoCallExpression,
  isWrappedInMemo,
  getObjectPatternParam,
  getReportNode,
};
