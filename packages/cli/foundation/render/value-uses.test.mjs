// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Import value uses resolve through scope: a parameter or a local
 * binding of the same name is not the import, and a reference in a type is
 * not a value use.
 */

import {parse} from '@babel/parser';
import {describe, expect, it} from 'vitest';
import {droppedImports, importUses} from './value-uses.mjs';

const tsx = (/** @type {string} */ source) =>
  parse(source, {sourceType: 'module', plugins: ['typescript', 'jsx']});

/** The local names each import binds that the module uses as values. */
const usedNames = (/** @type {string} */ source) =>
  [...importUses(tsx(source)).values()]
    .flat()
    .filter(each => each.values.length > 0)
    .map(each => each.specifier.local.name);

describe('importUses', () => {
  it('does not count a parameter or a local binding named like an import', () => {
    const source = [
      "import {Button, Card} from '@astryxdesign/core';",
      'function Row({Button}: any) { return <Button.Icon />; }',
      'const rows = [{Button: () => null}].map(({Button}, i) => <Button.Icon key={i} />);',
      'function Lede() { const Card = {Lede: () => null}; return <Card.Lede />; }',
    ].join('\n');
    expect(usedNames(source)).toEqual([]);
  });

  it('counts JSX, members, calls and re-exports of the import itself', () => {
    const source = [
      "import {A, B, C, D} from 'x';",
      'export const a = <A.Item />;',
      'B();',
      'export const c = C.value;',
      'export {D};',
    ].join('\n');
    expect(usedNames(source)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('does not count a reference in a type', () => {
    const source = [
      "import {Model, Ns} from 'x';",
      'export type Shape = Model;',
      'export const size: Ns.Size = 1;',
      'export const twice = (Model: number) => Model * 2;',
    ].join('\n');
    expect(usedNames(source)).toEqual([]);
  });
});

describe('droppedImports', () => {
  it('drops a module only when every static import of it is dropped', () => {
    const source = [
      "import type {T} from 'types-only';",
      "import {Model} from 'used-as-type';",
      "import {unused} from 'unused';",
      "import 'effects';",
      "import {Shape} from 'kept';",
      "import {make} from 'kept';",
      "import {Twice} from 'kept-twice';",
      "import {Again} from 'kept-twice';",
      'export const value: Model & Shape & T = make(Again);',
    ].join('\n');
    expect([...droppedImports(tsx(source))].sort()).toEqual([
      'types-only',
      'unused',
      'used-as-type',
    ]);
  });
});
