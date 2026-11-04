// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A documented type judged against the type the code declares: a match
 * or a mismatch only where both sides read exactly, else not compared.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {afterAll, describe, expect, it} from 'vitest';
import {judgeType} from './type-match.mjs';

const ts = createRequire(import.meta.url)('typescript');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-type-match-'));
afterAll(() => fs.rmSync(dir, {recursive: true, force: true}));
// React's types, as a global `React` namespace the way they declare it.
const reactTypes = path.join(dir, 'node_modules', '@types', 'react');
fs.mkdirSync(reactTypes, {recursive: true});
fs.writeFileSync(
  path.join(reactTypes, 'index.d.ts'),
  'export = React;\nexport as namespace React;\ndeclare namespace React {\n  type Key = string | number | bigint;\n  interface KeyboardEvent<T = Element> { key: string; currentTarget: T }\n}\n',
);

/**
 * Judges documented types against the props of `Props` in `source`.
 * @param {string} source
 * @returns {(prop: string, docType: string) => string}
 */
function judgeIn(source) {
  const file = path.join(dir, 'props.ts');
  fs.writeFileSync(file, source);
  const program = ts.createProgram([file], {
    strict: true,
    noEmit: true,
    typeRoots: [path.join(dir, 'node_modules', '@types')],
    types: ['react'],
  });
  const checker = program.getTypeChecker();
  const props = checker.getTypeAtLocation(
    program
      .getSourceFile(file)
      .statements.find(
        (/** @type {any} */ s) =>
          ts.isInterfaceDeclaration(s) && s.name.text === 'Props',
      ).name,
  );
  return (prop, docType) => {
    const symbol = checker.getPropertyOfType(props, prop);
    const declaration = symbol.valueDeclaration;
    return judgeType(docType, [checker.getTypeOfSymbol(symbol)], {
      ts,
      checker,
      location: declaration,
      optional: (symbol.flags & ts.SymbolFlags.Optional) !== 0,
      isDefaultLibrary: (/** @type {any} */ f) =>
        program.isSourceFileDefaultLibrary(f),
      written: [[declaration.type.getText()]],
    });
  };
}

describe('judgeType', () => {
  it("judges exact parts in any order, names for them, a mutable array for a readonly one, an enum member beside its value, literals that hold `|` or `readonly`, `React.X` as React's own, and a member another covers, and compares no other form", () => {
    const judge = judgeIn(`enum Color { Red = 'red', Blue = 'blue' }
enum Hue { Red = 'red', Blue = 'blue' }
enum Letter { A = 'a', B = 'b' }
enum Odd { Lone = '\\uD800' }
type Size = 'sm' | 'md';
type Key = 'a' | 'b';
export interface Props {
  label: string;
  size?: Size;
  tags: readonly string[];
  names: string[];
  color: Color;
  count: number | null;
  onPick: (value: string) => void;
  pair: 'a' | 'b';
  letter: Letter | 'a' | 'b';
  bracket: 'readonly[x';
  onMode: (mode: 'readonly' | 'edit') => void;
  onKey: (event: KeyboardEvent) => void;
  onReactKey: (event: React.KeyboardEvent) => void;
  rowKey: string | number | bigint;
  pick: Key;
  odd: Odd;
  list: (string | number)[];
  frozen: readonly (string | number)[];
  bag: object;
  nothing: void;
}
`);
    expect(
      [
        ['label', 'string'],
        ['label', 'number'],
        ['size', "'md' | 'sm'"],
        ['size', 'Size'],
        ['size', "'sm'"],
        ['size', "Size = 'sm'"],
        ['tags', 'string[]'],
        ['names', 'readonly string[]'],
        ['color', 'Color'],
        ['color', 'Hue'],
        ['color', "'red' | 'blue'"],
        ['count', 'number | null'],
        ['count', 'number'],
        ['onPick', '(value: string) => void'],
        ['onPick', '() => void'],
        ['pair', `"a'|'b"`],
        ['pair', "Letter | 'a' | 'b'"],
        ['letter', "'a' | 'b'"],
        ['bracket', "'[x'"],
        ['onMode', "(mode: 'edit' | 'readonly') => void"],
        ['onKey', '(event: KeyboardEvent) => void'],
        ['onKey', '(event: React.KeyboardEvent) => void'],
        ['onReactKey', '(e: React.KeyboardEvent) => void'],
        ['rowKey', 'React.Key'],
        ['pick', 'Key'],
        ['pick', 'React.Key'],
        ['odd', 'Odd'],
        ['odd', 'Odd | null'],
        ['list', 'string[] | (string | number)[]'],
        ['frozen', 'string[] | readonly (string | number)[]'],
        ['list', 'readonly string[] | (string | number)[]'],
        ['bag', 'object | string[]'],
        ['nothing', 'void | undefined'],
        ['label', 'any text'],
      ].map(([prop, docType]) => `${prop}: ${docType} ${judge(prop, docType)}`),
    ).toEqual([
      'label: string match',
      'label: number mismatch',
      "size: 'md' | 'sm' match",
      'size: Size match',
      "size: 'sm' mismatch",
      "size: Size = 'sm' match",
      'tags: string[] match',
      'names: readonly string[] mismatch',
      'color: Color match',
      'color: Hue mismatch',
      "color: 'red' | 'blue' mismatch",
      'count: number | null match',
      'count: number mismatch',
      'onPick: (value: string) => void match',
      'onPick: () => void not_compared',
      `pair: "a'|'b" mismatch`,
      "pair: Letter | 'a' | 'b' match",
      "letter: 'a' | 'b' match",
      "bracket: '[x' mismatch",
      "onMode: (mode: 'edit' | 'readonly') => void match",
      'onKey: (event: KeyboardEvent) => void match',
      'onKey: (event: React.KeyboardEvent) => void not_compared',
      'onReactKey: (e: React.KeyboardEvent) => void match',
      'rowKey: React.Key match',
      'pick: Key match',
      'pick: React.Key mismatch',
      'odd: Odd match',
      'odd: Odd | null mismatch',
      'list: string[] | (string | number)[] match',
      'frozen: string[] | readonly (string | number)[] match',
      'list: readonly string[] | (string | number)[] mismatch',
      'bag: object | string[] match',
      'nothing: void | undefined match',
      'label: any text not_compared',
    ]);
  });
});
