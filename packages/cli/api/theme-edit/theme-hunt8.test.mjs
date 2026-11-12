// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file N4: a theme an earlier editor built keeps its whole-theme radii
 * until corners or the base change, and a step back restores the radii the
 * step was built with, exactly. A history step an older CLI wrote (with no
 * radii) is still read.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditUndo} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

/** The whole-theme radii in the built CSS. */
const radii = () =>
  Object.fromEntries(
    [
      ...fs
        .readFileSync(path.join(cwd, 'themes/o/o.css'), 'utf8')
        .matchAll(/(--radius-(?:element|inner|container|page)):\s*(\d+px)/g),
    ].map(m => [m[1], m[2]]),
  );

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt8-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('o', {cwd, like: 'neutral', settings: {corners: 'round'}});
  // As an earlier editor built it: its own container and page radii.
  const ts = path.join(cwd, 'themes/o/o.settings.ts');
  fs.writeFileSync(
    ts,
    fs
      .readFileSync(ts, 'utf8')
      .replace(/("--radius-container": )"[^"]+"/, '$1"20px"')
      .replace(/("--radius-page": )"[^"]+"/, '$1"40px"'),
  );
  // Rebuilt from that module (an unrelated change keeps its radii).
  await themeEditSet('o', 'font', 'georgia', {cwd});
}, 120_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('radii of a theme an earlier editor built', () => {
  it('an unrelated change keeps them', () => {
    expect(radii()['--radius-container']).toBe('20px');
    expect(radii()['--radius-page']).toBe('40px');
  });

  it('a corners change and its undo give them back exactly', async () => {
    const before = radii();
    await themeEditSet('o', 'corners', 'pill', {cwd});
    expect(radii()['--radius-container']).not.toBe('20px');
    await themeEditUndo('o', {cwd});
    expect(radii()).toEqual(before);
  }, 240_000);

  it('a history step an older CLI wrote (no radii) is still undone', async () => {
    const hist = path.join(cwd, 'themes/o/o.history.json');
    await themeEditSet('o', 'corners', 'small', {cwd});
    const steps = JSON.parse(fs.readFileSync(hist, 'utf8'));
    steps[steps.length - 1] = JSON.stringify(
      {...JSON.parse(steps[steps.length - 1]), built: undefined},
      null,
      2,
    );
    fs.writeFileSync(hist, JSON.stringify(steps));
    await themeEditUndo('o', {cwd});
    const settings = JSON.parse(
      fs.readFileSync(path.join(cwd, 'themes/o/o.settings.json'), 'utf8'),
    );
    expect(settings.built).toBeUndefined();
    expect(
      settings.settings.find((/** @type {any} */ s) => s.thing === 'corners')
        ?.value,
    ).toBe('round');
  }, 240_000);
});
