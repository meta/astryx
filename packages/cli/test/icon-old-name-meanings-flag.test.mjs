// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * `astryx experimental icon --meanings` replaces the old option name, with no alias.
 * No file names the old spelling except the changelogs and this rename's
 * own release notes.
 */

import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {runCli} from '../test-utils/run-cli.mjs';
import {
  glyphsData,
  writeIconSetProject,
} from '../test-utils/icon-set-fixture.mjs';

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

/** The old spelling, built from parts so this file does not name it. */
const OLD = new RegExp(`--${'defin' + 'ition'}s\\b`, 'u');

const TEXT = /\.(?:mjs|cjs|js|ts|tsx|md|json|yml|yaml)$/u;

/**
 * Files that may name an old spelling on purpose: the changelogs, the
 * release notes of the icon renames, and the tests that prove each old
 * spelling is gone.
 * @param {string} file
 */
const exempt = file =>
  path.basename(file) === 'CHANGELOG.md' ||
  /^icon-names-.*\.md$/u.test(path.basename(file)) ||
  /^icon-old-name-.*\.test\.mjs$/u.test(path.basename(file));

/** The tracked text files: untracked and ignored output is not the source. */
const trackedFiles = () =>
  execFileSync('git', ['ls-files', '-z'], {cwd: REPO, encoding: 'utf8'})
    .split('\0')
    .filter(file => file && TEXT.test(file) && !exempt(file))
    .map(file => path.join(REPO, file))
    .filter(file => fs.existsSync(file));

describe('the old name of experimental icon --meanings', () => {
  it('appears in no file outside the changelogs and the rename notes', () => {
    const found = [];
    for (const file of trackedFiles()) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, at) => {
        if (OLD.test(line)) found.push(`${path.relative(REPO, file)}:${at + 1}`);
      });
    }
    expect(found).toEqual([]);
  });

  /** @type {string} */
  let tmp;
  /** @type {string} */
  let cwd;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icon-old-name-'));
    cwd = writeIconSetProject(tmp, {packages: [{data: glyphsData()}]});
  });
  afterEach(() => {
    fs.rmSync(tmp, {recursive: true, force: true});
  });

  it('refuses the old option as unknown', async () => {
    const res = await runCli(
      ['experimental', 'icon', `--${'defin' + 'ition'}s`],
      cwd,
    );
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/unknown option/iu);
  });
});
