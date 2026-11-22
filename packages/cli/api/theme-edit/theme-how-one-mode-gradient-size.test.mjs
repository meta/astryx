// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file One gradient layer said for one mode with its position and size
 * stays the `background` shorthand, in that mode: `background-image` takes
 * no size.
 */

import {afterAll, beforeAll, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture(
    'astryx-theme-how-one-mode-gradient-',
    FIXTURE_PACKAGES,
  );
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('pg', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} ask */
const commands = async ask => {
  const {data} = /** @type {any} */ (
    await themeEditHow(ask, {cwd, theme: 'pg'})
  );
  return /** @type {Array<{commands: string[]}>} */ (data.results ?? [])
    .flatMap(r => r.commands)
    .map(c => c.replace(/^.*? editor /, ''));
};

it('a gradient with its size said for one mode is written whole, in that mode', async () => {
  expect(
    await commands(
      'dark mode header background linear-gradient(#0001 1px, transparent 1px) 0 0 / 24px 24px',
    ),
  ).toContain(
    "set pg background 'linear-gradient(#0001 1px, transparent 1px) 0 0 / 24px 24px' --on app-shell-header --mode dark",
  );
}, 240_000);

it('a plain gradient said for one mode still moves to background-image', async () => {
  expect(
    (
      await commands(
        'dark mode header background linear-gradient(#111111, #222222)',
      )
    ).some(l =>
      /background-image 'linear-gradient\(#111111, #222222\)' --on app-shell-header --mode dark/.test(
        l,
      ),
    ),
  ).toBe(true);
}, 240_000);

it('a gradient cut before its size is never written cut', async () => {
  expect(
    (
      await commands(
        'dark mode header background linear-gradient(red, blue) center / auto 50%',
      )
    ).some(l => /'linear-gradient\(red, blue\) center'/.test(l)),
  ).toBe(false);
}, 240_000);

it('two sized layers said for one mode are never written in part', async () => {
  expect(
    (
      await commands(
        'dark mode header background linear-gradient(#0001 1px, transparent 1px) 0 0 / 24px 24px, linear-gradient(90deg, #0001 1px, transparent 1px) 0 0 / 24px 24px',
      )
    ).some(l =>
      /set pg background 'linear-gradient\(#0001 1px, transparent 1px\) 0 0 \/ 24px 24px' /.test(
        l,
      ),
    ),
  ).toBe(false);
}, 240_000);

it('a one-mode layer with a max() inside a stop is written whole too', async () => {
  expect(
    await commands(
      'dark mode header background linear-gradient(rgb(0 0 max(10, 15)) 1px, transparent 1px) 0 0 / 24px 24px',
    ),
  ).toContain(
    "set pg background 'linear-gradient(rgb(0 0 max(10, 15)) 1px, transparent 1px) 0 0 / 24px 24px' --on app-shell-header --mode dark",
  );
}, 240_000);

it('a saved sized gradient made darker for one mode is answered for that mode', async () => {
  await themeEditNew('pd', {cwd, like: 'neutral'});
  await themeEditSet(
    'pd',
    'background',
    'linear-gradient(#3b82f6 1px, transparent 1px) 0 0 / 24px 24px',
    {cwd, on: 'app-shell-header'},
  );
  const {data} = /** @type {any} */ (
    await themeEditHow('make the header gradient darker in dark mode', {
      cwd,
      theme: 'pd',
    })
  );
  const texts = /** @type {Array<{text: string}>} */ (data.results ?? []).map(
    r => r.text,
  );
  expect(texts.some(t => /cannot be dark mode only/.test(t))).toBe(false);
  const commands = /** @type {Array<{commands: string[]}>} */ (
    data.results ?? []
  )
    .flatMap(r => r.commands)
    .map(c => c.replace(/^.*? editor /, ''));
  expect(
    commands.some(c =>
      /^set pd background 'linear-gradient\(#[0-9a-f]{6} 1px, transparent 1px\) 0 0 \/ 24px 24px' --on app-shell-header --mode dark$/.test(
        c,
      ),
    ),
  ).toBe(true);
}, 240_000);

it('a sized gradient with its mode said at the end is written whole, in that mode', async () => {
  expect(
    await commands(
      'header background linear-gradient(#0001 1px, transparent 1px) 0 0 / 24px 24px in dark mode',
    ),
  ).toContain(
    "set pg background 'linear-gradient(#0001 1px, transparent 1px) 0 0 / 24px 24px' --on app-shell-header --mode dark",
  );
}, 240_000);

it('a slash between two asks after a sized gradient still splits them', async () => {
  const lines = await commands(
    'header background linear-gradient(#0001 1px, transparent 1px) 0 0 / 24px 24px in dark mode / buttons blue',
  );
  expect(lines).toContain(
    "set pg background 'linear-gradient(#0001 1px, transparent 1px) 0 0 / 24px 24px' --on app-shell-header --mode dark",
  );
  expect(lines).toContain("set pg background-color '#2563eb' --on button");
  expect(lines.some(l => /linear-gradient.*--on button/.test(l))).toBe(false);
}, 240_000);

it('a size right after a gradient with no position is a new ask', async () => {
  const lines = await commands(
    'header background linear-gradient(#ffffff, #eeeeee) / 12px radius on cards',
  );
  expect(lines.some(l => /\/ 12px/.test(l))).toBe(false);
}, 240_000);

it('a trailing mode after a gradient with a nested stop reads as that mode', async () => {
  expect(
    await commands(
      'header background linear-gradient(rgb(0 0 max(10, 15)) 1px, transparent 1px) 0 0 / 24px 24px in dark mode',
    ),
  ).toContain(
    "set pg background 'linear-gradient(rgb(0 0 max(10, 15)) 1px, transparent 1px) 0 0 / 24px 24px' --on app-shell-header --mode dark",
  );
}, 240_000);

it.each([
  'dark mode header background linear-gradient(transparent calc(100% - 1px), #dddddd 1px) 0 0 / 24px 24px',
  'header background linear-gradient(transparent calc(100% - 1px), #dddddd 1px) 0 0 / 24px 24px in dark mode',
])(
  '%s: a stop with calc() is written as typed',
  async ask => {
    expect(await commands(ask)).toContain(
      "set pg background 'linear-gradient(transparent calc(100% - 1px), #dddddd 1px) 0 0 / 24px 24px' --on app-shell-header --mode dark",
    );
  },
  240_000,
);

it('two sized layers with the mode said at the end answer as main does', async () => {
  const {data} = /** @type {any} */ (
    await themeEditHow(
      'header background linear-gradient(#0001 1px, transparent 1px) 0 0 / 24px 24px, linear-gradient(90deg, #0001 1px, transparent 1px) 0 0 / 24px 24px in dark mode',
      {cwd, theme: 'pg'},
    )
  );
  const texts = /** @type {Array<{text: string}>} */ (data.results ?? []).map(
    r => r.text,
  );
  // (Nothing is dropped silently: the second layer and the mode are named
  // as not used.)
  expect(
    texts.some(
      t => /^not used/.test(t) && t.includes('24px 24px in dark mode'),
    ),
  ).toBe(true);
}, 240_000);

it('a size in any CSS length unit after the slash reads as that mode too', async () => {
  expect(
    await commands(
      'header background linear-gradient(#0001 1px, transparent 1px) 0 0 / 10vmin 10vmin in dark mode',
    ),
  ).toContain(
    "set pg background 'linear-gradient(#0001 1px, transparent 1px) 0 0 / 10vmin 10vmin' --on app-shell-header --mode dark",
  );
  // (Points are written as the pixels they are.)
  expect(
    (
      await commands(
        'header background linear-gradient(#0001 1px, transparent 1px) 0 0 / 24pt 24pt in dark mode',
      )
    ).join('\n'),
  ).toMatch(/ 0 0 \/ 32px 32px' --on app-shell-header --mode dark$/m);
}, 240_000);
