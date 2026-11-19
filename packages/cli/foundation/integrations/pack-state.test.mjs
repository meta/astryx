// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `runNpmPackJson`: npm's pack list of a package of any size reaches
 * the caller whole.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {runNpmPackJson} from './pack-state.mjs';

/** @type {string} */
let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-npm-pack-json-'));
});

afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/**
 * A stand-in for npm, run with this Node: it prints the arguments it got and
 * a pack list of `count` files, and as much text on stderr.
 * @param {number} count
 */
function fakeNpm(count) {
  const script = path.join(dir, 'fake-npm.mjs');
  fs.writeFileSync(
    script,
    [
      `const files = Array.from({length: ${count}}, (_, index) => ({path: \`dist/icons/LongGeneratedIconName\${index}Icon.js\`, size: 2048, mode: 420}));`,
      'process.stdout.write(JSON.stringify([{argv: process.argv.slice(2), files}]));',
      `process.stderr.write('npm notice '.repeat(${count}));`,
      '',
    ].join('\n'),
  );
  return {command: process.execPath, prefix: [script]};
}

describe('runNpmPackJson', () => {
  it('returns a pack list larger than a child process pipe buffer', () => {
    const count = 50_000;
    const result = runNpmPackJson(fakeNpm(count), dir, ['--dry-run'], {
      timeout: 60_000,
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout.length).toBeGreaterThan(1024 * 1024);
    const [info] = JSON.parse(result.stdout);
    expect(info.argv).toEqual(['pack', '--json', '--dry-run']);
    expect(info.files).toHaveLength(count);
    expect(result.stderr.length).toBe('npm notice '.length * count);
  });
});
