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
 * TypeScript's own primitive-ish TypeFlags, bitwise-OR'd into one mask. Covers string/number/
 * boolean/bigint literals and their keyword types, null/undefined/void/never, and enum
 * members/literals (TS enums compile to string/number values, never objects). Deliberately
 * excludes `ts.TypeFlags.Any`/`Unknown` — an untyped/unresolvable-to-TS value isn't provably
 * primitive, so it should fall through to non-primitive rather than being trusted.
 */
function buildPrimitiveTypeFlagsMask(ts) {
  return (
    ts.TypeFlags.StringLike |
    ts.TypeFlags.NumberLike |
    ts.TypeFlags.BooleanLike |
    ts.TypeFlags.BigIntLike |
    ts.TypeFlags.ESSymbolLike |
    ts.TypeFlags.VoidLike |
    ts.TypeFlags.Null |
    ts.TypeFlags.Undefined |
    ts.TypeFlags.Never |
    ts.TypeFlags.EnumLiteral |
    ts.TypeFlags.Literal
  );
}

/**
 * Asks the real TypeScript checker whether a type is primitive, recursing into union/intersection
 * constituents (all must be primitive for the whole to count as primitive) — mirrors
 * isPrimitiveTsType's AST-based union/intersection handling, but works for ANY type the checker
 * can resolve, including ones imported from other files/packages (e.g. `DehydratedState` from
 * `@tanstack/react-query`), which the AST-only path can never see. An `Object`-flagged type
 * (interfaces, type literals, arrays, tuples, function types, mapped types, class instances) is
 * always non-primitive, same as the AST path's treatment of those shapes.
 */
function isTsTypePrimitive(type, ts) {
  if (type.isUnionOrIntersection()) {
    return type.types.every((member) => isTsTypePrimitive(member, ts));
  }
  return (type.flags & buildPrimitiveTypeFlagsMask(ts)) !== 0;
}

/**
 * Looks up parser services for type-aware linting (see getParserServices) and, if a real TS
 * Program is available, maps the given ESTree type node to its TS node and asks the checker
 * directly whether it's primitive. Returns null when type-aware info isn't available for this
 * node (no parser services, or the ESTree→TS mapping doesn't have this node) — callers treat
 * null as "checker has no opinion, fall back to the AST heuristic," not "non-primitive."
 */
function isPrimitiveByChecker(typeNode, checkerCtx) {
  if (!checkerCtx) return null;
  const { ts, checker, esTreeNodeToTSNodeMap } = checkerCtx;
  const tsNode = esTreeNodeToTSNodeMap.get(typeNode);
  if (!tsNode) return null;
  const type = checker.getTypeAtLocation(tsNode);
  if (!type) return null;
  return isTsTypePrimitive(type, ts);
}

/**
 * Recursively classifies a TS type node as primitive-or-not. Unions (`string | undefined`) are
 * primitive only if every member is. A `TSTypeReference` (`LocaleType`, `MutableRefObject<T>`)
 * is, when a type-aware `checkerCtx` is available (see getParserServices — requires the
 * consumer's own ESLint config to set `parserOptions.project`), resolved via the real TypeScript
 * checker instead of the AST-only heuristic below — the checker's answer wins outright for ANY
 * reference, local or imported, since it's authoritative where the heuristic can only guess.
 * Without a checker, a `TSTypeReference` is resolved against local declarations in the same file
 * (object-shaped ones are handled by getObjectPatternMemberTypes/hasOnlyPrimitiveProps directly;
 * this function handles a reference that shows up as a *member's* type, e.g. `age: SomeEnum`):
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
 *     the two regression tests for each direction in require-memo-primitives.test.js. This
 *     heuristic is only reached when no type-aware checker is available at all.
 */
