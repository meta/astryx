// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The thirteenth pass over `astryx experimental theme editor`: steps
 * in history checked against this Core, settings naming no token or
 * property, an own change to the theme source, colors that say what the
 * build shows, a setting a later spread covers, CSS numbers, and states
 * Core does not expand.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
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

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt13-', FIXTURE_PACKAGES);
});

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug @param {string} file */
const at = (slug, file) => path.join(cwd, 'themes', slug, file);

describe('hunt13', () => {
  it('J6: undo leaves out what this Core refuses in the step', async () => {
    await themeEditNew('j6', {cwd});
    await themeEditSet('j6', 'corners', 'pill', {cwd});
    await themeEditSet('j6', 'spacing', 'roomy', {cwd});
    const hist = JSON.parse(
      fs.readFileSync(at('j6', 'j6.history.json'), 'utf8'),
    );
    // Each step is the settings file's text as it was.
    const step = JSON.parse(hist[hist.length - 1]);
    step.settings.push({
      thing: '--radius-element',
      value: 'banana',
      source: 'token',
    });
    hist[hist.length - 1] = JSON.stringify(step);
    fs.writeFileSync(at('j6', 'j6.history.json'), JSON.stringify(hist));
    const r = await themeEditUndo('j6', {cwd});
    expect(JSON.stringify(r.data)).toMatch(
      /left out --radius-element = banana/,
    );
    expect(fs.readFileSync(at('j6', 'j6.css'), 'utf8')).not.toMatch(/banana/);
    await themeEditShow('j6', {cwd});
  }, 240_000);

  it('J5: a token setting that names no token is a problem', async () => {
    await themeEditNew('j5', {cwd});
    const file = at('j5', 'j5.settings.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    data.settings.push({thing: '--not-a-token', value: '5px', source: 'token'});
    fs.writeFileSync(file, JSON.stringify(data));
    const r = await refusal(() => themeEditShow('j5', {cwd}));
    expect(r.message).toMatch(/--not-a-token is not a design token/);
  }, 240_000);

  it('F7-N3: show builds an own change to the theme source', async () => {
    await themeEditNew('g', {cwd});
    const ts = at('g', 'g.theme.ts');
    fs.writeFileSync(
      ts,
      fs
        .readFileSync(ts, 'utf8')
        .replace(
          "name: 'g',",
          "name: 'g',\n  tokens: {'--color-accent': '#0000ff'},",
        ),
    );
    await themeEditShow('g', {cwd});
    expect(fs.readFileSync(at('g', 'g.css'), 'utf8')).toMatch(/#0000ff/i);
    fs.appendFileSync(ts, 'export const oops = {\n');
    const r = await refusal(() => themeEditShow('g', {cwd}));
    // A source that no longer parses is refused before anything is built.
    expect(r.message).toMatch(/does not parse|did not build/);
  }, 240_000);

  it('F7-3: a later spread that covers an --only setting is named', async () => {
    await themeEditNew('m', {cwd});
    await themeEditSet('m', 'corners', 'large', {
      cwd,
      on: 'text-area',
      only: true,
    });
    const r = await themeEditSet('m', 'corners', 'square', {
      cwd,
      on: 'text-input',
    });
    expect(r.data.notes.join(' ')).toMatch(/text-area only no longer shows/);
  }, 240_000);

  it('F7-2: a CSS number in px is a size', async () => {
    const r = await themeEditSet('m', 'corners', '2e1px', {cwd});
    expect(r.data.setting.value).toBe('20px');
  }, 240_000);

  it('F7-4: padding with a state on a part Core expands into container tokens is refused', async () => {
    const r = await refusal(() =>
      themeEditSet('m', 'padding', '40px', {
        cwd,
        on: 'card',
        state: 'hover',
      }),
    );
    expect(r.code).toBe('ERR_THEME_NO_EFFECT');
    expect(r.run[0]).toMatch(/padding 40px --on card$/);
  });
});

describe('R9-C: disabled on a wrapper part', () => {
  it('matches the marked input inside', async () => {
    await themeEditSet('m', 'opacity', '0.3', {
      cwd,
      on: 'typeahead',
      state: 'disabled',
    });
    expect(fs.readFileSync(at('m', 'm.css'), 'utf8')).toMatch(
      /\.astryx-typeahead:is\([^{]*:has\(:is\(input,button,select,textarea\):is\(:disabled,\[aria-disabled="true"\]\)\)\)/,
    );
  }, 240_000);
});
