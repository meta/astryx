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
    expect(res.stdout).toContain(
      '[next] Install a package that ships an icon set, then run `astryx experimental icon use <set>`.',
    );
    expect(res.stdout).toContain('astryx docs cli/experimental/icon-sets');
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
      next: expect.stringContaining('astryx experimental icon use <set>'),
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
    expect(res.stdout).toContain(
      '[next] Install a package that ships an icon set',
    );
    expect(res.stdout).not.toContain('experimental icon <words>');
    const json = JSON.parse(
      (await runCli(['experimental', 'icon', '--list', '--json'], bare)).stdout,
    );
    expect(json.data).toMatchObject({
      status: 'none',
      next: expect.stringContaining('astryx experimental icon use <set>'),
    });
  });

  it('use and --set say no set is installed and how to get one', async () => {
    for (const args of [
      ['experimental', 'icon', 'use', 'outline'],
      ['experimental', 'icon', 'close', '--set', 'outline'],
    ]) {
      const json = await runCli([...args, '--json'], bare);
      expect(json.code).toBe(1);
      const body = JSON.parse(json.stdout);
      expect(body.code).toBe('ERR_NOT_FOUND');
      expect(body.error).toContain('no icon set is installed');
      expect(body.error).toContain('astryx experimental icon use <set>');
      const text = await runCli(args, bare);
      expect(text.code).toBe(1);
      expect(text.stderr).toContain('no icon set is installed');
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
