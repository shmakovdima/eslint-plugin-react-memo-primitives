"use strict";

/**
 * Returns true when the node's body is (or contains, at the top level) a JSX return.
 */
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

/**
 * Extracts the function node (ArrowFunctionExpression | FunctionExpression) and its
 * enclosing VariableDeclarator for:
 *   - `const Foo = (props) => ...` / `const Foo = function (props) {}`
 *   - `const Foo = memo((props) => ...)` / `const Foo = React.memo(function (props) {})`
 * or null when the node isn't one of the supported component shapes. A memo-wrapped function's
 * direct parent is the `memo(...)` CallExpression, not the VariableDeclarator, so that case is
 * unwrapped one level before falling back to the plain-declarator check.
 */
function getFunctionAndDeclarator(node, reactImports) {
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
    looksLikeMemoCallExpression(parent) &&
    parent.parent?.type === "VariableDeclarator"
  ) {
    return { fn: node, declarator: parent.parent };
  }
  return null;
}

/**
 * Structural-only check ("is this callee named `memo` or `X.memo`?") used solely to decide
 * whether getFunctionAndDeclarator should unwrap a CallExpression wrapper at all — it must not
 * consult reactImports, so a *shadowed* `memo(...)` call still unwraps to its declarator (letting
 * isWrappedInMemo/isMemoCallExpression correctly report it as NOT wrapped) rather than being
 * skipped entirely as an unrecognized component shape. Non-memo wrappers like `connect(...)` are
 * still correctly skipped, since their callee name isn't `memo`/`*.memo` at all.
 */
function looksLikeMemoCallExpression(node) {
  const { callee } = node;
  if (callee.type === "Identifier" && callee.name === "memo") return true;
  return (
    callee.type === "MemberExpression" &&
    callee.property.type === "Identifier" &&
    callee.property.name === "memo"
  );
}

/**
 * Heuristic: a destructured prop counts as "primitive" if it's a plain identifier binding
 * that starts with a lowercase letter and isn't literally named `props`. This is a naming
 * heuristic, not a type check — ESLint's AST alone can't tell a primitive from an object.
 */
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

/**
 * Scans a Program's top-level `import` statements for bindings that come from `'react'`,
 * so `isMemoCallExpression` can tell a real `memo`/`React` import apart from a same-named
 * identifier shadowed by an import from somewhere else. Returns `{ memoNames, reactNames }`,
 * both Sets of local binding names (handles `import { memo as m } from 'react'` etc.) — a name
 * with no reactNames/memoNames entry has no import info at all and isn't treated as shadowed.
 */
function getReactImportBindings(programNode) {
  const memoNames = new Set();
  const reactNames = new Set();
  const shadowedNames = new Set();

  for (const statement of programNode.body) {
    if (statement.type !== "ImportDeclaration") continue;
    const fromReact = statement.source.value === "react";

    for (const specifier of statement.specifiers) {
      const localName = specifier.local.name;
      if (fromReact) {
        if (
          specifier.type === "ImportSpecifier" &&
          specifier.imported.name === "memo"
        ) {
          memoNames.add(localName);
        } else if (
          specifier.type === "ImportDefaultSpecifier" ||
          specifier.type === "ImportNamespaceSpecifier"
        ) {
          reactNames.add(localName);
        }
      } else {
        shadowedNames.add(localName);
      }
    }
  }

  return { memoNames, reactNames, shadowedNames };
}

/**
 * `reactImports` (from getReactImportBindings) is optional: when omitted, falls back to the
 * pure name-based heuristic. When present, an identifier that's provably imported from a
 * non-react module is rejected even if it happens to be named `memo`/`React`.
 */
function isMemoCallExpression(node, reactImports) {
  if (!node || node.type !== "CallExpression") return false;
  const { callee } = node;
  if (callee.type === "Identifier" && callee.name === "memo") {
    if (reactImports?.shadowedNames.has("memo")) return false;
    return true;
  }
  if (
    callee.type === "MemberExpression" &&
    callee.object.type === "Identifier" &&
    callee.object.name === "React" &&
    callee.property.type === "Identifier" &&
    callee.property.name === "memo"
  ) {
    if (reactImports?.shadowedNames.has("React")) return false;
    return true;
  }
  return false;
}

/**
 * For a FunctionDeclaration, "wrapped in memo" means the declaration itself is unwrapped
 * (a plain `function Foo() {}` can't be wrapped in memo without becoming a variable), so this
 * only applies to the VariableDeclarator init shape: `const Foo = memo((props) => ...)`.
 */
function isWrappedInMemo(declarator, reactImports) {
  return Boolean(
    declarator &&
    declarator.init &&
    isMemoCallExpression(declarator.init, reactImports),
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
  getReactImportBindings,
  isMemoCallExpression,
  isWrappedInMemo,
  getObjectPatternParam,
  getReportNode,
};
