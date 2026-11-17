// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx discover` lists icon sets as their own kind (spec:AST-084
 * FR16, spec:AST-051 FR1, FR3, FR5): the package list, `--type icon-set`, a
 * search, and the item page, over the synthetic icon-set fixture.
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

/** @type {string} */
let tmp;
/** @type {string} */
let cwd;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-discover-icons-'));
  cwd = writeIconSetProject(tmp, {
    config: {
      integrations: ['@acme/glyphs'],
      experimental: {iconSet: 'glyphs'},
    },
  });
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/** @param {string[]} args */
async function json(args) {
  const res = await runCli([...args, '--json'], cwd);
  expect(res.code, res.stderr).toBe(0);
  return JSON.parse(res.stdout);
}

describe('discover icon sets', () => {
  it('lists a package’s icon sets under iconSets, and --type icon-set keeps them', async () => {
    const all = await json(['discover']);
    expect(all.data).toEqual([
      expect.objectContaining({name: '@acme/glyphs', iconSets: ['glyphs']}),
    ]);
    const only = await json(['discover', '--type', 'icon-set']);
    expect(only.data.map((/** @type {any} */ e) => e.name)).toEqual([
      '@acme/glyphs',
    ]);
    const none = await json(['discover', '--type', 'theme']);
    expect(none.data).toEqual([]);
  });

  it('shows the item page with description, license, count, default, definitions, and the icon command', async () => {
    const page = await json(['discover', '@acme/glyphs/glyphs']);
    expect(page).toMatchObject({
      type: 'discover.item',
      // The envelope names the package the answer comes from.
      package: '@acme/glyphs',
      data: {
        package: '@acme/glyphs',
        kind: 'icon-set',
        name: 'glyphs',
        license: expect.any(String),
        iconCount: glyphsData().icons.length,
        default: {variant: 'outline'},
        definitions: ['close', 'search'],
        command: 'astryx experimental icon <words> --set @acme/glyphs/glyphs',
        installed: true,
      },
    });
    expect(typeof page.data.summary).toBe('string');

    const text = await runCli(['discover', '@acme/glyphs/glyphs'], cwd);
    expect(text.code).toBe(0);
    expect(text.stdout).toMatch(/kind: +icon-set/);
    expect(text.stdout).toContain(
      'astryx experimental icon <words> --set @acme/glyphs/glyphs',
    );
  });

  it('finds the set by name in a search, and individual icons are not discover items', async () => {
    const found = await json(['discover', 'glyphs', '--type', 'icon-set']);
    expect(found.data.matches).toEqual([
      expect.objectContaining({
        package: '@acme/glyphs',
        component: 'glyphs',
        kind: 'icon-set',
      }),
    ]);
    const icon = await runCli(
      ['discover', 'trash', '--type', 'icon-set', '--json'],
      cwd,
    );
    expect(icon.code).not.toBe(0);
  });

  it('refuses an unknown --type and names icon-set among the kinds', async () => {
    const res = await runCli(['discover', '--type', 'icons', '--json'], cwd);
    expect(res.code).not.toBe(0);
    expect(res.stdout + res.stderr).toContain('icon-set');
  });
});

describe('discover and a withdrawn icon set', () => {
  it('lists no withdrawn set, and its item page says withdrawn and why', async () => {
    const dir = writeIconSetProject(path.join(tmp, 'withdrawn'), {
      packages: [{data: '{nope'}],
      config: {
        integrations: ['@acme/glyphs'],
        experimental: {iconSet: 'glyphs'},
      },
    });
    const all = await runCli(['discover', '--json'], dir);
    const [entry] = JSON.parse(all.stdout).data;
    expect(entry.name).toBe('@acme/glyphs');
    expect(entry.iconSets ?? []).toEqual([]);
    expect(all.stdout).not.toContain('withdrawnIconSets');
    const page = await runCli(
      ['discover', '@acme/glyphs/glyphs', '--json'],
      dir,
    );
    expect(page.code).toBe(1);
    const body = JSON.parse(page.stdout);
    expect(body.code).toBe('ERR_UNKNOWN_COMPONENT');
    expect(body.error).toMatch(
      /Icon set "glyphs" in @acme\/glyphs is installed but withdrawn: .*not valid JSON/,
    );
  });
});
