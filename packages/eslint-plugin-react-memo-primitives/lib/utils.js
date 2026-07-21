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
 * Fallback heuristic used only when no TS type annotation is available (plain JS/JSX files,
 * or a destructure with no parameter type): a destructured prop counts as "primitive" if it's
 * a plain identifier binding that starts with a lowercase letter and isn't literally named
 * `props`. This cannot see real types, so it's wrong for e.g. `{ onClick }` (a function) —
 * it exists only to preserve pre-1.2.0 behavior for untyped code.
 */
function hasOnlyPrimitiveNames(objectPattern) {
  return objectPattern.properties.every((prop) => {
    if (prop.type === "RestElement") return false;
    if (prop.type !== "Property") return false;
    // `{ variant = 'trade' }` destructures as Property.value.type === "AssignmentPattern"
    // (value.left is the actual binding) — a default value alone doesn't make the prop
    // non-primitive.
    const binding =
      prop.value.type === "AssignmentPattern" ? prop.value.left : prop.value;
    return (
      binding.type === "Identifier" &&
      binding.name[0] === binding.name[0].toLowerCase() &&
      binding.name !== "props"
    );
  });
}

/**
 * TS type-node kinds that are always primitive regardless of contents.
 */
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

/**
 * TS type-node kinds that are always non-primitive regardless of contents — listed explicitly
 * (rather than relying on the final `return false` fallthrough) so a future refactor of
 * isPrimitiveTsType can't accidentally start treating one of these as primitive without a test
 * catching it. Arrays/tuples are collections (identity-sensitive even when their elements are
 * primitive), object/mapped/function types are obviously non-primitive.
 */
const NON_PRIMITIVE_TS_TYPE_KINDS = new Set([
  "TSArrayType",
  "TSTupleType",
  "TSTypeLiteral",
  "TSMappedType",
  "TSFunctionType",
  "TSConstructorType",
  "TSIndexedAccessType",
  "TSConditionalType",
]);

/**
 * Recursively classifies a TS type node as primitive-or-not. Unions (`string | undefined`) are
 * primitive only if every member is. A `TSTypeReference` (`LocaleType`, `MutableRefObject<T>`)
 * is resolved against local declarations in the same file (object-shaped ones are handled by
 * getObjectPatternMemberTypes/hasOnlyPrimitiveProps directly; this function handles a reference
 * that shows up as a *member's* type, e.g. `age: SomeEnum`):
 *   - A local `enum` is always primitive (TS enums compile to string/number values, never
 *     objects/functions).
 *   - A local type alias that itself resolves to a primitive is unwrapped and checked
 *     recursively.
 *   - A local object-shaped declaration (interface / object type alias) is never primitive.
 *   - Anything unresolvable from this file (imported type, global, generic parameter) falls back
 *     to a structural signal instead of a blanket default: a reference WITH type arguments
 *     (`MutableRefObject<T>`, `Promise<T>`, `Record<K, V>`) is a generic wrapper and is never
 *     primitive — no real primitive type takes type arguments. A bare reference with no type
 *     arguments (`LocaleType`, `Status`) is far more likely to be an imported enum or simple
 *     string/number alias (the overwhelmingly common case for prop types), so it's trusted as
 *     primitive. This isn't foolproof (an imported object-shaped type alias with no generics,
 *     e.g. `type Config = { theme: string }` imported from elsewhere, would be misclassified),
 *     but it fixes the common real-world case (enums imported from a shared types file) without
 *     reintroducing the original bug (ref/handler objects wrongly treated as primitive) — see
 *     the two regression tests for each direction in require-memo-primitives.test.js.
 */
