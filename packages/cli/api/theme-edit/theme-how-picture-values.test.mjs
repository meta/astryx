// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A background's gradient layers said in a `how` ask stay one value:
 * a comma between them, or before the final color, is no break, and a
 * layer that names a part of its own is an ask of its own.
 */

import {afterAll, beforeAll, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-how-picture-values-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('pv', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} ask */
const commands = async ask => {
  const {data} = /** @type {any} */ (
    await themeEditHow(ask, {cwd, theme: 'pv'})
  );
  return /** @type {Array<{commands: string[]}>} */ (data.results ?? [])
    .flatMap(r => r.commands)
    .map(c => c.replace(/^.*? editor /, ''));
};

it('keeps every gradient layer of a background in one ask', async () => {
  expect(
    await commands(
      'header background linear-gradient(#0001 1px, transparent 1px), linear-gradient(90deg, #0001 1px, transparent 1px) 0 0 / 24px 24px',
    ),
  ).toContain(
    "set pv background 'linear-gradient(#0001 1px, transparent 1px), linear-gradient(90deg, #0001 1px, transparent 1px) 0 0 / 24px 24px' --on app-shell-header",
  );
}, 240_000);

it('a comma after a plain color still starts a new ask', async () => {
  const lines = await commands(
    'page #f8fafc, linear-gradient(#ffffff, #eeeeee) on cards',
  );
  expect(lines).toContain(
    "set pv --color-background-body '#f8fafc' --mode light",
  );
  expect(lines).toContain(
    "set pv background 'linear-gradient(#ffffff, #eeeeee)' --on card",
  );
}, 240_000);

it('a layer that names its own part is an ask of its own', async () => {
  const lines = await commands(
    'header background linear-gradient(#ffffff, #f8fafc), linear-gradient(#ffffff, #eeeeee) on cards',
  );
  expect(lines).toContain(
    "set pv background 'linear-gradient(#ffffff, #eeeeee)' --on card",
  );
  expect(
    lines.some(l =>
      /linear-gradient\(#ffffff, #f8fafc\), linear-gradient/.test(l),
    ),
  ).toBe(false);
}, 240_000);

it('a gradient without the background word keeps its color an ask of its own', async () => {
  expect(
    (await commands('cards linear-gradient(#ffffff, #eeeeee), #f8fafc')).some(
      l => /linear-gradient\(#ffffff, #eeeeee, #f8fafc\)/.test(l),
    ),
  ).toBe(false);
}, 240_000);

it('a gradient said for one mode is never cut at its size', async () => {
  expect(
    (
      await commands(
        'header background linear-gradient(#0001 1px, transparent 1px) 0 0 / 24px 24px in dark mode',
      )
    ).some(line =>
      /'linear-gradient\(#0001 1px, transparent 1px\) 0 0'/.test(line),
    ),
  ).toBe(false);
}, 240_000);

it('a slash between asks after a gradient still splits them', async () => {
  const lines = await commands(
    'header background linear-gradient(#ffffff, #eeeeee) / cards red',
  );
  expect(lines.some(l => /--on card\b/.test(l))).toBe(true);
}, 240_000);

it('a gradient said for one mode is written whole, in that mode', async () => {
  expect(
    await commands(
      'header background linear-gradient(#0001 1px, transparent 1px) 0 0 / 24px 24px in dark mode',
    ),
  ).toContain(
    "set pv background 'linear-gradient(#0001 1px, transparent 1px) 0 0 / 24px 24px' --on app-shell-header --mode dark",
  );
}, 240_000);
