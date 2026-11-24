// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file show's `missed`: a state is named only when the part draws it as a
 * look of its own (a selected nav item's fill), by the part data, never a
 * readonly field on its surface or a checked switch's thumb; a setting
 * takes a part off a list only when it covers the aspect the list is about;
 * an inverted surface that still stands out from the page is drawn so on
 * purpose; and every line offered, followed, leaves the part readable.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {context} from './_context.mjs';
import {resolvedTokens} from './_settings.mjs';
import {alphaOf, compositeOver, parseColor, ratio} from './_color.mjs';
import {splitCommand} from './_vet.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

// The assertions are about settings, builds, notes and lines, not rendered
// pages: a render costs seconds, so the pages are written by the stand-in.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const T = 240_000;
/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-state-named-part-draws-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
  await themeEditSet('t', 'accent', '#0b6e4f', {cwd});
}, T);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug */
const missed = async slug =>
  /** @type {Array<{part: string, state?: string, why: string, line: string}>} */ (
    /** @type {any} */ (await themeEditShow(slug, {cwd})).data.missed
  );
/** @param {Array<{part: string, state?: string}>} list */
const named = list => list.map(m => `${m.part}${m.state ? `:${m.state}` : ''}`);

/** Follow a line as printed: each `&&` step, run. @param {string} line */
async function follow(line) {
  for (const step of line.split(' && ')) {
    const args = splitCommand(step.slice(step.indexOf('experimental ')));
    if (!args) throw new Error(`cannot read ${step}`);
    const r = await runCli(args, {cwd});
    expect(r.status, `${step}\n${r.stderr}`).toBe(0);
  }
}

/** The contrast of two tokens of the theme in each mode, the fill drawn over the page. @param {string} slug @param {string} text @param {string} fill */
async function contrastOf(slug, text, fill) {
  const ctx = await context(cwd);
  const res = await resolvedTokens(ctx, slug);
  return /** @type {const} */ (['light', 'dark']).map(m => {
    const page = /** @type {number[]} */ (
      parseColor(res[m]['--color-background-surface'])
    );
    const f = res[m][fill];
    const under = parseColor(f)
      ? compositeOver(
          /** @type {any} */ (parseColor(f)),
          alphaOf(f),
          /** @type {any} */ (page),
        )
      : page;
    return ratio(/** @type {any} */ (parseColor(res[m][text])), under);
  });
}

describe('missed states', () => {
  it(
    'names a selected look on the base fill, never a readonly field or a checked thumb',
    async () => {
      const list = named(await missed('t'));
      expect(list).toContain('side-nav-item:selected');
      for (const part of [
        'text-input',
        'text-area',
        'number-input',
        'selector',
        'multi-selector',
      ])
        expect(list).not.toContain(`${part}:readonly`);
      expect(list).not.toContain('switch-thumb:checked');
    },
    T,
  );

  it(
    'an inverted surface that still stands out from the page is not missed',
    async () => {
      expect(named(await missed('t'))).not.toContain('toast');
    },
    T,
  );
});

describe('every line, followed, leaves the part readable', () => {
  it(
    'the disabled button: only the accent variant, its label recolored with its fill',
    async () => {
      const m = (await missed('t')).find(
        x => x.part === 'button' && x.state === 'disabled',
      );
      expect(m?.line).toMatch(
        /--when variant:primary --state disabled && .* color /,
      );
      await follow(/** @type {string} */ (m?.line));
      for (const r of await contrastOf(
        't',
        '--color-text-primary',
        '--color-neutral',
      ))
        expect(r).toBeGreaterThanOrEqual(4.5);
      expect(named(await missed('t'))).not.toContain('button:disabled');
    },
    T,
  );

  it(
    'the selected nav item',
    async () => {
      const m = (await missed('t')).find(
        x => x.part === 'side-nav-item' && x.state === 'selected',
      );
      await follow(/** @type {string} */ (m?.line));
      for (const r of await contrastOf(
        't',
        '--color-text-primary',
        '--color-accent-muted',
      ))
        expect(r).toBeGreaterThanOrEqual(4.5);
      expect(named(await missed('t'))).not.toContain('side-nav-item:selected');
    },
    T,
  );

  it(
    'the info banner: its color grows from the look and reads, at any vibrancy',
    async () => {
      // Info is a status role the theme leaves unset, so the look grows it
      // with the accent: the banner follows at every vibrancy.
      for (const vibrancy of [null, '80']) {
        if (vibrancy) await themeEditSet('t', 'vibrancy', vibrancy, {cwd});
        expect(named(await missed('t'))).not.toContain('banner');
        for (const r of await contrastOf(
          't',
          '--color-on-info-muted',
          '--color-info-muted',
        ))
          expect(r).toBeGreaterThanOrEqual(4.5);
      }
    },
    T,
  );
});

describe('a setting takes a part off only for the aspect the list is about', () => {
  it(
    'a hover fill or a corner radius leaves it listed; a resting fill takes it off',
    async () => {
      await themeEditNew('u', {cwd, like: 'neutral'});
      await themeEditSet('u', 'accent', '#0b6e4f', {cwd});
      await themeEditSet('u', 'vibrancy', '80', {cwd});
      await themeEditSet('u', 'background-color', '#ff0000', {
        cwd,
        on: 'side-nav-item',
        state: 'hover',
      });
      await themeEditSet('u', 'border-radius', '4px', {cwd, on: 'toast'});
      const shown = /** @type {any} */ (await themeEditShow('u', {cwd})).data;
      expect(shown.unreached).toContain('side-nav-item');
      expect(shown.unreached).toContain('toast');
      await themeEditSet('u', 'background-color', '#eeeeee', {
        cwd,
        on: 'side-nav-item',
      });
      const after = /** @type {any} */ (await themeEditShow('u', {cwd})).data;
      expect(after.unreached).not.toContain('side-nav-item');
    },
    T,
  );
});
