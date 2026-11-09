// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Compile-time-only drift-lock primitives. A parser module asserts that its
 * private (sealed) zod schema infers EXACTLY its public hand-written type via
 * `Expect<Equal<TypeOf<typeof schema>, TheType>>`; if the two drift apart the
 * assertion stops satisfying the `true` constraint and typecheck fails. Nothing
 * here is runtime — these are types only, checked under `tsconfig.authoring-contract.json`.
 */

/** True iff `A` and `B` are mutually assignable and identical. */
export type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

/**
 * True iff `A` and `B` are mutually assignable. The right strictness for a
 * schema↔type drift-lock: it still catches real drift (a missing/extra field,
 * `Partial<Record>` vs `Record`, a widened primitive) but tolerates the nominal
 * and inline-vs-named differences zod's structural inference introduces (e.g.
 * an inferred inline object literal vs its named interface). Tuples
 * suppress union distribution so discriminated unions are compared whole.
 */
export type MutuallyAssignable<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false;

/**
 * `T` without string or number index signatures, at every depth. A
 * `.passthrough()` schema infers one and a hand-written interface never has
 * one, so a lock drops them before comparing named fields. Recursive fields
 * that a schema casts to their public type compare equal by construction.
 */
export type NamedFields<T> = T extends readonly (infer U)[]
  ? NamedFields<U>[]
  : T extends (...args: never[]) => unknown
    ? T
    : T extends object
      ? {
          [
            K in keyof T as string extends K
              ? never
              : number extends K
                ? never
                : K
          ]: NamedFields<T[K]>;
        }
      : T;

/** Compiles only when `T` is exactly `true`; otherwise a type error. */
export type Expect<T extends true> = T;
