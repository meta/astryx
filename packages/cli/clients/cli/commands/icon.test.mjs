// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx experimental icon` end to end (AST-084 FR6, FR7): text and JSON, exit
 * codes, and the envelope package, driving the real program in-process.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {writeIconSetProject} from '../../../test-utils/icon-set-fixture.mjs';
import {formatCliCommand} from '../../../foundation/env/package-manager.mjs';

/**
 * A command as the CLI run in `dir` prints it: the stem depends on that
 * folder's package manager and on the run's working folder.
 * @param {string} command
 * @param {string} dir
 */
function pickedIn(command, dir) {
  const from = process.cwd();
  process.chdir(dir);
  try {
    return formatCliCommand(command, dir);
  } finally {
    process.chdir(from);
  }
}

/**
 * The no-set next step as text prints it in `dir`.
 * @param {string} dir
 */
const textNext = dir =>
  `[next] Install a package that ships an icon set, then run \`${pickedIn('astryx experimental icon use <set>', dir)}\`. To make your own set, read \`${pickedIn('astryx docs cli/experimental/icon-sets', dir)}\`.`;

/** The same next step in JSON, with bare commands. */
const JSON_NEXT =
  'Install a package that ships an icon set, then run `astryx experimental icon use <set>`. To make your own set, read `astryx docs cli/experimental/icon-sets`.';

/** @type {string} */
let tmp;
/** @type {string} */
let cwd;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icon-cli-'));
  cwd = writeIconSetProject(tmp);
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

describe('astryx experimental icon', () => {
  it('prints ranked matches with import lines; every word is the query', async () => {
    const res = await runCli(['experimental', 'icon', 'delete'], cwd);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Icons for "delete" (1)');
    expect(res.stdout).toMatch(
      /import: +import \{TrashIcon\} from '@acme\/glyphs';/,
    );
    expect(res.stdout).toMatch(/package: +@acme\/glyphs/);
    expect(res.stdout).toMatch(/variant: +solid \(TrashSolidIcon\)/);
    const many = await runCli(
      ['experimental', 'icon', 'magni', 'fier', '--json'],
      cwd,
    );
    expect(JSON.parse(many.stdout).data.query).toBe('magni fier');
  });

  it('answers icon.search, icon.detail, and icon.list as JSON', async () => {
    const search = JSON.parse(
      (await runCli(['experimental', 'icon', 'close', '--json'], cwd)).stdout,
    );
    expect(search).toMatchObject({type: 'icon.search', data: {matchCount: 1}});
    const detail = JSON.parse(
      (await runCli(['experimental', 'icon', 'glyphs/x', '--json'], cwd))
        .stdout,
    );
    expect(Object.keys(detail).slice(0, 3)).toEqual([
      'apiVersion',
      'type',
      'package',
    ]);
    expect(detail).toMatchObject({
      type: 'icon.detail',
      package: '@acme/glyphs',
    });
    const list = JSON.parse(
      (await runCli(['experimental', 'icon', '--list', '--json'], cwd)).stdout,
    );
    expect(list).toMatchObject({type: 'icon.list', data: {status: 'selected'}});
  });

  it('exits 1 with ERR_NOT_FOUND for an unknown icon, the same way in text and JSON', async () => {
    const text = await runCli(['experimental', 'icon', 'glyphs/nope'], cwd);
    const json = await runCli(
      ['experimental', 'icon', 'glyphs/nope', '--json'],
      cwd,
    );
    expect(text.code).toBe(1);
    expect(json.code).toBe(1);
    expect(JSON.parse(json.stdout).code).toBe('ERR_NOT_FOUND');
  });

  it('no match exits 0 and points at the set list', async () => {
    const res = await runCli(['experimental', 'icon', 'zebra'], cwd);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('No icons match "zebra".');
    expect(res.stdout).toContain('icon --list');
  });

  it('lists the sets in text, with the withdrawn ones', async () => {
    const broken = writeIconSetProject(path.join(tmp, 'b'), {
      packages: [{}, {name: '@acme/lines', data: '{nope'}],
    });
    const res = await runCli(['experimental', 'icon', '--list'], broken);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('name:        glyphs');
    expect(res.stdout).toContain('Withdrawn');
    expect(res.stdout).toContain('@acme/lines/lines');
  });
});

