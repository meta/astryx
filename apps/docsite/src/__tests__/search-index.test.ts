// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The search API answers from the candidates the build stored.
 *
 * Gathering the CLI's catalog reads and loads the docs of every package, which
 * takes seconds. The build does it once (generated/searchIndex.ts) and the API
 * ranks the result, so a starting server answers without it. These tests hold
 * that a server's first requests read only the ranker's own data (the files
 * next.config.mjs traces for the function), and that the stored candidates
 * are the ones `astryx search` gathers in this site's project.
 */

import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {exportSearchIndex} from '@astryxdesign/cli/api';
import {recordReads} from '../../../../packages/cli/foundation/fs/read-record.mjs';
import {GET} from '../app/api/search/route';
import {searchIndex} from '../generated/searchIndex';
import {AUTOMATICITY_FIXTURE_PREFIX} from '../lib/exampleCoverage.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const REPO = path.resolve(ROOT, '../..');
const CLI = path.join(REPO, 'packages', 'cli');
const SLOW = 120_000;

/** The files the search function traces to read at run time (next.config.mjs). */
function isRankerData(file: string): boolean {
  return (
    file === path.join(CLI, 'package.json') ||
    (file.startsWith(path.join(CLI, 'api') + path.sep) &&
      file.endsWith('.json'))
  );
}

describe('search API reads', () => {
  // First in this file: it reads what a server's first requests read.
  it("answers a server's first requests without reading docs or packages", async () => {
    const read = new Map<string, string>();
    await recordReads(read, async () => {
      for (const request of [
        '/api/search?warm=1',
        '/api/search?q=button',
        '/api/search?q=date%20picker',
        '/api/search?q=how%20do%20I%20theme%20my%20app',
      ]) {
        const response = await GET(new Request(`http://site${request}`));
        expect(response.ok, request).toBe(true);
      }
    });
    const workspaceFiles = [...read.keys()].filter(
      file =>
        file.startsWith(REPO + path.sep) &&
        !file.split(path.sep).includes('node_modules'),
    );
    // The recorder saw the ranker read its data, so an empty list below means
    // nothing else was read, not that nothing was recorded.
    expect(workspaceFiles.some(isRankerData)).toBe(true);
    expect(workspaceFiles.filter(file => !isRankerData(file))).toEqual([]);
  });

  it(
    'ranks the candidates `astryx search` gathers in this project',
    async () => {
      const gathered = await exportSearchIndex({cwd: ROOT});
      // example-automaticity.test.ts keeps a temporary block in a package
      // while it runs, in another worker.
      const candidates = gathered.candidates.filter(
        candidate => candidate.name !== AUTOMATICITY_FIXTURE_PREFIX,
      );
      // A stale index means the generated data is older than the workspace:
      // run `pnpm -F @astryxdesign/docsite generate`.
      expect(searchIndex).toEqual({...gathered, candidates});
    },
    SLOW,
  );
});
