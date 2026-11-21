// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A part's two gradient layers said in a `how` ask stay one value: the
 * comma between them is no break. A comma before a color, after a plain
 * color, before a layer said with a part of its own, or in an ask without
 * the `background` word still starts a new ask, and the page keeps its own
 * reading.
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

it.each([
  [
    'header background linear-gradient(#0001 1px, transparent 1px), linear-gradient(90deg, #0001 1px, transparent 1px) 0 0 / 24px 24px',
    "set pv background 'linear-gradient(#0001 1px, transparent 1px), linear-gradient(90deg, #0001 1px, transparent 1px) 0 0 / 24px 24px' --on app-shell-header",
  ],
])(
  '%s: one value',
  async (ask, line) => {
    expect(await commands(ask)).toContain(line);
  },
  240_000,
);

it.each([
  [
    'page #f8fafc, linear-gradient(#ffffff, #eeeeee) on cards',
    "set pv background 'linear-gradient(#ffffff, #eeeeee)' --on card",
  ],
  [
    'header background linear-gradient(#ffffff, #f8fafc), linear-gradient(#ffffff, #eeeeee) on cards',
    "set pv background 'linear-gradient(#ffffff, #eeeeee)' --on card",
  ],
  [
    'header background linear-gradient(#ffffff, #f8fafc), linear-gradient(#ffffff, #eeeeee) in the sidebar',
    null,
  ],
  [
    'cards background #ffffff, header linear-gradient(#ffffff, #eeeeee), #f8fafc',
    null,
  ],
  ['cards linear-gradient(#ffffff, #eeeeee), #f8fafc', null],
  [
    'header background linear-gradient(#ffffff, #f8fafc), linear-gradient(#ffffff, #eeeeee) 0 0 / 1.5rem 1.5rem on cards',
    null,
  ],
  [
    'cards background linear-gradient(#0001 1px, transparent 1px), #f8fafc',
    null,
  ],
  ['page background linear-gradient(#ffffff, #f8fafc), #eeeeee', null],
])(
  '%s: the comma still starts a new ask',
  async (ask, line) => {
    const lines = await commands(ask);
    if (line) expect(lines).toContain(line);
    // (No value joins the two layers or the gradient and the color.)
    expect(lines.some(l => /\), (?:linear-gradient|#|white)/.test(l))).toBe(
      false,
    );
  },
  240_000,
);