function isPrimitiveTsType(typeNode, programNode, checkerCtx) {
  if (!typeNode) return false;
  if (typeNode === PRIMITIVE_SENTINEL) return true;
  if (typeNode === NON_PRIMITIVE_SENTINEL) return false;
  if (PRIMITIVE_TS_TYPE_KINDS.has(typeNode.type)) return true;
  if (NON_PRIMITIVE_TS_TYPE_KINDS.has(typeNode.type)) return false;
  if (typeNode.type === "TSParenthesizedType") {
    return isPrimitiveTsType(typeNode.typeAnnotation, programNode, checkerCtx);
  }
  if (
    typeNode.type === "TSUnionType" ||
    typeNode.type === "TSIntersectionType"
  ) {
    return typeNode.types.every((member) =>
      isPrimitiveTsType(member, programNode, checkerCtx),
    );
  }
  if (
    typeNode.type === "TSTypeReference" &&
    typeNode.typeName.type === "Identifier"
  ) {
    const checkerVerdict = isPrimitiveByChecker(typeNode, checkerCtx);
    if (checkerVerdict !== null) return checkerVerdict;

    if (!programNode) return false;
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
      return isPrimitiveTsType(resolved.typeNode, programNode, checkerCtx);
    }
    // resolved.kind === "object" (interface / object type alias) — a nested object-shaped
    // member is never primitive.
    return false;
  }
  return false;
}

/**
 * Detects type-aware parser services (the standard typescript-eslint convention: the consumer's
 * own ESLint config sets `parserOptions.project`, giving the parser a real `ts.Program` and a
 * checker). Returns `{ ts, checker, esTreeNodeToTSNodeMap } | null` — null whenever type-aware
 * info isn't available (no `parserOptions.project`, non-TS file, or a parser that doesn't expose
 * TS parser services at all), so callers fall back to the AST-only heuristic unchanged. Checks
 * both `context.sourceCode.parserServices` (modern ESLint) and the legacy
 * `context.parserServices` for compatibility across ESLint versions.
 */
