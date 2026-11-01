// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The suggestions an unknown template name prints: the closest
 * templates first, and the list stops where the matches get weaker. A name
 * that shares no word with any template still lists every template.
 */

import {describe, it, expect} from 'vitest';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {template} from './template.mjs';
import {nameWords} from '../../foundation/text/suggest-order.mjs';

const cwd = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const SLOW = 30_000;

/** @param {string} name */
async function suggested(name) {
  const error = await template(name, {cwd}).catch(e => e);
  expect(error.code).toBe('ERR_UNKNOWN_TEMPLATE');
  return error.suggestions.map((/** @type {{name: string}} */ s) => s.name);
}

describe('unknown template suggestions', () => {
  it(
    'lists only templates that carry the typed words when one carries them all',
    async () => {
      const all = await suggested('zzqx-nothing-like-it');
      const near = await suggested('settings-panel');
      expect(near.length).toBeGreaterThan(0);
      expect(near.length).toBeLessThan(all.length);
      for (const name of near.slice(1)) {
        const words = nameWords(name);
        expect(words).toContain('setting');
        expect(words).toContain('panel');
      }
    },
    SLOW,
  );

  it(
    'does not narrow the list on a one-letter word',
    async () => {
      const all = await suggested('zzqx-nothing-like-it');
      expect(await suggested('a11y')).toHaveLength(all.length);
    },
    SLOW,
  );

  it(
    'lists every template when no template shares a word with the name',
    async () => {
      const all = await suggested('zzqx-nothing-like-it');
      expect(new Set(all).size).toBe(all.length);
      expect(all.length).toBeGreaterThan(100);
    },
    SLOW,
  );
});
