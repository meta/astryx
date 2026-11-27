// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file score-ledger-snapshot.test.mjs
 * @input Fixture parts of a wiki ledger.
 * @output Each case of score-ledger-snapshot.mjs: an item that is valid, one
 *   that is repaired, and one that is skipped and recorded.
 * @position Node tests beside the Sandbox's score-ledger generator.
 */

import {describe, expect, it} from 'vitest';
import {readSectionBlocks} from './score-ledger-snapshot.mjs';

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
