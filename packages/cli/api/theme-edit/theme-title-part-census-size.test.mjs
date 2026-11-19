// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A title said of a part the census knows ("the empty state title") is that
 * part's own title part: its size and color go to the text, never to the
 * whole part or every heading. Against real bundled base themes.
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
  cwd = makeLinkedFixture(
    'astryx-theme-title-part-census-size-',
    FIXTURE_PACKAGES,
  );
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

describe('a component title', () => {
  it('is the title part: its size and color, never the whole part or a background', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('e', {cwd, like: 'neutral'});
    const bigger = await top('make the empty state title bigger', 'e');
    expect(bigger.commands).toEqual([
      expect.stringMatching(
        /^set e font-size [\d.]+rem --on empty-state-title$/,
      ),
    ]);
    const both = await top('make the empty state title red and bigger', 'e');
    expect(both.commands).toEqual([
      "set e color '#dc2626' --on empty-state-title",
      expect.stringMatching(
        /^set e font-size [\d.]+rem --on empty-state-title$/,
      ),
    ]);
    expect(both.commands.join(' ')).not.toMatch(/background|--on heading\b/);
    // Headings said alone keep reading as headings.
    expect((await top('make headers bolder', 'e')).commands[0]).toMatch(
      /^set e headings bold$/,
    );
  }, 240_000);
});
