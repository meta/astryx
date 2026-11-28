// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file score-ledger-snapshot.test.mjs
 * @input Fixture parts of a wiki ledger.
 * @output Each case of score-ledger-snapshot.mjs: an item that is valid, one
 *   that is repaired, and one that is skipped and recorded.
 * @position Node tests beside the Sandbox's score-ledger generator.
 */

import {describe, expect, it} from 'vitest';
import {
  readRows,
  readSectionBlocks,
  readSectionIds,
} from './score-ledger-snapshot.mjs';

const OPEN = [
  {id: 'B1', summary: 'The first finding', issue: null},
  {id: 'B2', summary: 'The second finding', issue: 12},
];
const WHERE = 'Button: sections.behavior.blocks';

/** Reads `blocks` and returns what it kept and what it skipped. */
function read(blocks) {
  const skipped = [];
  const kept = readSectionBlocks(blocks, OPEN, WHERE, item =>
    skipped.push(item),
  );
  return {kept, skipped};
}

describe('readSectionBlocks', () => {
  it('keeps valid BLOCK objects as they are, and skips nothing', () => {
    const blocks = [{id: 'B3', summary: 'A section finding', issue: null}];
    expect(read(blocks)).toEqual({kept: blocks, skipped: []});
  });

  it("repairs a bare id from the entry's BLOCK with that id", () => {
    expect(read(['B2'])).toEqual({kept: [OPEN[1]], skipped: []});
  });

  it('skips and records an id that blocks.open does not list', () => {
    expect(read(['B1', 'B9'])).toEqual({
      kept: [OPEN[0]],
      skipped: [
        {
          where: `${WHERE}[1]`,
          item: '"B9"',
          reason: 'blocks.open lists no BLOCK with this id',
        },
      ],
    });
  });

  it('skips and records an item that is not a BLOCK', () => {
    expect(read([42, null, ['B1']])).toEqual({
      kept: [],
      skipped: [
        {where: `${WHERE}[0]`, item: '42', reason: 'not a BLOCK'},
        {where: `${WHERE}[1]`, item: 'null', reason: 'not a BLOCK'},
        {where: `${WHERE}[2]`, item: '["B1"]', reason: 'not a BLOCK'},
      ],
    });
  });

  it('skips and records blocks that are not a list', () => {
    expect(read({id: 'B1'})).toEqual({
      kept: [],
      skipped: [
        {where: WHERE, item: '{"id":"B1"}', reason: 'not a list of BLOCKs'},
      ],
    });
  });
});

describe('readRows', () => {
  it('keeps every row that is an object, and skips nothing', () => {
    const skipped = [];
    const rows = [{component: 'Button'}, {component: 'Badge'}];
    expect(readRows(rows, item => skipped.push(item))).toEqual(rows);
    expect(skipped).toEqual([]);
  });

  it('skips and records a row that is not an object, such as null', () => {
    const skipped = [];
    const rows = readRows([{component: 'Button'}, null, 'Badge'], item =>
      skipped.push(item),
    );
    expect(rows).toEqual([{component: 'Button'}]);
    expect(skipped).toEqual([
      {where: 'components[1]', item: 'null', reason: 'not a ledger row'},
      {where: 'components[2]', item: '"Badge"', reason: 'not a ledger row'},
    ]);
  });

  it('skips and records components that are not a list, and keeps no rows', () => {
    const skipped = [];
    expect(readRows({component: 'Button'}, item => skipped.push(item))).toEqual(
      [],
    );
    expect(readRows(undefined, item => skipped.push(item))).toEqual([]);
    expect(skipped).toEqual([
      {
        where: 'components',
        item: '{"component":"Button"}',
        reason: 'not a list of rows',
      },
      {where: 'components', item: 'undefined', reason: 'not a list of rows'},
    ]);
  });

  it('skips and records a row whose component is not a string, such as an object with a toString key', () => {
    const skipped = [];
    const rows = readRows(
      [
        {component: {toString: 1}},
        {component: 42},
        {score: 1},
        {component: 'Button'},
      ],
      item => skipped.push(item),
    );
    expect(rows).toEqual([{component: 'Button'}]);
    expect(skipped).toEqual([
      {
        where: 'components[0].component',
        item: '{"toString":1}',
        reason: 'not a string',
      },
      {where: 'components[1].component', item: '42', reason: 'not a string'},
      {
        where: 'components[2].component',
        item: 'undefined',
        reason: 'not a string',
      },
    ]);
  });

  it('keeps a row whose component is named like an Object member, as data', () => {
    const skipped = [];
    const names = ['toString', 'constructor', '__proto__', 'hasOwnProperty'];
    const rows = readRows(
      JSON.parse(JSON.stringify(names.map(component => ({component})))),
      item => skipped.push(item),
    );
    expect(rows.map(row => row.component)).toEqual(names);
    expect(skipped).toEqual([]);
  });
});

describe('readSectionIds', () => {
  it('keeps each section id as data, and skips and records `__proto__`', () => {
    const skipped = [];
    const sections = JSON.parse(
      '{"__proto__":{"score":1},"toString":{"score":2},"a11y":{"score":3}}',
    );
    expect(
      readSectionIds(sections, 'Button: sections', item => skipped.push(item)),
    ).toEqual([
      ['toString', {score: 2}],
      ['a11y', {score: 3}],
    ]);
    expect(skipped).toEqual([
      {
        where: 'Button: sections.__proto__',
        item: '{"score":1}',
        reason: 'not a key the snapshot can carry',
      },
    ]);
  });
});
