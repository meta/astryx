// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every refusal of the theme commands names a command that works: the
 * first suggestion, run as it is printed, exits 0.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-theme-refusals-'));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"app"}\n');
  fs.writeFileSync(
    path.join(dir, 'ocean.mjs'),
    "export default {name: 'ocean', tokens: {'--color-bg': '#000'}};\n",
  );
});
afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/**
 * The arguments of a printed command, from `theme` on.
 * @param {string} printed
 * @returns {string[]}
 */
function themeArgs(printed) {
  const words = printed.split(' ');
  return words
    .slice(words.indexOf('theme'))
    .map(word => word.replace(/^'|'$/g, ''));
}

describe('theme refusals name a command that works', () => {
  it.each([
    [['theme', 'use', 'nope']],
    [['theme', 'remove', 'nope']],
    [['theme', 'eject', 'buter']],
    [['theme', 'template', '../outside.ts']],
    [['theme', 'build', 'missing.theme.ts']],
    [['theme', 'build', 'ocean.mjs', '--out', '/tmp/outside.css']],
    [['theme', 'build', 'ocean.mjs', '--check', '--watch']],
    [['theme', 'build', 'ocean.mjs', 'ocean.mjs']],
    [['theme', 'build', 'ocean.mjs', '--family-key', 'fam']],
  ])(
    '%j',
    async args => {
      if (args.includes('--check')) {
        expect(
          (await runCli(['theme', 'build', 'ocean.mjs'], dir)).status,
        ).toBe(0);
      }
      const refused = await runCli(['--json', ...args], dir);
      expect(refused.status).toBe(1);
      const {suggestions} = JSON.parse(refused.stdout);
      expect(suggestions?.length, refused.stdout).toBeGreaterThan(0);

      const next = await runCli(
        ['--json', ...themeArgs(suggestions[0].name)],
        dir,
      );
      expect(next.status, `${suggestions[0].name}\n${next.stdout}`).toBe(0);
    },
    120_000,
  );

  it('suggests whole commands for an unknown slug in theme add', async () => {
    const refused = await runCli(['--json', 'theme', 'add', 'nuetral'], dir);
    const {suggestions} = JSON.parse(refused.stdout);
    expect(suggestions[0].name).toMatch(/ theme add neutral( --package \S+)?$/);
  }, 120_000);
});
