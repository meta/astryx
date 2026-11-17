// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx experimental icon <subcommand>` called bare: the finder
 * answers for the subcommand's name when it finds something, else the
 * subcommand keeps its error and names the search. A call with an argument or
 * an option runs the subcommand as before.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {
  glyphsData,
  writeIconSetProject,
} from '../../../test-utils/icon-set-fixture.mjs';

/** A set whose icons answer "add" and "map". */
function bareWordsData() {
  const data = glyphsData();
  for (const icon of data.icons) {
    if (icon.id === 'search') icon.words = [...icon.words, 'add'];
    if (icon.id === 'home') icon.words = [...icon.words, 'map'];
  }
  return data;
}

/** @type {string} */
let tmp;
/** @type {string} */
let cwd;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icon-bare-'));
  cwd = writeIconSetProject(tmp, {packages: [{data: bareWordsData()}]});
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/** @param {string[]} args */
const icon = args => runCli(['experimental', 'icon', ...args], cwd);

describe('a bare icon subcommand', () => {
  it('answers `add` as a search, with the plain envelope in JSON', async () => {
    const json = await icon(['add', '--json']);
    expect(json.code).toBe(0);
    const envelope = JSON.parse(json.stdout);
    expect(envelope).toMatchObject({
      type: 'icon.search',
      data: {query: 'add', matchCount: 1},
    });
    expect(envelope.data.matches[0]).toMatchObject({id: 'search'});
    // The envelope is the search's own: exactly what `icon add` as words
    // would print.
    const words = JSON.parse((await icon(['--json', 'add'])).stdout);
    expect(Object.keys(envelope)).toEqual(Object.keys(words));

    const text = await icon(['add']);
    expect(text.code).toBe(0);
    expect(text.stdout).toContain('Icons for "add" (1)');
    expect(text.stdout).toMatch(
      /`add` is also a subcommand: .*experimental icon add \[options\] \[export\]/,
    );
    expect(text.stderr).not.toContain('Error');
  });

  it('answers `map` as a search in text', async () => {
    const res = await icon(['map']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Icons for "map" (1)');
    expect(res.stdout).toMatch(/id: +home/);
    expect(res.stdout).toMatch(
      /`map` is also a subcommand: .*experimental icon map \[options\] \[definition\] \[icon\]/,
    );
  });

  it('answers with a definition that matches the whole name when no set is installed', async () => {
    const none = writeIconSetProject(path.join(tmp, 'none'), {packages: []});
    const json = await runCli(['experimental', 'icon', 'add', '--json'], none);
    expect(json.code).toBe(0);
    const envelope = JSON.parse(json.stdout);
    expect(envelope).toMatchObject({
      type: 'icon.search',
      data: {query: 'add', matchCount: 0},
    });
    expect(envelope.data.definitions.map(each => each.name)).toContain('add');

    const text = await runCli(['experimental', 'icon', 'add'], none);
    expect(text.code).toBe(0);
    expect(text.stdout).toContain('No icon set is installed');
    expect(text.stdout).toMatch(
      /`add` is also a subcommand: .*experimental icon add \[options\] \[export\]/,
    );
  });

  it('keeps the error when only a longer word starts with the name', async () => {
    // "user" and "users" start with "use" but are no whole-word answer.
    const none = writeIconSetProject(path.join(tmp, 'none'), {packages: []});
    const text = await runCli(['experimental', 'icon', 'use'], none);
    expect(text.code).toBe(1);
    expect(text.stdout).toBe('');
    expect(text.stderr).toContain("Error: missing required argument 'set'");
    expect(text.stderr).toMatch(/Run: .*experimental icon <words>/);

    const json = await runCli(['experimental', 'icon', 'use', '--json'], none);
    expect(json.code).toBe(1);
    expect(JSON.parse(json.stdout)).toMatchObject({
      error: "missing required argument 'set'",
      code: 'ERR_MISSING_ARGUMENT',
      suggestions: [{name: 'astryx experimental icon <words>'}],
    });
  });

  it('keeps `new-set` error when nothing is found, and names the search', async () => {
    const text = await icon(['new-set']);
    expect(text.code).toBe(1);
    expect(text.stdout).toBe('');
    expect(text.stderr).toContain("Error: missing required argument 'name'");
    expect(text.stderr).toMatch(/Run: .*experimental icon <words>/);

    const json = await icon(['new-set', '--json']);
    expect(json.code).toBe(1);
    expect(JSON.parse(json.stdout)).toEqual({
      apiVersion: 1,
      error: "missing required argument 'name'",
      code: 'ERR_MISSING_ARGUMENT',
      suggestions: [
        {
          name: 'astryx experimental icon <words>',
          reason: 'find an icon by meaning',
        },
      ],
    });
  });

  it('keeps an authoring error that finds nothing, and names the search', async () => {
    const res = await icon(['new-definition', '--json']);
    expect(res.code).toBe(1);
    expect(JSON.parse(res.stdout)).toMatchObject({
      error: "missing required argument 'name'",
      code: 'ERR_MISSING_ARGUMENT',
      suggestions: [{name: 'astryx experimental icon <words>'}],
    });
  });
});

describe('an icon subcommand with an argument or an option', () => {
  it('runs the subcommand as before', async () => {
    const add = await icon(['add', '--set', 'glyphs', '--json']);
    expect(add.code).toBe(1);
    expect(JSON.parse(add.stdout)).toEqual({
      apiVersion: 1,
      error: `Name the icon's export, such as TrashIcon; received "undefined".`,
      code: 'ERR_INVALID_ARGUMENT',
    });

    const map = await icon(['map', '--remove', '--json']);
    expect(map.code).toBe(1);
    expect(JSON.parse(map.stdout)).toMatchObject({
      error: 'Name the icon definition to map',
      code: 'ERR_MISSING_ARGUMENT',
    });
    expect(JSON.parse(map.stdout).suggestions).toHaveLength(1);

    const use = await icon(['use', '--variant', 'solid']);
    expect(use.code).toBe(1);
    expect(use.stdout).toBe('');
    expect(use.stderr.trim()).toBe("Error: missing required argument 'set'");

    const newSet = await icon(['new-set', '--dry-run', '--json']);
    expect(newSet.code).toBe(1);
    expect(JSON.parse(newSet.stdout)).toEqual({
      apiVersion: 1,
      error: "missing required argument 'name'",
      code: 'ERR_MISSING_ARGUMENT',
    });

    const used = await icon(['use', 'glyphs']);
    expect(used.code).toBe(0);
    expect(used.stdout).toContain('[ok] experimental.iconSet');
    expect(used.stdout).not.toContain('Icons for');
  });
});

describe('a bare icon subcommand outside a project', () => {
  /** @type {string} */
  let outside;
  beforeEach(() => {
    outside = path.join(tmp, 'outside');
    fs.mkdirSync(outside);
  });

  it('refuses `add` and `map` as before, in text and JSON', async () => {
    for (const name of ['add', 'map']) {
      const json = await runCli(
        ['experimental', 'icon', name, '--json'],
        outside,
      );
      expect(json.code).toBe(1);
      expect(JSON.parse(json.stdout)).toEqual({
        apiVersion: 1,
        error: `astryx experimental icon ${name} works only in a project. Run it in the icon-set package.`,
        code: 'ERR_PROJECT_REQUIRED',
      });
      const text = await runCli(['experimental', 'icon', name], outside);
      expect(text.code).toBe(1);
      expect(text.stdout).toBe('');
      expect(text.stderr).toContain(
        `Error: astryx experimental icon ${name} works only in a project.`,
      );
    }
  });

  it('keeps `use` error as before, in text and JSON', async () => {
    const json = await runCli(
      ['experimental', 'icon', 'use', '--json'],
      outside,
    );
    expect(json.code).toBe(1);
    expect(JSON.parse(json.stdout)).toEqual({
      apiVersion: 1,
      error: "missing required argument 'set'",
      code: 'ERR_MISSING_ARGUMENT',
    });
    const text = await runCli(['experimental', 'icon', 'use'], outside);
    expect(text.code).toBe(1);
    expect(text.stdout).toBe('');
    expect(text.stderr).toContain("Error: missing required argument 'set'");
    expect(text.stderr).not.toContain('experimental icon <words>');
  });
});
