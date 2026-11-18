// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `readyTemplatesOnly` reads search as if every page template that is
 * not ready yet were absent; without it, search lists every template.
 */

import {afterAll, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {searchCore} from './search.mjs';

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

/** @type {string[]} */
const made = [];
afterAll(() => {
  for (const dir of made) fs.rmSync(dir, {recursive: true, force: true});
});

/**
 * A project on this checkout's Core with one integration that has the given
 * page template, or none.
 * @param {boolean | null} isReady null: no template
 */
function project(isReady) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-ready-only-'));
  made.push(dir);
  const far = path.join(dir, 'node_modules', '@acme', 'far');
  fs.mkdirSync(path.join(dir, 'node_modules', '@astryxdesign'), {
    recursive: true,
  });
  fs.symlinkSync(
    path.join(REPO, 'packages', 'core'),
    path.join(dir, 'node_modules', '@astryxdesign', 'core'),
  );
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name: 'fx', dependencies: {'@astryxdesign/core': '*'}}),
  );
  fs.writeFileSync(
    path.join(dir, 'astryx.config.mjs'),
    "export default { integrations: ['@acme/far'] };\n",
  );
  fs.mkdirSync(path.join(far, 'templates'), {recursive: true});
  fs.writeFileSync(
    path.join(far, 'package.json'),
    JSON.stringify({name: '@acme/far', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(far, 'astryx.integration.mjs'),
    "export default { templates: './templates' };\n",
  );
  if (isReady !== null) {
    fs.writeFileSync(
      path.join(far, 'templates', 'tally.doc.mjs'),
      `export default ${JSON.stringify({type: 'page', name: 'tally', category: 'Far - Pages', description: 'Running totals per team, tallied by week.', keywords: ['tally', 'running totals'], isReady})};\n`,
    );
    fs.writeFileSync(
      path.join(far, 'templates', 'tally.tsx'),
      'export default function Page() { return null; }\n',
    );
  }
  return dir;
}

const QUERY = 'tally of running totals per team';

describe('readyTemplatesOnly', () => {
  it('reads search as if a not-ready page template were absent', async () => {
    const absent = await searchCore(QUERY, {
      cwd: project(null),
      readyTemplatesOnly: true,
    });
    const present = await searchCore(QUERY, {
      cwd: project(false),
      readyTemplatesOnly: true,
    });
    expect(JSON.stringify(present.data)).toBe(JSON.stringify(absent.data));
  }, 60_000);

  it('keeps a ready template, and search without it lists every template', async () => {
    const unready = project(false);
    const listed = await searchCore(QUERY, {cwd: unready});
    expect(listed.data.results.map(r => r.name)).toContain('tally');
    const ready = await searchCore(QUERY, {
      cwd: project(true),
      readyTemplatesOnly: true,
    });
    expect(ready.data.results.map(r => r.name)).toContain('tally');
  }, 60_000);
});
