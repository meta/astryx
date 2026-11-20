// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The experimental icon commands say "meaning": `icon new-meaning`,
 * `--meaning`, `--new-meaning`, `--meanings` and the docs route
 * `cli/experimental/icon-meanings`. The old names have no alias. No file
 * outside the changelogs and this rename's own release note names them, and
 * the CLI treats them as it treats any word or option it does not know.
 */

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
const SELF = fileURLToPath(import.meta.url);

/** Built from parts, so this file does not name them itself. */
const OLD = 'defin' + 'ition';
const OLD_NAMES = new RegExp(
  [
    `\\bicon new-${OLD}\\b`,
    `(?<![\\w/-])new-${OLD}(?![\\w/.-])`,
    `--new-${OLD}\\b`,
    `--${OLD}s?\\b(?!-)`,
    `cli/experimental/icon-${OLD}s\\b`,
    `\`icon-${OLD}s\` namespace`,
  ].join('|'),
  'u',
);

/** The release note of this rename names the old names on purpose. */
const RENAME_NOTE = path.join(REPO, '.changeset/icon-cli-meaning-names.md');
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'out',
  'build',
  'coverage',
  'storybook-static',
  '.next',
  '.turbo',
  '.cache',
  'test-results',
  'playwright-report',
]);
const TEXT = /\.(?:mjs|cjs|js|ts|tsx|md|json)$/u;

/**
 * @param {string} at
 * @param {string[]} out
 */
function walk(at, out) {
  const stat = fs.statSync(at, {throwIfNoEntry: false});
  if (!stat) return out;
  if (stat.isFile()) {
    if (TEXT.test(at) && path.basename(at) !== 'CHANGELOG.md') out.push(at);
    return out;
  }
  for (const entry of fs.readdirSync(at, {withFileTypes: true})) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    if (entry.isSymbolicLink()) continue;
    walk(path.join(at, entry.name), out);
  }
  return out;
}

describe('old icon names', () => {
  it("appear in no file outside the changelogs and this rename's release note", () => {
    const found = [];
    for (const file of walk(REPO, [])) {
      if (file === SELF || file === RENAME_NOTE) continue;
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, at) => {
        if (OLD_NAMES.test(line)) {
          found.push(`${path.relative(REPO, file)}:${at + 1}`);
        }
      });
    }
    expect(found).toEqual([]);
  });
});

describe('the CLI with an old icon name', () => {
  /** @type {string} */
  let tmp;
  /** @type {string} */
  let cwd;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icon-old-names-'));
    cwd = writeIconSetProject(tmp, {packages: [{data: glyphsData()}]});
  });
  afterEach(() => {
    fs.rmSync(tmp, {recursive: true, force: true});
  });

  it('refuses an old option as unknown', async () => {
    for (const args of [
      ['experimental', 'icon', `--${OLD}s`],
      [
        'experimental',
        'icon',
        'add',
        'Bin',
        '--from',
        'x',
        `--${OLD}`,
        'delete',
      ],
      [
        'experimental',
        'icon',
        'add',
        'Bin',
        '--from',
        'x',
        `--new-${OLD}`,
        'x',
      ],
    ]) {
      const res = await runCli(args, cwd);
      expect(res.code, args.join(' ')).toBe(1);
      expect(res.stderr, args.join(' ')).toMatch(/unknown option/iu);
    }
  });

  it('reads the old subcommand name as search words and writes nothing', async () => {
    const before = fs.readdirSync(cwd, {recursive: true}).length;
    const res = await runCli(
      ['experimental', 'icon', `new-${OLD}`, 'random', '--json'],
      cwd,
    );
    expect(JSON.parse(res.stdout).type).toBe('icon.search');
    expect(fs.readdirSync(cwd, {recursive: true}).length).toBe(before);
  });

  it('has no docs page at the old route', async () => {
    const res = await runCli(
      ['docs', `cli/experimental/icon-${OLD}s`, '--json'],
      cwd,
    );
    expect(res.code).toBe(1);
    const moved = await runCli(['docs', 'cli/experimental/icon-meanings'], cwd);
    expect(moved.code).toBe(0);
  });
});
