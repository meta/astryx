// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Build reads search as if a not-ready page template were absent: such a
 * template, however strongly it matches, takes no result slot from a block, a
 * ready page or a component, so the kit, its page list and its block list are
 * what they would be without it.
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

/** @type {object | null} */
let injected = null;

vi.mock('../../search/search.mjs', async importOriginal => {
  const actual = /** @type {Record<string, any>} */ (await importOriginal());
  return {
    ...actual,
    /** @param {string} query @param {{limit?: number}} options */
    searchCore: async (query, options) => {
      const res = await actual.searchCore(query, options);
      if (!injected) return res;
      // Search caps its results at the limit asked for, so the injected
      // template takes the slot of the last result.
      return {
        ...res,
        data: {
          ...res.data,
          results: [injected, ...res.data.results].slice(0, options.limit),
          // The injected template is one more match search counts.
          matchCount: res.data.matchCount + 1,
        },
      };
    },
  };
});

vi.mock('../_adapter.mjs', async importOriginal => {
  const actual = /** @type {Record<string, any>} */ (await importOriginal());
  return {
    ...actual,
    /** @param {string} cwd */
    loadTemplates: async cwd => {
      const templates = await actual.loadTemplates(cwd);
      // The injected template is one more page template the project holds as
      // not ready.
      return injected
        ? {
            ...templates,
            notReadyPages: [...templates.notReadyPages, {name: 'unready-hub'}],
          }
        : templates;
    },
  };
});

const {build} = await import('../build.mjs');

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../..',
);

/** A not-ready page template search ranks first. */
const unready = {
  domain: 'template',
  kind: 'page',
  name: 'unready-hub',
  package: '@astryxdesign/core',
  score: 999,
  reason: 'matches every term',
  description: 'A page whose description matches the whole idea.',
  displayName: 'Unready Hub',
  command: 'astryx template unready-hub --type page',
};

/** @param {string} idea */
async function kitOf(idea) {
  const r = await build(idea, {cwd: REPO});
  if (r.type !== 'build.kit') throw new Error(r.type);
  return r.data;
}

describe('a not-ready page template among search results', () => {
  afterEach(() => {
    injected = null;
  });

  it('leaves every block and the whole kit as they are without it', async () => {
    for (const idea of [
      // Its third page match is search's last result, so a lost slot drops
      // it from the page list.
      'export report',
      // Its search fills the result limit, and its block list reads the last
      // searched blocks, so a lost slot changes it.
      'grouped rows table with an accordion, a time input, selectors and metadata',
      'settings page with a status banner, a card, a stepper and an empty state with actions',
      'analytics dashboard with retention cohorts',
    ]) {
      const plain = await kitOf(idea);
      injected = unready;
      const steered = await kitOf(idea);
      injected = null;
      // Everything but search's own total, which counts the template.
      expect({...steered, matchCount: 0}).toEqual({...plain, matchCount: 0});
      expect(steered.matchCount).toBe(plain.matchCount + 1);
    }
  });
});
