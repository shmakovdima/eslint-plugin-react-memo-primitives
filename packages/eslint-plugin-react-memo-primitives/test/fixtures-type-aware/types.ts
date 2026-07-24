// Simulates types imported from elsewhere (a third-party lib, a shared types file) — the case
// isPrimitiveTsType's AST-only path can never resolve locally, and previously fell back to the
// "bare reference = primitive" heuristic.

// Object-shaped, like @tanstack/react-query's DehydratedState.
export type ImportedObjectType = {
  mutations: unknown[];
  queries: unknown[];
};

// Primitive alias, like a shared LocaleType.
export type ImportedPrimitiveType = "en" | "ru" | "fr";

export enum ImportedEnum {
  A = "a",
  B = "b",
}

export type ImportedGenericWrapper<T> = {
  value: T;
};