describe('astryx experimental icon with no icon set installed', () => {
  /** @type {string} */
  let bare;
  beforeEach(() => {
    bare = writeIconSetProject(path.join(tmp, 'bare'), {packages: []});
  });

  it('says no set is installed, names the matching definitions, built-in first, and how to get a set', async () => {
    const res = await runCli(['experimental', 'icon', 'close'], bare);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain(
      'No icon set is installed, so no icon matches "close".',
    );
    expect(res.stdout).toContain(
      "Core draws these names with no set; pass one to a component's icon prop:",
    );
    expect(res.stdout).toMatch(/- close: /);
    expect(res.stdout).toContain(textNext(bare));
    expect(res.stdout).not.toContain('--list');

    const json = JSON.parse(
      (await runCli(['experimental', 'icon', 'delete', '--json'], bare)).stdout,
    );
    expect(json.data).toMatchObject({
      query: 'delete',
      matchCount: 0,
      matches: [],
      reason: 'No icon set is installed.',
      definitions: [{name: 'delete', builtIn: false}],
      next: JSON_NEXT,
    });
    const text = await runCli(['experimental', 'icon', 'delete'], bare);
    expect(text.stdout).toContain(
      'Icon definitions that match; an icon set draws them once one is installed:',
    );
    expect(text.stdout).not.toContain('Core draws these names');
  });

  it('lists built-in names before other definitions, at most --limit', async () => {
    const json = JSON.parse(
      (
        await runCli(
          ['experimental', 'icon', 'remove', '--json', '--limit', '50'],
          bare,
        )
      ).stdout,
    );
    const builtIn = json.data.definitions.map(
      (/** @type {{builtIn: boolean}} */ each) => each.builtIn,
    );
    expect(builtIn).toEqual([...builtIn].sort((a, b) => Number(b) - Number(a)));
    const one = JSON.parse(
      (
        await runCli(
          ['experimental', 'icon', 'remove', '--json', '--limit', '1'],
          bare,
        )
      ).stdout,
    );
    expect(one.data.definitions).toHaveLength(1);
  });

  it('--list gives the same next step and never points back at the finder', async () => {
    const res = await runCli(['experimental', 'icon', '--list'], bare);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain(textNext(bare));
    expect(res.stdout).not.toContain('experimental icon <words>');
    const json = JSON.parse(
      (await runCli(['experimental', 'icon', '--list', '--json'], bare)).stdout,
    );
    expect(json.data).toMatchObject({
      status: 'none',
      next: JSON_NEXT,
    });
  });

  it('use, --set, and <set>/<id> say no set is installed and how to get one', async () => {
    for (const args of [
      ['experimental', 'icon', 'use', 'outline'],
      ['experimental', 'icon', 'close', '--set', 'outline'],
      ['experimental', 'icon', 'outline/x'],
    ]) {
      const json = await runCli([...args, '--json'], bare);
      expect(json.code).toBe(1);
      const body = JSON.parse(json.stdout);
      expect(body.code).toBe('ERR_NOT_FOUND');
      expect(body.error).toBe(
        'No icon set named "outline": no icon set is installed.',
      );
      expect(body.suggestions).toEqual([
        {
          name: 'astryx experimental icon use <set>',
          reason: 'after you install a package that ships an icon set',
        },
        {
          name: 'astryx docs cli/experimental/icon-sets',
          reason: 'make your own icon set',
        },
      ]);
      const text = await runCli(args, bare);
      expect(text.code).toBe(1);
      expect(text.stderr).toContain('no icon set is installed');
      expect(text.stderr).toContain(
        pickedIn('astryx experimental icon use <set>', bare),
      );
      expect(text.stderr).toContain(
        pickedIn('astryx docs cli/experimental/icon-sets', bare),
      );
    }
  });

  it('use with a set that is not installed suggests the installed sets', async () => {
    const res = await runCli(
      ['experimental', 'icon', 'use', 'glyps', '--json'],
      cwd,
    );
    expect(res.code).toBe(1);
    expect(JSON.parse(res.stdout).suggestions).toEqual(
      expect.arrayContaining([{name: 'glyphs', reason: 'installed icon set'}]),
    );
  });

  it('a set that exists but has no match keeps its own answer', async () => {
    const json = JSON.parse(
      (await runCli(['experimental', 'icon', 'zebra', '--json'], cwd)).stdout,
    );
    expect(json.data).toEqual({query: 'zebra', matchCount: 0, matches: []});
  });
});

