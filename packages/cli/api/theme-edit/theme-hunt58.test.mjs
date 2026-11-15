// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hunt58: the package commands name the same steps for an editor
 * theme as `wiring` does; a color config the editor recorded writing, left
 * by a color change stopped before its settings were saved, is removed by
 * the next build, while a hand-made one stays.
 *
 * @position api/theme-edit — tests
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {editorThemeRefusal} from './_adapter.mjs';
import {AstryxError} from '../error.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
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

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt58-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

describe('hunt58 (a): one set of steps', () => {
  it('a theme with no app copy is named with the wiring steps', async () => {
    const made = await themeEditNew('y', {cwd, like: 'neutral'});
    const wiring = /** @type {any} */ (made.data).wiring;
    fs.rmSync(path.join(cwd, 'src/themes/y'), {recursive: true, force: true});
    const err = editorThemeRefusal(
      new AstryxError('Unknown theme "y".', [], 'ERR_UNKNOWN_THEME'),
      cwd,
    );
    expect(err?.message).toContain('has no app copy yet');
    for (const step of wiring) expect(err?.message).toContain(step);
    expect(err?.suggestions?.map(s => s.name).join('\n')).toMatch(
      /editor show y\n.* theme add y$/,
    );
  }, 120_000);
});

describe('hunt58 (a): a copy folder of only system files', () => {
  it('add and use give the no-copy steps, as with no folder', async () => {
    await themeEditNew('jo', {cwd, like: 'neutral'});
    const dir = path.join(cwd, 'src/themes/jo');
    fs.rmSync(dir, {recursive: true, force: true});
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, '.DS_Store'), '');
    for (const verb of ['add', 'use']) {
      const r = await runCli(['--json', 'experimental', 'theme', verb, 'jo'], {
        cwd,
      });
      expect(r.status).toBe(1);
      const out = JSON.parse(r.stdout);
      expect(out.error).toContain('has no app copy yet');
      expect(out.error).not.toMatch(/Unknown theme|no such theme/i);
    }
  }, 240_000);
});

describe('hunt58 (b): a stopped color change', () => {
  it('its recorded color files go at the next build; a hand-made config stays', async () => {
    await themeEditNew('d', {cwd, like: 'neutral'});
    // A color change that wrote its files, then stopped before saving the
    // settings: the settings set no color.
    const settings = path.join(cwd, 'themes/d/d.settings.json');
    const kept = fs.readFileSync(settings);
    await themeEditSet('d', 'accent', '#7c3aed', {cwd});
    fs.writeFileSync(settings, kept);
    expect(fs.existsSync(path.join(cwd, 'themes/d/palette.config.json'))).toBe(
      true,
    );
    const r = await themeEditShow('d', {cwd});
    expect(r.data.colorFiles).toBeNull();
    expect(fs.existsSync(path.join(cwd, 'themes/d/palette.config.json'))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(cwd, 'themes/d/tokens'))).toBe(false);
    // A config of the user's, never recorded: kept.
    fs.writeFileSync(
      path.join(cwd, 'themes/d/palette.config.json'),
      '{"modeStrategy":"light-and-dark","families":[]}\n',
    );
    await themeEditShow('d', {cwd});
    expect(fs.existsSync(path.join(cwd, 'themes/d/palette.config.json'))).toBe(
      true,
    );
  }, 240_000);
});