function getParserServices(context) {
  const services = context.sourceCode?.parserServices ?? context.parserServices;
  if (!services?.program || !services?.esTreeNodeToTSNodeMap) return null;

  let ts;
  try {
    // eslint-disable-next-line global-require -- only needed in type-aware mode
    ts = require("typescript");
  } catch {
    return null;
  }

  return {
    ts,
    checker: services.program.getTypeChecker(),
    esTreeNodeToTSNodeMap: services.esTreeNodeToTSNodeMap,
  };
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
 * Resolves a `TSTypeReference` node's member types via the real TypeScript checker instead of
 * local-file AST resolution — used for PropsWithChildren<T> when T is an imported type (not
 * declared in this file, so resolveLocalTypeMembers can't see it). Uses
 * `checker.getPropertiesOfType()` for each property's own type, then wraps each as a synthetic
 * TSPropertySignature carrying a PRIMITIVE_SENTINEL/NON_PRIMITIVE_SENTINEL verdict (no real
 * ESTree type node exists for a checker-only-resolved member, so a normal `: $member` type node
 * can't be fabricated — the sentinel short-circuits isPrimitiveTsType directly with the verdict
 * already computed here). Returns null if the checker can't resolve typeArgNode to an object type
 * at all (e.g. T is itself unresolvable, or resolves to a primitive/union).
 */
function resolveMembersByChecker(typeArgNode, checkerCtx) {
  const { ts, checker, esTreeNodeToTSNodeMap } = checkerCtx;
  const tsNode = esTreeNodeToTSNodeMap.get(typeArgNode);
  if (!tsNode) return null;
  const type = checker.getTypeAtLocation(tsNode);
  if (!type) return null;
  const properties = checker.getPropertiesOfType(type);
  if (!properties.length) return null;

  return properties.map((symbol) => {
    const propType = checker.getTypeOfSymbol(symbol);
    const primitive = isTsTypePrimitive(propType, ts);
    return {
      type: "TSPropertySignature",
      key: { type: "Identifier", name: symbol.name },
      typeAnnotation: {
        typeAnnotation: primitive ? PRIMITIVE_SENTINEL : NON_PRIMITIVE_SENTINEL,
      },
    };
  });
}

/**
 * A synthetic type node representing "definitely not primitive" for props that don't come from
 * a real TSPropertySignature (the implicit `children: ReactNode` injected by `PropsWithChildren<T>`
 * — see getObjectPatternMemberTypes — and, when a type-aware checker resolves a member of an
 * imported `T` that has no ESTree node of its own, see resolveMembersByChecker). isPrimitiveTsType
 * checks for these sentinels first and returns their fixed verdict directly, before any AST-kind
 * or checker lookup — same result as if the member had a real type node, without needing to
 * fabricate one.
 */
const NON_PRIMITIVE_SENTINEL = Object.freeze({
  type: "__NonPrimitiveSentinel",
});
const PRIMITIVE_SENTINEL = Object.freeze({
  type: "__PrimitiveSentinel",
});

/**
 * `React.PropsWithChildren<T>` / `PropsWithChildren<T>` (React's own generic helper type,
 * `type PropsWithChildren<P> = P & { children?: ReactNode }`) is common enough in real prop
 * types that it's handled specially: unlike an arbitrary unresolvable generic reference (which
 * has no known shape at all), this one has a well-known shape — take T's members and add a
 * synthetic non-primitive `children` member, since ReactNode is never primitive. T can be either
 * an inline object literal or a reference to a locally-declared object-shaped type/interface
 * (resolved via resolveLocalTypeDeclaration, same as any other named type reference). Returns
 * null if the reference isn't PropsWithChildren, or T isn't an inline object literal or a
 * resolvable local object-shaped type (an unresolvable named T — imported, generic — isn't
 * chased further, to avoid runaway resolution depth for a rare shape).
 */
function resolvePropsWithChildrenMembers(annotation, programNode, checkerCtx) {
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
  let members;
  if (typeArg.type === "TSTypeLiteral") {
    members = typeArg.members;
  } else if (
    typeArg.type === "TSTypeReference" &&
    typeArg.typeName.type === "Identifier"
  ) {
    if (programNode) {
      members = resolveLocalTypeMembers(programNode, typeArg.typeName.name);
    }
    // Not declared in this file (e.g. imported) — with a type-aware checker available, ask it
    // directly for T's own member types via a synthetic sentinel per member, so each one still
    // goes through isPrimitiveTsType's normal per-member checker lookup.
    if (!members && checkerCtx) {
      members = resolveMembersByChecker(typeArg, checkerCtx);
    }
  }
  if (!members) return null;

  return [
    ...members,
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
function getObjectPatternMemberTypes(objectPattern, programNode, checkerCtx) {
  const annotation = objectPattern.typeAnnotation?.typeAnnotation;
  if (!annotation) return null;

  if (annotation.type === "TSTypeLiteral") {
    return annotation.members;
  }

  const propsWithChildrenMembers = resolvePropsWithChildrenMembers(
    annotation,
    programNode,
    checkerCtx,
  );
  if (propsWithChildrenMembers) return propsWithChildrenMembers;

  if (
    annotation.type === "TSTypeReference" &&
    annotation.typeName.type === "Identifier"
  ) {
    if (programNode) {
      const localMembers = resolveLocalTypeMembers(
        programNode,
        annotation.typeName.name,
      );
      if (localMembers) return localMembers;
    }
    if (checkerCtx) {
      return resolveMembersByChecker(annotation, checkerCtx);
    }
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
function hasOnlyPrimitiveProps(objectPattern, programNode, checkerCtx) {
  const memberTypes = getObjectPatternMemberTypes(
    objectPattern,
    programNode,
    checkerCtx,
  );
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
    return isPrimitiveTsType(declaredType, programNode, checkerCtx);
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
  getParserServices,
};