describe('astryx experimental icon when every installed set is withdrawn', () => {
  /** @type {string} */
  let withdrawnOnly;
  beforeEach(() => {
    withdrawnOnly = writeIconSetProject(path.join(tmp, 'withdrawn'), {
      packages: [{data: '{nope'}],
    });
  });

  it('answers no match and points at --list, never "no icon set is installed"', async () => {
    const res = await runCli(['experimental', 'icon', 'close'], withdrawnOnly);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('No icons match "close".');
    expect(res.stdout).toContain('icon --list');
    expect(res.stdout).not.toContain('No icon set is installed');
    expect(res.stdout).not.toContain('Install a package');
    const json = JSON.parse(
      (await runCli(['experimental', 'icon', 'close', '--json'], withdrawnOnly))
        .stdout,
    );
    expect(json.data).toEqual({query: 'close', matchCount: 0, matches: []});
  });

  it('--list names the withdrawal reason and no install step', async () => {
    const res = await runCli(['experimental', 'icon', '--list'], withdrawnOnly);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Withdrawn');
    expect(res.stdout).toContain('@acme/glyphs/glyphs: ');
    expect(res.stdout).not.toContain('[next]');
    expect(res.stdout).not.toContain('Install a package');
    const json = JSON.parse(
      (
        await runCli(
          ['experimental', 'icon', '--list', '--json'],
          withdrawnOnly,
        )
      ).stdout,
    );
    expect(json.data).not.toHaveProperty('next');
    expect(json.data.withdrawn).toHaveLength(1);
  });

  it('use with another name points at --list; use with the withdrawn set says why', async () => {
    const other = await runCli(
      ['experimental', 'icon', 'use', 'other', '--json'],
      withdrawnOnly,
    );
    expect(other.code).toBe(1);
    expect(JSON.parse(other.stdout)).toMatchObject({
      code: 'ERR_NOT_FOUND',
      error: 'No installed icon set named "other"',
      suggestions: [
        {
          name: 'astryx experimental icon --list',
          reason: 'why each installed set is withdrawn',
        },
      ],
    });
    const named = await runCli(
      ['experimental', 'icon', 'use', 'glyphs', '--json'],
      withdrawnOnly,
    );
    expect(JSON.parse(named.stdout).error).toMatch(
      /Icon set "glyphs" is installed but withdrawn: /u,
    );
  });
});

describe('astryx experimental icon in the look the project picks', () => {
  /** @type {string} */
  let solid;
  beforeEach(() => {
    solid = writeIconSetProject(path.join(tmp, 'solid'), {
      packages: [{}, {name: '@acme/marks'}],
      config: {
        experimental: {iconSet: 'glyphs', iconVariant: 'solid'},
      },
    });
  });

  it('prints the import of the chosen look when the icon has it', async () => {
    const res = await runCli(
      ['experimental', 'icon', 'trash', '--set', 'glyphs'],
      solid,
    );
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(
      /import: +import \{TrashSolidIcon\} from '@acme\/glyphs';/,
    );
    expect(res.stdout).not.toMatch(/look: /);
    const json = JSON.parse(
      (
        await runCli(
          ['experimental', 'icon', 'trash', '--set', 'glyphs', '--json'],
          solid,
        )
      ).stdout,
    );
    expect(json.data.matches[0]).toMatchObject({
      export: 'TrashSolidIcon',
      module: '@acme/glyphs',
      import: "import {TrashSolidIcon} from '@acme/glyphs';",
    });
    expect(json.data.matches[0]).not.toHaveProperty('look');
  });

  it('keeps the default import, and says so, when the icon lacks the look', async () => {
    const res = await runCli(
      ['experimental', 'icon', 'close', '--set', 'glyphs'],
      solid,
    );
    expect(res.stdout).toMatch(
      /import: +import \{XIcon\} from '@acme\/glyphs';/,
    );
    expect(res.stdout).toMatch(/look: +no solid look; draws outline/);
    const json = JSON.parse(
      (
        await runCli(
          ['experimental', 'icon', 'close', '--set', 'glyphs', '--json'],
          solid,
        )
      ).stdout,
    );
    expect(json.data.matches[0]).toMatchObject({
      export: 'XIcon',
      look: {asked: 'solid', used: 'outline'},
    });
  });

  it('leaves a set outside the project list in its default look', async () => {
    const json = JSON.parse(
      (
        await runCli(
          ['experimental', 'icon', 'trash', '--set', 'marks', '--json'],
          solid,
        )
      ).stdout,
    );
    expect(json.data.matches[0]).toMatchObject({export: 'TrashIcon'});
    expect(json.data.matches[0]).not.toHaveProperty('look');
  });

  it('answers as before when the project picks no look', async () => {
    const json = JSON.parse(
      (await runCli(['experimental', 'icon', 'trash', '--json'], cwd)).stdout,
    );
    expect(json.data.matches[0]).toMatchObject({export: 'TrashIcon'});
    expect(json.data.matches[0]).not.toHaveProperty('look');
  });
});