function isPrimitiveTsType(typeNode, programNode) {
  if (!typeNode) return false;
  if (PRIMITIVE_TS_TYPE_KINDS.has(typeNode.type)) return true;
  if (NON_PRIMITIVE_TS_TYPE_KINDS.has(typeNode.type)) return false;
  if (typeNode.type === "TSParenthesizedType") {
    return isPrimitiveTsType(typeNode.typeAnnotation, programNode);
  }
  if (
    typeNode.type === "TSUnionType" ||
    typeNode.type === "TSIntersectionType"
  ) {
    return typeNode.types.every((member) =>
      isPrimitiveTsType(member, programNode),
    );
  }
  if (
    typeNode.type === "TSTypeReference" &&
    typeNode.typeName.type === "Identifier" &&
    programNode
  ) {
    const resolved = resolveLocalTypeDeclaration(
      programNode,
      typeNode.typeName.name,
    );
    if (resolved === null) {
      // Unresolvable in this file — trust a bare reference as primitive (likely enum/alias),
      // but never a generic instantiation (always a wrapper type, e.g. MutableRefObject<T>).
      return typeNode.typeArguments == null;
    }
    if (resolved.kind === "enum") return true;
    if (resolved.kind === "primitive-alias") {
      return isPrimitiveTsType(resolved.typeNode, programNode);
    }
    // resolved.kind === "object" (interface / object type alias) — a nested object-shaped
    // member is never primitive.
    return false;
  }
  return false;
}

/**
 * Resolves a type name to a local declaration in the Program body, returning a discriminated
 * result so callers can tell "resolved, and it's this shape" apart from "not declared in this
 * file at all" (imported type, global, or a type this function doesn't recognize):
 *   - `{ kind: "enum" }` for `enum Foo { ... }` — always primitive at the value level.
 *   - `{ kind: "object", members }` for `interface Foo {...}` / `type Foo = {...}` — inspected
 *     member-by-member by the caller.
 *   - `{ kind: "primitive-alias", typeNode }` for `type Foo = <non-object type>` (e.g.
 *     `type Foo = string | number`) — the caller recurses into typeNode.
 *   - `null` when no matching declaration exists in this file at all.
 */
function resolveLocalTypeDeclaration(programNode, typeName) {
  for (const statement of programNode.body) {
    if (
      statement.type === "TSEnumDeclaration" &&
      statement.id.name === typeName
    ) {
      return { kind: "enum" };
    }
    if (
      statement.type === "TSInterfaceDeclaration" &&
      statement.id.name === typeName
    ) {
      return { kind: "object", members: statement.body.body };
    }
    if (
      statement.type === "TSTypeAliasDeclaration" &&
      statement.id.name === typeName
    ) {
      if (statement.typeAnnotation.type === "TSTypeLiteral") {
        return { kind: "object", members: statement.typeAnnotation.members };
      }
      return { kind: "primitive-alias", typeNode: statement.typeAnnotation };
    }
  }
  return null;
}

/**
 * Finds a top-level `interface Foo { ... }` or `type Foo = { ... }` declaration by name in the
 * Program body, returning its member list (TSPropertySignature[]) or null if not found / not an
 * object-shaped type (e.g. `type Foo = string`, `enum Foo {...}`, or a type imported from
 * elsewhere) — callers treat null as "not an object shape in this file," not "non-primitive";
 * see getObjectPatternMemberTypes for how that distinction is used.
 */
function resolveLocalTypeMembers(programNode, typeName) {
  const resolved = resolveLocalTypeDeclaration(programNode, typeName);
  return resolved?.kind === "object" ? resolved.members : null;
}

/**
 * A synthetic type node representing "definitely not primitive" for props that don't come from
 * a real TSPropertySignature (currently just the implicit `children: ReactNode` injected by
 * `PropsWithChildren<T>` — see getObjectPatternMemberTypes). NON_PRIMITIVE_TS_TYPE_KINDS.has(...)
 * on this fake `type` always returns false and PRIMITIVE_TS_TYPE_KINDS.has(...) also returns
 * false, so isPrimitiveTsType correctly falls through to its final `return false` — same result
 * as if `children` had a real `TSTypeReference` to `ReactNode`, without needing to fabricate one.
 */
const NON_PRIMITIVE_SENTINEL = Object.freeze({
  type: "__NonPrimitiveSentinel",
});

