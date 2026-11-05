// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file data-token-consumers.test.mjs
 * @input Tracked TypeScript source in every workspace package and app
 * @output Fails when source constructs a fallback-free `var(--color-data-*)`
 * @position Repository guard for the public dataVars consumer contract
 *
 * A literal data-variable string never reaches StyleX, so nothing retains the
 * canonical group and the color is undefined wherever no other consumer
 * imports `dataVars`. CSS-capable code passes `dataVars[...]`; raw CSS and
 * templates that cannot import it carry an explicit fallback instead.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FALLBACK_FREE_DATA_VAR = /var\(--color-data-[a-z0-9-]+\)/g;

function trackedSource() {
  return execFileSync(
    'git',
    [
      'ls-files',
      '--',
      'packages/*.ts',
      'packages/*.tsx',
      'apps/*.ts',
      'apps/*.tsx',
    ],
    {cwd: ROOT, encoding: 'utf8'},
  )
    .split('\n')
    .filter(Boolean)
    .filter(file => !/\.test\.tsx?$|\.d\.ts$/.test(file));
}

describe('data-token consumers', () => {
  it('pass dataVars instead of constructing a fallback-free var() string', () => {
    const offenders = [];
    for (const file of trackedSource()) {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      for (const match of source.matchAll(FALLBACK_FREE_DATA_VAR)) {
        const line = source.slice(0, match.index).split('\n').length;
        offenders.push(`${file}:${line} ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
