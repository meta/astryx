// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The parse of a doc the CLI reads from its stored docs is kept per
 * user, by the doc's text, in a run that keeps catalogs. A run that reads it
 * back prints what a fresh parse prints, on stdout and on stderr, and parses
 * nothing new. Every module that imports zod loads one copy of it, in a run
 * that keeps a parse and in one that reads it back.
 */

import {describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {readKept} from '../test-utils/kept-entry.mjs';
import {
  CACHE_NAME,
  freshTmp,
  hasModuleHooks,
  keptTmp,
  run,
  usePackedCli,
} from '../test-utils/packed-gather-cache-fixture.mjs';

usePackedCli();

/**
 * The kept doc parses in a cache folder, with each file's inode.
 * @param {string} tmp
 * @returns {Map<string, number>}
 */
function docParses(tmp) {
  const dir = path.join(tmp, CACHE_NAME);
  /** @type {Map<string, number>} */
  const out = new Map();
  for (const name of fs.readdirSync(dir)) {
    if (!name.startsWith('gather-') || !name.endsWith('.json')) continue;
    const file = path.join(dir, name);
    const entry = readKept(file);
    if (entry.pure !== true || !JSON.parse(entry.key).includes('doc-parse')) {
      continue;
    }
    out.set(name, fs.statSync(file).ino);
  }
  return out;
}

describe.skipIf(!hasModuleHooks)('a kept doc parse', () => {
  it('prints what a fresh parse prints, on stdout and stderr, and a later run parses nothing new', () => {
    const tmp = keptTmp('doc-parses');
    // A first run may print a once-a-day notice; the runs compared come after.
    run(['component', 'Button'], {tmp: freshTmp(), json: false});
    for (const json of [false, true]) {
      const fresh = run(['component', 'Button'], {tmp: freshTmp(), json});
      expect(fresh.status).toBe(0);
      expect(run(['component', 'Button'], {tmp, json})).toEqual(fresh);
      expect(run(['component', 'Button'], {tmp, json})).toEqual(fresh);
    }
    const kept = docParses(tmp);
    expect(kept.size).toBeGreaterThan(0);
    run(['component', 'Button'], {tmp, json: false});
    expect(docParses(tmp)).toEqual(kept);
  });

  it('loads one copy of zod in a run that keeps a parse and in one that reads it back', () => {
    const tmp = keptTmp('doc-parses-zod');
    const log = path.join(tmp, '..', 'doc-parses-zod.log');
    const hook = path.join(tmp, '..', 'doc-parses-zod-hook.mjs');
    fs.mkdirSync(tmp, {recursive: true});
    fs.writeFileSync(
      hook,
      `import {appendFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({
  resolve(specifier, context, next) {
    const answer = next(specifier, context);
    if (/[\\\\/]node_modules[\\\\/]zod[\\\\/]/.test(answer.url)) {
      appendFileSync(${JSON.stringify(log)}, answer.url + '\\n');
    }
    return answer;
  },
});
`,
    );
    const env = {NODE_OPTIONS: `--import ${JSON.stringify(hook)}`};
    for (let i = 0; i < 2; i++) {
      fs.rmSync(log, {force: true});
      expect(run(['component', 'Button'], {tmp, json: false, env}).status).toBe(
        0,
      );
      const copies = new Set(
        fs
          .readFileSync(log, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map(url => url.replace(/([\\/]node_modules[\\/]zod)[\\/].*$/, '$1')),
      );
      expect(copies.size).toBe(1);
    }
  });
});
