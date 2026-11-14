// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Corners in a state: written as the CSS property alone (Core writes a
 * part's derived variables from plain declarations only, and refuses them
 * as theme input), with a note; the theme then compiles clean.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditUndo} from './theme-edit.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt14-', FIXTURE_PACKAGES);
  await themeEditNew('s', {cwd});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

const read = (/** @type {string} */ f) =>
  fs.readFileSync(path.join(cwd, 'themes/s', f), 'utf8');

describe('corners in a state', () => {
  it('a button on hover gets the radius, a note, and compiles clean', async () => {
    const r = await themeEditSet('s', 'corners', 'pill', {
      cwd,
      on: 'button',
      state: 'hover',
    });
    expect(r.data.notes.join(' ')).toMatch(
      /--_button-radius .* keeps the plain value/,
    );
    expect(read('s.css')).toMatch(
      /\.astryx-button:hover[^{]*\{[^}]*border-radius: 9999px;/,
    );
    expect(read('s.settings.ts')).not.toMatch(/--_/);
    const bin = path.resolve(
      import.meta.dirname,
      '../../clients/cli/bin/astryx.mjs',
    );
    const compiled = spawnSync(
      process.execPath,
      [
        bin,
        'experimental',
        'theme',
        'compile',
        'themes/s/s.theme.ts',
        '--json',
      ],
      {cwd, encoding: 'utf8'},
    );
    expect(compiled.status, compiled.stdout + compiled.stderr).toBe(0);
  }, 240_000);
});

describe('final 8', () => {
  it('F8-3: focus-within on a part that holds content is taken', async () => {
    const r = await themeEditSet('s', 'background-color', '#ff0000', {
      cwd,
      on: 'dialog',
      state: 'focus-within',
    });
    expect(r.data.setting.state).toBe('focus-within');
  }, 240_000);

  it('F8-5 (now parts36): padding in a state on an inputs member is taken for the group', async () => {
    // A state padding reaches a member Core expands (number-input) through
    // the padding model, so the group setting needs no --only any more.
    const r = await themeEditSet('s', 'padding', '4px', {
      cwd,
      on: 'date-input',
      state: 'hover',
    });
    expect(r.data.setting.state).toBe('hover');
    await themeEditUndo('s', {
      cwd,
      thing: 'padding',
      on: 'date-input',
      state: 'hover',
    });
  });

  it('F8-1: a radius for one mode is refused as not a color, with a run that works', async () => {
    const r = await refusal(() =>
      themeEditSet('s', 'border-radius', '8px', {
        cwd,
        on: 'card',
        mode: 'dark',
      }),
    );
    expect(r.message).toMatch(/border-radius is not a color/);
    expect(r.run).toEqual([
      expect.stringMatching(/ border-radius 8px --on card$/),
    ]);
  });
});

describe('final 8, show and names', () => {
  it('F8-N2: a theme source that does not build leaves every file in place', async () => {
    await themeEditNew('g', {cwd});
    const dir = path.join(cwd, 'themes/g');
    const before = fs.readdirSync(dir).sort();
    fs.appendFileSync(path.join(dir, 'g.theme.ts'), 'export const oops = {\n');
    const {themeEditShow} = await import('./theme-edit.mjs');
    const r = await refusal(() => themeEditShow('g', {cwd}));
    expect(r.code).toBe('ERR_THEME_INVALID');
    expect(fs.readdirSync(dir).sort()).toEqual(before);
  }, 240_000);
});
