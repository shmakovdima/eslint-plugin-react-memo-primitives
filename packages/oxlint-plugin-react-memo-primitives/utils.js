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

// Structural-only check ("is this callee named memo or X.memo?") used solely to decide whether
// getFunctionAndDeclarator should unwrap a CallExpression wrapper at all — it must not consult
// reactImports, so a *shadowed* memo(...) call still unwraps to its declarator (letting
// isWrappedInMemo/isMemoCallExpression correctly report it as NOT wrapped) rather than being
// skipped entirely as an unrecognized component shape. Non-memo wrappers like connect(...) are
// still correctly skipped, since their callee name isn't memo/*.memo at all.
function looksLikeMemoCallExpression(node) {
  const { callee } = node;
  if (callee.type === "Identifier" && callee.name === "memo") return true;
  return (
    callee.type === "MemberExpression" &&
    callee.property.type === "Identifier" &&
    callee.property.name === "memo"
  );
}

// Fallback heuristic used only when no TS type annotation is available (plain JS/JSX files, or
// a destructure with no parameter type): a destructured prop counts as "primitive" if it's a
// plain identifier binding that starts with a lowercase letter and isn't literally named
// `props`. This can't see real types, so it's wrong for e.g. `{ onClick }` (a function) — it
// exists only to preserve pre-1.2.0 behavior for untyped code.
function hasOnlyPrimitiveNames(objectPattern) {
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

// TS type-node kinds that are always primitive regardless of contents.
const PRIMITIVE_TS_TYPE_KINDS = new Set([
  "TSStringKeyword",
  "TSNumberKeyword",
  "TSBooleanKeyword",
  "TSBigIntKeyword",
  "TSNullKeyword",
  "TSUndefinedKeyword",
  "TSVoidKeyword",
  "TSLiteralType",
  "TSTemplateLiteralType",
]);

// Recursively classifies a TS type node (oxc's typescript-estree-compatible AST) as
// primitive-or-not. Unions/intersections are primitive only if every member is. Named type
// references (`LocaleType`, `MutableRefObject<T>`) can't be resolved to their definition from a
// single file's AST without a full type checker (oxlint's JS plugin API has none — type-aware
// linting is native-Rust-only in oxlint), so they're conservatively treated as non-primitive —
// this only matters for local type aliases that themselves resolve to a primitive, which is rare
// for prop types and safe to require memo for.
function isPrimitiveTsType(typeNode) {
  if (!typeNode) return false;
  if (PRIMITIVE_TS_TYPE_KINDS.has(typeNode.type)) return true;
  if (typeNode.type === "TSParenthesizedType") {
    return isPrimitiveTsType(typeNode.typeAnnotation);
  }
  if (
    typeNode.type === "TSUnionType" ||
    typeNode.type === "TSIntersectionType"
  ) {
    return typeNode.types.every(isPrimitiveTsType);
  }
  return false;
}

// Finds a top-level `interface Foo { ... }` or `type Foo = { ... }` declaration by name in the
// Program body, returning its member list (TSPropertySignature[]) or null if not found / not an
// object-shaped type (e.g. `type Foo = string` or a type imported from elsewhere).
function resolveLocalTypeMembers(programNode, typeName) {
  for (const statement of programNode.body) {
    if (
      statement.type === "TSInterfaceDeclaration" &&
      statement.id.name === typeName
    ) {
      return statement.body.body;
    }
    if (
      statement.type === "TSTypeAliasDeclaration" &&
      statement.id.name === typeName &&
      statement.typeAnnotation.type === "TSTypeLiteral"
    ) {
      return statement.typeAnnotation.members;
    }
  }
  return null;
}

// Extracts the TS type annotation node for a function's single object-pattern parameter,
// resolving a named type reference (`({ a }: Props) => ...`) to its local declaration's members
// when possible. Returns null when there's no annotation at all, or the annotation references a
// type this function can't resolve from the current file (imported type, generic, non-object
// type) — callers treat null as "no type info available."
function getObjectPatternMemberTypes(objectPattern, programNode) {
  const annotation = objectPattern.typeAnnotation?.typeAnnotation;
  if (!annotation) return null;

  if (annotation.type === "TSTypeLiteral") {
    return annotation.members;
  }

  if (
    annotation.type === "TSTypeReference" &&
    annotation.typeName.type === "Identifier" &&
    programNode
  ) {
    return resolveLocalTypeMembers(programNode, annotation.typeName.name);
  }

  return null;
}

// A destructured prop counts as "primitive" if its declared TS type is a primitive (string,
// number, boolean, bigint, null, undefined, void, literal types, or unions/intersections of
// those only). When TS type info can't be determined for a property (no parameter type
// annotation, unresolvable type reference, computed/rest member), falls back to the pre-1.2.0
// naming heuristic for that property so plain-JS/JSX usage keeps working unchanged.
function hasOnlyPrimitiveProps(objectPattern, programNode) {
  const memberTypes = getObjectPatternMemberTypes(objectPattern, programNode);
  if (!memberTypes) return hasOnlyPrimitiveNames(objectPattern);

  const typesByName = new Map();
  for (const member of memberTypes) {
    if (
      member.type === "TSPropertySignature" &&
      member.key.type === "Identifier"
    ) {
      typesByName.set(member.key.name, member.typeAnnotation?.typeAnnotation);
    }
  }

  return objectPattern.properties.every((prop) => {
    if (prop.type === "RestElement") return false;
    if (
      prop.type !== "Property" ||
      prop.value.type !== "Identifier" ||
      prop.key.type !== "Identifier"
    ) {
      return false;
    }

    const declaredType = typesByName.get(prop.key.name);
    if (declaredType === undefined) {
      return (
        prop.value.name[0] === prop.value.name[0].toLowerCase() &&
        prop.value.name !== "props"
      );
    }
    return isPrimitiveTsType(declaredType);
  });
}

// Scans a Program's top-level `import` statements for bindings that come from `'react'`, so
// isMemoCallExpression can tell a real memo/React import apart from a same-named identifier
// shadowed by an import from somewhere else. A name with no entry has no import info at all
// (e.g. no imports in this file/fixture) and isn't treated as shadowed.
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

// reactImports (from getReactImportBindings) is optional: when omitted, falls back to the pure
// name-based heuristic. When present, an identifier provably imported from a non-react module
// is rejected even if it happens to be named memo/React.
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

// Scans a Program's top-level statements for a `$name.displayName = ...` assignment
// (ExpressionStatement wrapping an AssignmentExpression whose left side is a MemberExpression
// componentName.displayName). Only a direct top-level statement is recognized.
function hasDisplayNameAssignment(programNode, componentName) {
  return programNode.body.some((statement) => {
    if (statement.type !== "ExpressionStatement") return false;
    const expr = statement.expression;
    if (expr.type !== "AssignmentExpression" || expr.operator !== "=") {
      return false;
    }
    const { left } = expr;
    return (
      left.type === "MemberExpression" &&
      !left.computed &&
      left.object.type === "Identifier" &&
      left.object.name === componentName &&
      left.property.type === "Identifier" &&
      left.property.name === "displayName"
    );
  });
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
  hasDisplayNameAssignment,
};
