// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * One `integration check` asks npm once what a package's own folder packs:
 * its validation's template-asset, logo and shipped-import checks share one
 * answer, and its authoring checks, which never read the shipped-import
 * notes, do not run that check (pack-state.mjs `npmPackedPaths`, inside
 * `withListingCache`).
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
  requireNatively,
  stubBuiltin,
} from '../../../test-utils/native-require.mjs';

/** Each `npm pack --dry-run` the code under test starts. */
let packRuns = 0;

// Counts npm's pack listings and passes every call through.
const restore = stubBuiltin('node:child_process', real => ({
  spawnSync: (/** @type {any[]} */ ...args) => {
    const argv = Array.isArray(args[1]) ? args[1] : [];
    if (argv.includes('pack') && argv.includes('--dry-run')) packRuns += 1;
    return real.spawnSync(...args);
  },
}));
afterAll(restore);

const require = requireNatively(import.meta.url);
/** @type {typeof import('./check.mjs')} */
const {integrationCheck} = require('./check.mjs');
/** @type {typeof import('../validate-integration.mjs')} */
const {validateIntegration} = require('../validate-integration.mjs');

/** @type {string} */
let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-npm-once-'));
  /** @type {Record<string, string>} */
  const files = {
    // A `files` field: npm decides what the package ships.
    'package.json': JSON.stringify({
      name: '@acme/kit',
      version: '1.0.0',
      main: 'index.js',
      files: ['index.js', 'templates', 'astryx.integration.mjs'],
    }),
    'index.js': "export {default} from './templates/card.tsx';\n",
    'astryx.integration.mjs': "export default {templates: './templates'};\n",
    'templates/img/hero.png': 'png',
    'templates/card.doc.mjs':
      "export default {type: 'block', name: 'card', displayName: 'Card', description: 'A block.'};\n",
    'templates/card.tsx': [
      "const hero = new URL('./img/hero.png', import.meta.url);",
      'export default () => null;',
      '',
    ].join('\n'),
  };
  for (const [rel, text] of Object.entries(files)) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, text);
  }
  packRuns = 0;
});

afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

describe('what npm packs, during one check', () => {
  it('is asked once by a validation, however many of its checks ask', async () => {
    const {data} = await validateIntegration(undefined, {cwd: dir});
    expect(data.validated).toBe(true);
    expect(packRuns).toBe(1);
  });

  it('is asked once by integration check, whose authoring checks skip the shipped-import check', async () => {
    const result = await integrationCheck({cwd: dir});
    expect(result.data.validated).toBe(true);
    expect(packRuns).toBe(1);
  });

  it('is asked again by the next check', async () => {
    await validateIntegration(undefined, {cwd: dir});
    await validateIntegration(undefined, {cwd: dir});
    expect(packRuns).toBe(2);
  });
});
