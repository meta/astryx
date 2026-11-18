// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A divider's line is an inner element with no theming target: the part
 * data records what it paints as the divider's own (its color per variant
 * and its thickness), and how answers a divider fainter, thinner or darker
 * through the readers every part uses. Against real bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
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

/** Why a bundled theme could not be built here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-parts67-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {import('vitest').TestContext} ctx */
const needBases = ctx => {
  if (!unbuilt) return false;
  console.warn(`skipped: ${unbuilt}`);
  ctx.skip();
  return true;
};

/** @param {string} slug */
const cssOf = slug =>
  fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8');

/** The first answer's commands, bare. @param {string} q @param {string} theme */
const top = async (q, theme) => {
  const {data} = await themeEditHow(q, {cwd, theme});
  const r = (data.results ?? []).find(x =>
    x.commands.some(c => / editor (set|undo) /.test(c)),
  );
  return {
    text: (data.results ?? []).map(x => x.text).join('\n'),
    commands: (r?.commands ?? []).map(c => c.replace(/^.*? editor /, '')),
  };
};

describe("a divider's line", () => {
  it("is recorded as the divider's own paint, per variant", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('d', {cwd, like: 'neutral'});
    const {data} = await themeEditHow('divider', {cwd, theme: 'd'});
    const tokens = (data.reads?.background ?? []).map(
      (/** @type {any} */ r) => r.token,
    );
    expect(tokens).toEqual(
      expect.arrayContaining(['--color-border', '--color-border-emphasized']),
    );
  }, 240_000);

  it('less visible: the color its line reads, fainter, per variant', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('f', {cwd, like: 'neutral'});
    const plain = await top('make the divider less visible', 'f');
    expect(plain.commands.length).toBeGreaterThan(0);
    // (Every variant's line: the strong divider's is its own token.)
    for (const x of plain.commands)
      expect(x).toMatch(
        /^set f --color-border(-emphasized)? '#[0-9a-f]{8}' --on divider --mode (light|dark)$/,
      );
    const strong = await top('make strong dividers less visible', 'f');
    for (const x of strong.commands)
      expect(x).toMatch(
        /^set f --color-border-emphasized '#[0-9a-f]{8}' --on divider --when variant:strong --mode (light|dark)$/,
      );
  }, 240_000);

  it('thinner and thicker: from the thickness it shows now', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('t', {cwd, like: 'neutral'});
    expect((await top('make dividers thinner', 't')).commands).toEqual([
      'set t --border-width 0.5px --on divider',
    ]);
    expect((await top('make dividers thicker', 't')).commands).toEqual([
      'set t --border-width 2px --on divider',
    ]);
  }, 240_000);

  it('darker: the color its line reads, on the divider', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('k', {cwd, like: 'neutral'});
    const r = await top('make dividers darker', 'k');
    expect(r.commands.length).toBeGreaterThan(0);
    for (const x of r.commands)
      expect(x).toMatch(
        // (Each variant's line token: the strong divider's is its own.)
        /^set k --color-border(-emphasized)? '#[0-9a-f]{6,8}' --on divider --mode (light|dark)$/,
      );
  }, 240_000);
});
