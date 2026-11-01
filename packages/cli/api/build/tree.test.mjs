// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file build's tree end to end, offline: the network and subprocesses throw,
 * and build still answers. The block picker changes only the kit's blocks:
 * the start, its alternatives, and every other field stay build's own, the
 * block count is build's own, and the blocks it names are pinned per phrase.
 */

import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';

// vi.mock calls are hoisted above the imports; the stub maker is hoisted with them.
const {blocked} = vi.hoisted(() => ({
  /** @param {string} name */
  blocked: name => async (/** @type {() => Promise<any>} */ load) => {
    const real = await load();
    /** @type {Record<string, unknown>} */
    const stub = {};
    for (const [key, value] of Object.entries(real)) {
      stub[key] =
        typeof value === 'function'
          ? () => {
              throw new Error(`build reached ${name}.${key}`);
            }
          : value;
    }
    return {...stub, default: stub};
  },
}));
vi.mock('node:http', blocked('http'));
vi.mock('node:https', blocked('https'));
vi.mock('node:net', blocked('net'));
vi.mock('node:dns', blocked('dns'));
vi.mock('node:child_process', blocked('child_process'));
vi.mock('http', blocked('http'));
vi.mock('https', blocked('https'));
vi.mock('net', blocked('net'));
vi.mock('dns', blocked('dns'));
vi.mock('child_process', blocked('child_process'));

const {build} = await import('./build.mjs');
const {buildKit} = await import('./kit/kit.mjs');
const {loadBlockPicker, withListingCache} = await import('./_adapter.mjs');

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

/**
 * Hand-written phrases and the blocks the picker names for each. The rest of
 * the answer carries search results, which change whenever the docs do, so it
 * is compared with build's own kit rather than pinned.
 * @type {[string, string[]][]}
 */
const PINNED = [
  [
    'analytics dashboard with a KPI row and a sortable table',
    [
      'TableSortableTable',
      'TableGridDividersTable',
      'TableShowcase',
      'TableGroupedRowsTable',
      'TableStripedTable',
    ],
  ],
  [
    'settings page with notification toggles and a save bar',
    [
      'SwitchShowcase',
      'SwitchSettingsPanel',
      'ToggleButtonShowcase',
      'ToggleButtonStates',
      'SwitchWithDescription',
    ],
  ],
  [
    'empty state for a question bank with an import button',
    [
      'EmptyStateContainer',
      'EmptyStateShowcase',
      'EmptyStateCompact',
      'EmptyStateActions',
      'CommandPaletteEmptyShowcase',
    ],
  ],
  [
    'login form with single sign-on buttons',
    [
      'ButtonWithIcon',
      'CardWithInnerLayout',
      'ButtonVariants',
      'FormLayoutShowcase',
      'FormLayoutMixedControls',
    ],
  ],
  [
    'calendar for booking appointments',
    [
      'CalendarSingle',
      'CalendarShowcase',
      'CalendarConstraints',
      'CalendarRangeWithValue',
      'CalendarTwoMonths',
    ],
  ],
  [
    'kanban board for sprint tasks with a filter bar',
    ['ToolbarTableFilter', 'PowerSearchShowcase'],
  ],
];

/** @type {typeof globalThis.fetch} */
let realFetch;
beforeAll(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error('build reached fetch');
  };
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

describe('build tree', () => {
  it('keeps a block the request names by its exact name in build’s slot', async () => {
    const phrase = 'calendar for booking appointments with CalendarTwoMonths';
    const answer = await build(phrase, {cwd: REPO});
    const own = await withListingCache(() => buildKit(phrase, {cwd: REPO}));
    if (answer?.type !== 'build.kit' || own.type !== 'build.kit')
      throw new Error('expected a kit');
    const k = own.data.blocks.findIndex(b => b.name === 'CalendarTwoMonths');
    expect(k).toBeGreaterThanOrEqual(0);
    expect(answer.data.blocks[k].name).toBe('CalendarTwoMonths');
  });

  it('runs with the network and subprocesses blocked', async () => {
    const cp = await import('node:child_process');
    const https = await import('node:https');
    expect(() => cp.execFileSync('true')).toThrow(/build reached/);
    expect(() => https.request('https://example.com')).toThrow(/build reached/);
    expect(() => globalThis.fetch('https://example.com')).toThrow(
      /build reached/,
    );
  });

  it('loads the block picker weights as plain numbers', () => {
    expect(loadBlockPicker()).not.toBeNull();
  });

  for (const [phrase, blocks] of PINNED) {
    it(`answers "${phrase}" offline with the picker's blocks`, async () => {
      const answer = await build(phrase, {cwd: REPO});
      const own = await withListingCache(() => buildKit(phrase, {cwd: REPO}));
      if (answer?.type !== 'build.kit' || own.type !== 'build.kit')
        throw new Error('expected a kit');
      // Only the blocks move: the start, its alternatives, and every other
      // field are build's own.
      expect({...answer.data, blocks: null}).toEqual({
        ...own.data,
        blocks: null,
      });
      expect(answer.data.start?.alternatives).toEqual(
        own.data.start?.alternatives,
      );
      // Every block is build's own entry, one search returned, or the picker's
      // own, each with its real score and reason; never more blocks than
      // build's own.
      expect(answer.data.blocks.length).toBe(own.data.blocks.length);
      for (const b of answer.data.blocks) {
        expect(b.score).toBeGreaterThan(0);
        expect(typeof b.reason).toBe('string');
        const mine = own.data.blocks.find(o => o.name === b.name);
        if (mine) expect(mine).toEqual(b);
      }
      expect(answer.data.blocks.map(b => b.name)).toEqual(blocks);
      // Never longer than build's own answer for the same request.
      expect(Buffer.byteLength(JSON.stringify(answer))).toBeLessThanOrEqual(
        Buffer.byteLength(JSON.stringify(own)),
      );
    });
  }
});
