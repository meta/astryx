// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file The type-text normalization the prop type judgment compares by. */

import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';
import {
  normalizeTypeText as normalize,
  typeTextTooOld,
  UNPARSED,
} from './type-text.mjs';

const ts = createRequire(import.meta.url)('typescript');
/** @type {(text: string, options?: {optional?: boolean}) => readonly string[]} */
const normalizeTypeText = (text, options = {}) =>
  normalize(text, {...options, ts});

describe('normalizeTypeText', () => {
  it.each([
    ["'b' | 'a'", '"a" | "b"'],
    ['React.ReactNode', 'ReactNode'],
    ['Array<string>', 'string[]'],
    ['ReadonlyArray<"a" | "b">', "('a' | 'b')[]"],
    ['readonly string[]', 'string[]'],
    ['Readonly<Status>', 'Status'],
    ['true | false', 'boolean'],
    ["'sm' | string", 'string'],
    ['(e: MouseEvent) => void', '(event: MouseEvent) => void'],
    ['{b: number; a?: string}', '{ a?: string, b: number }'],
    ['{ /** doc */ a: string; }', '{a: string}'],
    ['{get /*c*/ a(): string}', '{get a(): string}'],
    ['{get a(): string; b: number}', '{b: number, get a(): string}'],
    ['{set a(v: string), b: number}', '{set a(v: string); b: number}'],
    ['{a: string, b: number}', '{a: string; b: number}'],
    ['"a"|"b"', "'a' | 'b'"],
    ['string | never', 'string'],
    ['Array<() => void>', '(() => void)[]'],
    [
      'Array<(value: string) => string | undefined>',
      '((v: string) => string | undefined)[]',
    ],
    ['readonly ("a" | "b")[]', "ReadonlyArray<'a' | 'b'>"],
    ['readonly [string, number]', '[string, number]'],
    ['(() => void) | null', 'null | (() => void)'],
    ['() => (string | null)', '() => null | string'],
    ['(this: Window) => void', '(this: Window) => void'],
    ['(a: X, b: X) => a is T', '(c: X, d: X) => c is T'],
    ['Readonly<A & B>[]', '(A & B)[]'],
    ['Readonly<{a: string; b: number}>', '{b: number; a: string}'],
    ['Readonly<Record<string, string>>', 'Record<string, string>'],
    ["(v: unknown) => v is 'x'", "(value: unknown) => value is 'x'"],
    ['(a: A, b?: B) => void', '(x: A, y?: B) => void'],
    ['[a: string, b?: number]', '[string, number?]'],
    ["{'a': string}", '{a: string}'],
    ['1e3 | 1000', '1000'],
    ['T extends string ? (() => B) : C', 'T extends string ? () => B : C'],
    ['(A | B) | C', 'C | B | A'],
  ])('reads %s as %s', (a, b) => {
    expect(normalizeTypeText(a)).toEqual(normalizeTypeText(b));
  });

  it('returns a result no caller can change for the next', () => {
    const first = normalizeTypeText("'b' | 'a'");
    expect(() => /** @type {string[]} */ (first).push('c')).toThrow();
    expect(normalizeTypeText("'b' | 'a'")).toEqual(["'a'", "'b'"]);
  });

  it('drops undefined only on an optional prop', () => {
    expect(normalizeTypeText('string | undefined', {optional: true})).toEqual([
      'string',
    ]);
    expect(normalizeTypeText('string | undefined')).toEqual([
      'string',
      'undefined',
    ]);
  });

  it.each([
    ["'a' | 'b'", "'a'"],
    ['(a: string) => void', '(a: number) => void'],
    // An array of callbacks, and a callback that returns an array.
    ['(() => void)[]', '() => void[]'],
    [
      '((value: string) => string | undefined)[]',
      '(value: string) => string | undefined[]',
    ],
    ['Array<() => void>', '() => void[]'],
    // An array of an intersection, and an intersection with an array.
    ['(A & B)[]', 'A & B[]'],
    ['Array<A & B>', 'A & B[]'],
    ['(keyof T)[]', 'keyof T[]'],
    ['keyof (A & B)', 'keyof A & B'],
    // `never` that is a whole type, not a union member.
    ['(x: never) => void', '() => void'],
    ['[never]', '[]'],
    ['Array<never>', '[]'],
    // String literals as written.
    ["{a: 'x;y'}", "{a: 'x,y'}"],
    ["'readonly x'", "'x'"],
    ["'React.Node'", "'Node'"],
    // A union around a function, and one in its return.
    ['(() => ReactNode) | null', '() => ReactNode | null'],
    ['(() => string) | undefined', '() => string | undefined'],
    ['Array<(() => ReactNode) | null>', 'Array<() => ReactNode | null>'],
    ['{f: (() => ReactNode) | null}', '{f: () => ReactNode | null}'],
    // `this` is no ordinary parameter.
    ['(this: Window, e: Event) => void', '(w: Window, e: Event) => void'],
    // A conditional's false branch takes the rest of a union.
    ['T extends string ? A : B | C', '(T extends string ? A : B) | C'],
    // An array of `Readonly<A & B>` is no intersection with an array.
    ['Readonly<A & B>[]', 'A & B[]'],
    // `keyof` keeps its operand apart from the name after it.
    ['Array<keyof (B)>', 'keyof (Array<B>)'],
    // A type predicate names a parameter by its place.
    ['(a: X, b: X) => a is T', '(b: X, a: X) => a is T'],
    [
      "(a: unknown, b: unknown) => a is 'x'",
      "(b: unknown, a: unknown) => a is 'x'",
    ],
    // A function in a conditional's true branch returns only its own type.
    [
      'T extends string ? () => B : C | A',
      'T extends string ? () => A | B : C',
    ],
    // `Readonly<…>` keeps its argument grouped.
    ['Readonly<A | B> & C', 'A | (B & C)'],
    ['keyof Readonly<A & B>', '(keyof A) & B'],
    // Overloads keep their order; an intersection's members keep theirs.
    ['{(a: string): A; (a: number): B}', '{(a: number): B; (a: string): A}'],
    // Text that does not parse is kept as written.
    ['string?', 'string'],
    // Text spelled as the printer prints a type, but that does not parse.
    ['((Item[]) => void)[]', '((items: Item[]) => void)[]'],
    // A computed property name, and an index signature.
    ['{[K]: number}', '{[k: K]: number}'],
    // A method named `'new'`, and a construct signature.
    ["{'new'(): X}", '{new(): X}'],
    // A comment between two words separates them, as a space does.
    ['{get/*c*/a(): string}', '{geta(): string}'],
    // Import attributes change which file a module resolves to.
    [
      "import('dual', {with: {'resolution-mode': 'import'}}).T",
      "import('dual', {with: {'resolution-mode': 'require'}}).T",
    ],
  ])('keeps %s and %s different', (a, b) => {
    expect(normalizeTypeText(a)).not.toEqual(normalizeTypeText(b));
  });

  it('marks text that does not parse, and names a TypeScript too old to read types with', () => {
    expect(normalizeTypeText('((Item[]) => void)[]')).toEqual([
      `${UNPARSED}((Item[])=>void)[]`,
    ]);
    // Forms only the checker rejects.
    for (const text of [
      'Foo<>',
      'Array.<string>',
      '{a: Map<>}',
      'typeof Foo<>',
      '?string',
      'string?',
      '*',
      'function(string): void',
      '{[K in keyof P]: P[K]; extra: string}',
      '{public a: string}',
      '(public a: string) => void',
      '(a: string = "x") => void',
      '<in T>(x: T) => void',
      '{[k?: string]: number}',
      '{[a: string, b: string]: number}',
      "{a: string = 'x'}",
      'Foo<A,>',
    ]) {
      expect(normalizeTypeText(text)[0].startsWith(UNPARSED)).toBe(true);
    }
    expect(normalizeTypeText('Array /* v1.2 */ <string>')).toEqual([
      'string[]',
    ]);
    expect(typeTextTooOld({version: '4.7.4'})).toBe(
      'TypeScript 4.7.4 is older than 4.8, the oldest the type comparison reads; install TypeScript 5.0 through 6 (`npm install -D typescript@6`), or on TypeScript 7 add `@typescript/typescript6`, to judge them',
    );
    for (const version of ['4.8.4', '5.0.4', '6.0.3', ts.version]) {
      expect(typeTextTooOld({version})).toBeNull();
    }
  });

  it('keeps a union around a function apart from one in its return, joined as the members are', () => {
    for (const [a, b] of [
      ['(() => ReactNode) | null', '() => ReactNode | null'],
      ['(T extends string ? A : B) | C', 'T extends string ? A : B | C'],
    ]) {
      expect(normalizeTypeText(a).join('|')).not.toBe(
        normalizeTypeText(b).join('|'),
      );
    }
  });
});