/**
 * `React.PropsWithChildren<T>` / `PropsWithChildren<T>` (React's own generic helper type,
 * `type PropsWithChildren<P> = P & { children?: ReactNode }`) is common enough in real prop
 * types that it's handled specially: unlike an arbitrary unresolvable generic reference (which
 * has no known shape at all), this one has a well-known shape — take T's members (if T is an
 * inline object literal) and add a synthetic non-primitive `children` member, since ReactNode is
 * never primitive. Returns null if the reference isn't PropsWithChildren, or its single type
 * argument isn't an inline object literal (a named reference for T isn't chased further, to
 * avoid runaway resolution depth for a rare shape).
 */
function resolvePropsWithChildrenMembers(annotation) {
  if (
    annotation.type !== "TSTypeReference" ||
    annotation.typeArguments?.params?.length !== 1
  ) {
    return null;
  }
  const { typeName } = annotation;
  const name =
    typeName.type === "Identifier"
      ? typeName.name
      : typeName.type === "TSQualifiedName" &&
          typeName.right.type === "Identifier"
        ? typeName.right.name
        : null;
  if (name !== "PropsWithChildren") return null;

  const typeArg = annotation.typeArguments.params[0];
  if (typeArg.type !== "TSTypeLiteral") return null;

  return [
    ...typeArg.members,
    {
      type: "TSPropertySignature",
      key: { type: "Identifier", name: "children" },
      typeAnnotation: { typeAnnotation: NON_PRIMITIVE_SENTINEL },
    },
  ];
}

/**
 * Extracts the TS type annotation node for a function's single object-pattern parameter,
 * resolving a named type reference (`({ a }: Props) => ...`) to its local declaration's
 * members when possible. Returns null when there's no annotation at all, or the annotation
 * references a type this function can't resolve from the current file (imported type, generic,
 * non-object type) — callers treat null as "no type info available."
 */
function getObjectPatternMemberTypes(objectPattern, programNode) {
  const annotation = objectPattern.typeAnnotation?.typeAnnotation;
  if (!annotation) return null;

  if (annotation.type === "TSTypeLiteral") {
    return annotation.members;
  }

  const propsWithChildrenMembers = resolvePropsWithChildrenMembers(annotation);
  if (propsWithChildrenMembers) return propsWithChildrenMembers;

  if (
    annotation.type === "TSTypeReference" &&
    annotation.typeName.type === "Identifier" &&
    programNode
  ) {
    return resolveLocalTypeMembers(programNode, annotation.typeName.name);
  }

  return null;
}

/**
 * A destructured prop counts as "primitive" if its declared TS type is a primitive (string,
 * number, boolean, bigint, null, undefined, void, literal types, or unions/intersections of
 * those only). When TS type info can't be determined for a property (no parameter type
 * annotation, unresolvable type reference, computed/rest member), falls back to the pre-1.2.0
 * naming heuristic for that property so plain-JS/JSX usage keeps working unchanged.
 */
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
    if (prop.type !== "Property" || prop.key.type !== "Identifier") {
      return false;
    }

    // `{ variant = 'trade' }` destructures as Property.value.type === "AssignmentPattern"
    // (value.left is the actual binding) — a default value doesn't make the prop non-primitive,
    // so unwrap it before checking the binding shape. A nested destructure with a default
    // (`{ config = {} }`) still correctly falls through to `return false` below, since
    // `left.type` would be "ObjectPattern", not "Identifier".
    const binding =
      prop.value.type === "AssignmentPattern" ? prop.value.left : prop.value;
    if (binding.type !== "Identifier") return false;

    const declaredType = typesByName.get(prop.key.name);
    if (declaredType === undefined) {
      // No matching member found in the resolved type (e.g. index signature, computed key) —
      // fall back to the naming heuristic for just this property.
      return (
        binding.name[0] === binding.name[0].toLowerCase() &&
        binding.name !== "props"
      );
    }
    return isPrimitiveTsType(declaredType, programNode);
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

/**
 * Scans a Program's top-level statements for a `$name.displayName = ...` assignment
 * (`ExpressionStatement` wrapping an `AssignmentExpression` whose left side is a
 * `MemberExpression` `componentName.displayName`). Only a direct top-level statement is
 * recognized — an assignment nested inside another function/block isn't found, matching how
 * `displayName` is conventionally set immediately after a component's declaration.
 */
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
