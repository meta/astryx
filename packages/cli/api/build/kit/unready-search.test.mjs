// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Build starts only from ready page templates, so a not-ready template
 * that search ranks first, however strongly its own words match, changes no
 * start: not the direct match, not the shell lift, not the alternatives. Only
 * the reason names it, and only when the idea names it.
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
    /** @param {string} query @param {object} options */
    searchCore: async (query, options) => {
      const res = await actual.searchCore(query, options);
      if (!injected) return res;
      return {
        ...res,
        data: {...res.data, results: [injected, ...res.data.results]},
      };
    },
  };
});

const {build} = await import('../build.mjs');

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../..',
);

/** A not-ready template search ranks first with a direct-match score. */
const unready = {
  domain: 'template',
  kind: 'page',
  name: 'incident-console',
  package: '@astryxdesign/core',
  score: 999,
  reason: 'matches every term',
  description: 'A page whose description matches the whole idea.',
  displayName: 'Incident Console',
  command: 'astryx template incident-console --type page',
};

/** @param {string} idea */
async function startOf(idea) {
  const r = await build(idea, {cwd: REPO});
  if (r.type !== 'build.kit') throw new Error(r.type);
  return r.data;
}

describe('a not-ready template search ranks first', () => {
  afterEach(() => {
    injected = null;
  });

  it('changes no start, alternative or block for an idea that does not name it', async () => {
    for (const idea of [
      'employee intranet portal home',
      'weekly status report',
      'a list of incidents with severity and owners',
      'analytics dashboard with retention cohorts',
    ]) {
      const plain = await startOf(idea);
      injected = unready;
      const steered = await startOf(idea);
      injected = null;
      expect(steered.start).toEqual(plain.start);
      expect(steered.directMatch).toBe(plain.directMatch);
      expect(steered.pages).toEqual(plain.pages);
      expect(steered.blocks).toEqual(plain.blocks);
      expect(JSON.stringify(steered)).not.toContain('incident-console');
    }
  });

  it('names it in the reason only when the idea names it', async () => {
    const plain = await startOf('an incident console page');
    injected = unready;
    const named = await startOf('an incident console page');
    expect(named.start?.name).toBe(plain.start?.name);
    expect(named.start?.reason).toBe(
      `\`incident-console\` isn't ready yet, so build started from \`${plain.start?.name}\`.`,
    );
  });
});
