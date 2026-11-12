// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hunt41: a Yarn Plug'n'Play workspace gets its own refusal from a
 * member app; a repository inside a home-folder app names the app; a
 * suggested `new my-<name>` is free and valid; a base typed as its package
 * name or in other letters stays that base, with its install line.
 *
 * @position api/theme-edit — tests
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt41-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} prefix */
const tmp = prefix =>
  fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
/** @param {string} file @param {unknown} json */
const put = (file, json) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(
    file,
    typeof json === 'string' ? json : JSON.stringify(json),
  );
};

describe('hunt41 N1: a Plug-n-Play workspace', () => {
  it('refuses from the member app and its subfolder with the Plug-n-Play fix', async () => {
    const root = tmp('astryx-h41-pnp-');
    try {
      put(path.join(root, 'package.json'), {name: 'r', workspaces: ['apps/*']});
      put(path.join(root, '.pnp.cjs'), '');
      put(path.join(root, 'yarn.lock'), '');
      put(path.join(root, 'apps/web/package.json'), {
        name: 'web',
        dependencies: {'@astryxdesign/core': '*'},
      });
      fs.mkdirSync(path.join(root, 'apps/web/src'));
      for (const from of ['apps/web', 'apps/web/src']) {
        const err = await refusal(() =>
          themeEditShow('t', {cwd: path.join(root, from)}),
        );
        expect(err.message, from).toContain("Plug'n'Play");
        expect(err.run[0], from).toBe(
          'yarn config set nodeLinker node-modules',
        );
      }
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });
});

describe('hunt41 N2: a repository inside a home-folder app', () => {
  it('names the app and its cd, never an install into the repository', async () => {
    const home = tmp('astryx-h41-home-');
    const saved = process.env.HOME;
    try {
      put(path.join(home, 'package.json'), {
        dependencies: {'@astryxdesign/core': '*'},
      });
      fs.mkdirSync(path.join(home, 'vendor/lib'), {recursive: true});
      put(
        path.join(home, 'vendor/lib/.git'),
        'gitdir: ../../.git/modules/lib\n',
      );
      process.env.HOME = home;
      const err = await refusal(() =>
        themeEditShow('t', {cwd: path.join(home, 'vendor/lib')}),
      );
      expect(err.code).toBe('ERR_PROJECT_REQUIRED');
      expect(err.message).toContain('its own repository');
      expect(err.run).toEqual(['cd ../..']);
      expect(fs.existsSync(path.join(home, 'vendor/lib/themes'))).toBe(false);
    } finally {
      process.env.HOME = saved;
      fs.rmSync(home, {recursive: true, force: true});
    }
  });
});

describe('hunt41 N3: a suggested new name is free and valid', () => {
  it('names the user theme on the base, and a free name', async () => {
    await themeEditNew('my-neutral', {cwd, like: 'neutral'});
    const err = await refusal(() =>
      themeEditSet('neutral', 'corners', 'square', {cwd}),
    );
    expect(err.run.join('\n')).toMatch(/ show my-neutral$/m);
    expect(err.run.join('\n')).toMatch(/ new my-neutral-2 --like neutral$/m);
    const long = 'a'.repeat(62);
    fs.mkdirSync(path.join(cwd, 'themes', long), {recursive: true});
    fs.writeFileSync(path.join(cwd, 'themes', long, `${long}.css`), '');
    const hand = await refusal(() =>
      themeEditSet(long, 'corners', 'square', {cwd}),
    );
    const name = /\bnew (\S+)/.exec(hand.run.join('\n'))?.[1] ?? '';
    expect(name.length).toBeLessThanOrEqual(64);
    expect(name).toMatch(/^my-a+-2$/);
  }, 120_000);
});

describe('hunt41 N4: a base typed as its package name', () => {
  it('stays that base, with its install line when it is not installed', async () => {
    for (const like of [
      '@astryxdesign/theme-butter',
      'theme-butter',
      'BUTTER',
    ]) {
      const err = await refusal(() => themeEditNew('b', {cwd, like}));
      expect(err.run.join('\n'), like).toMatch(/ new b --like butter$/m);
      expect(err.run[0], like).toMatch(
        /(npm install|(pnpm|yarn|bun) add) @astryxdesign\/theme-butter$/,
      );
    }
    for (const v of ['theme-butter', 'Butter', '@astryxdesign/theme-butter']) {
      const err = await refusal(() => themeEditSet('t', 'base', v, {cwd}));
      expect(err.run.join('\n'), v).toMatch(/ set t base butter$/m);
      expect(err.run[0], v).toMatch(/@astryxdesign\/theme-butter$/);
    }
  }, 120_000);
});
