// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A fill said with no mode on a part's look carries, in its own
 * answer, the text color that reads on it in each mode the part's text
 * would not: following the answer never leaves the text unreadable.
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
  cwd = makeLinkedFixture('astryx-theme-how-fill-text-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('ft', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

it('a teal secondary button fill carries a dark label in dark mode, light mode as it was', async () => {
  const {data} = /** @type {any} */ (
    await themeEditHow('secondary buttons #03dac6', {cwd, theme: 'ft'})
  );
  const fill = /** @type {Array<{text: string, commands: string[]}>} */ (
    data.results
  ).find(r => r.commands.some(c => /background-color '#03dac6'/.test(c)));
  expect(fill?.commands.map(c => c.replace(/^.*? editor /, ''))).toEqual([
    "set ft background-color '#03dac6' --on button --when variant:secondary",
    "set ft color '#000000' --on button --when variant:secondary --mode dark",
  ]);
  expect(
    data.results.some((/** @type {{text: string}} */ r) =>
      /^readable text on that fill/.test(r.text),
    ),
  ).toBe(false);
  // Following the answer: the built theme measures the label at 4.5:1
  // or more in each mode.
  /** @type {any} */
  let last = null;
  for (const line of fill?.commands ?? []) {
    const [, thing, value, ...rest] = /** @type {RegExpMatchArray} */ (
      line.match(/ set ft (\S+) '([^']+)'(.*)$/)
    );
    const flags = Object.fromEntries(
      [...rest.join('').matchAll(/--(\w+) (\S+)/g)].map(m => [m[1], m[2]]),
    );
    last = await themeEditSet('ft', thing, value, {cwd, ...flags});
  }
  expect(JSON.stringify(last?.data?.problems ?? [])).not.toMatch(
    /button \(variant secondary\)[^:]{0,40}is [\d.]+:1 in/,
  );
  // (A later fill on that look measures the label the theme now draws in
  // each mode: the dark label written above, black, on navy.)
  const navy = /** @type {any} */ (
    await themeEditHow('secondary buttons #1e3a8a', {cwd, theme: 'ft'})
  );
  const lines = /** @type {string[]} */ (navy.data.results[0].commands).map(c =>
    c.replace(/^.*? editor /, ''),
  );
  expect(lines).toContain(
    "set ft color '#ffffff' --on button --when variant:secondary --mode dark",
  );
}, 600_000);

it.each([
  ['secondary buttons #03dac6', 'secondary'],
  ['secondary buttons #9e9e9e', 'secondary'],
  ['destructive buttons #991b1b', 'destructive'],
])(
  '%s: following the first answer alone leaves the label readable in both modes',
  async (ask, variant) => {
    const slug = `f${ask.replace(/[^0-9a-f]/g, '').slice(-6)}`;
    await themeEditNew(slug, {cwd, like: 'neutral'});
    const {data} = /** @type {any} */ (
      await themeEditHow(ask, {cwd, theme: slug})
    );
    const lines = /** @type {string[]} */ (data.results[0].commands).flatMap(
      c => c.split(' && '),
    );
    expect(lines.length).toBeGreaterThan(1);
    /** @type {any} */
    let last = null;
    for (const line of lines) {
      const [, thing, value, rest] = /** @type {RegExpMatchArray} */ (
        line.match(new RegExp(` set ${slug} (\\S+) '([^']+)'(.*)$`))
      );
      const flags = Object.fromEntries(
        [...rest.matchAll(/--(\w+) (\S+)/g)].map(m => [m[1], m[2]]),
      );
      last = await themeEditSet(slug, thing, value, {cwd, ...flags});
    }
    // (The built theme measures that look's text at 4.5:1 or more in each
    // mode: the last write names no text under it.)
    const problems = JSON.stringify(last?.data?.problems ?? []);
    expect(problems).not.toMatch(
      new RegExp(`button \\(variant ${variant}\\)[^:]{0,40}is [\\d.]+:1 in`),
    );
  },
  600_000,
);

it('a text color set for the whole part is the label a later fill measures', async () => {
  await themeEditNew('fw', {cwd, like: 'neutral'});
  await themeEditSet('fw', 'color', '#000000', {cwd, on: 'button'});
  const {data} = /** @type {any} */ (
    await themeEditHow('secondary buttons #1e3a8a', {cwd, theme: 'fw'})
  );
  const lines = /** @type {string[]} */ (data.results[0].commands).map(c =>
    c.replace(/^.*? editor /, ''),
  );
  // (Black on navy is under 4.5:1 in each mode: both get white.)
  expect(lines).toEqual([
    "set fw background-color '#1e3a8a' --on button --when variant:secondary",
    "set fw color '#ffffff' --on button --when variant:secondary --mode light",
    "set fw color '#ffffff' --on button --when variant:secondary --mode dark",
  ]);
}, 600_000);
