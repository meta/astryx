// Copyright (c) Meta Platforms, Inc. and affiliates.

import {spawnSync} from 'node:child_process';
import * as path from 'node:path';
import {describe, expect, it} from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const BIN = path.resolve(import.meta.dirname, '../bin/astryx.mjs');

// A host locale moves names only when Node carries that locale's collation
// data (official builds do; an English-only ICU build does not). Czech sorts
// "ch" after "h", so a list sorted by the host locale moves every "Ch" name.
const hasLocaleData =
  Intl.Collator.supportedLocalesOf(['cs', 'haw']).length === 2;

/**
 * The text `astryx <args>` prints in a fresh process under `lang`.
 * @param {string[]} args
 * @param {string} lang
 */
function printedUnder(args, lang) {
  const res = spawnSync(process.execPath, [BIN, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {...process.env, LANG: lang, LC_ALL: lang, NO_COLOR: '1', CI: '1'},
  });
  expect(res.status, res.stderr).toBe(0);
  return res.stdout;
}

describe.skipIf(!hasLocaleData)(
  'the CLI orders names the same way on every host',
  () => {
    it('component --list', () => {
      const expected = printedUnder(['component', '--list'], 'en_US.UTF-8');
      for (const lang of ['cs_CZ.UTF-8', 'haw_US.UTF-8'])
        expect(printedUnder(['component', '--list'], lang), lang).toBe(
          expected,
        );
    }, 60000);
  },
);
