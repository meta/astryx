// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Whole-theme dials reach every part they name: corners move the chat
 * composer drawer's radius, the headings dial and a heading font reach a
 * part drawn as a heading element that reads none of the headings' tokens
 * (an empty state's title), a body font set alone leaves that title with
 * the heading font every other heading keeps on a base with one family (a
 * base with two families keeps it in the body's family, and a part's own font
 * stays), and a setting on the inputs reaches the file input. Against real
 * bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-dials-reach-parts-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral', 'matcha']);
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

describe('whole-theme dials', () => {
  it('reach the chat drawer, heading elements and the file input', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('z', {cwd, like: 'neutral'});
    await themeEditSet('z', 'corners', 'square', {cwd});
    await themeEditSet('z', 'headings', 'heavy', {cwd});
    await themeEditSet('z', 'font', 'Georgia', {cwd, on: 'heading'});
    await themeEditSet('z', 'border', 'none', {cwd, on: 'inputs'});
    const css = fs.readFileSync(path.join(cwd, 'themes', 'z', 'z.css'), 'utf8');
    expect(css).toMatch(/--radius-chat: var\(--radius-container\)/);
    expect(css).toMatch(
      /\.astryx-empty-state-title \{\s*font-weight: 800;\s*font-family: var\(--font-family-heading\);/,
    );
    expect(css).toMatch(/\.astryx-file-input \{\s*border: none;/);
  }, 240_000);

  it('keep an empty state title on the heading font when the body font changes alone', async ctx => {
    if (needBases(ctx)) return;
    const headingFont =
      /\.astryx-empty-state-title \{[^}]*font-family: var\(--font-family-heading\);/;
    await themeEditNew('b', {cwd, like: 'neutral'});
    await themeEditSet('b', 'font', 'Georgia', {cwd, on: 'body'});
    const read = () =>
      fs.readFileSync(path.join(cwd, 'themes', 'b', 'b.css'), 'utf8');
    expect(read()).toMatch(headingFont);
    await themeEditNew('t', {cwd, like: 'neutral'});
    await themeEditSet(
      't',
      '--font-family-body',
      '"IBM Plex Sans", sans-serif',
      {cwd},
    );
    expect(
      fs.readFileSync(path.join(cwd, 'themes', 't', 't.css'), 'utf8'),
    ).toMatch(headingFont);
    // One font for the whole theme is one family: nothing is written.
    await themeEditNew('w', {cwd, like: 'neutral'});
    await themeEditSet('w', 'font', 'Georgia', {cwd});
    expect(
      fs.readFileSync(path.join(cwd, 'themes', 'w', 'w.css'), 'utf8'),
    ).not.toMatch(headingFont);
    /** @param {string} slug */
    const css = slug =>
      fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8');
    // An exact body font beside a whole-theme font: the built theme draws
    // the body in the exact font and headings in the dial's.
    await themeEditNew('x', {cwd, like: 'neutral'});
    await themeEditSet(
      'x',
      '--font-family-body',
      '"IBM Plex Sans", sans-serif',
      {cwd},
    );
    await themeEditSet('x', 'font', 'Georgia', {cwd});
    expect(css('x')).toMatch(headingFont);
    // A font set on the title itself stays: a dial never overwrites it.
    await themeEditNew('o', {cwd, like: 'neutral'});
    await themeEditSet('o', 'font-family', '"Courier New", monospace', {
      cwd,
      on: 'empty-state-title',
    });
    await themeEditSet('o', 'font', 'Georgia', {cwd, on: 'body'});
    expect(css('o')).toMatch(/\.astryx-empty-state-title \{[^}]*Courier New/);
    expect(css('o')).not.toMatch(headingFont);
    // A font on the title under a variant is not the plain title's: the
    // plain title still takes the heading font.
    await themeEditNew('v', {cwd, like: 'neutral'});
    await themeEditSet('v', 'font-family', '"Courier New", monospace', {
      cwd,
      on: 'empty-state-title',
      when: 'variant:compact',
    });
    await themeEditSet('v', 'font', 'Georgia', {cwd, on: 'body'});
    expect(css('v')).toMatch(headingFont);
    // A font on the title stays after a heading font too, and a font on the
    // empty state around it reaches it.
    await themeEditNew('h', {cwd, like: 'neutral'});
    await themeEditSet('h', 'font-family', '"Courier New", monospace', {
      cwd,
      on: 'empty-state-title',
    });
    await themeEditSet('h', 'font', 'Georgia', {cwd, on: 'heading'});
    expect(css('h')).not.toMatch(headingFont);
    await themeEditNew('r', {cwd, like: 'neutral'});
    await themeEditSet('r', 'font-family', '"Courier New", monospace', {
      cwd,
      on: 'empty-state',
    });
    await themeEditSet('r', 'font', 'Georgia', {cwd, on: 'body'});
    expect(css('r')).not.toMatch(headingFont);
    // Matcha draws headings and body in two families, and its empty state
    // title in the body's: a body font keeps the title with the body, and a
    // heading font still reaches it.
    await themeEditNew('m', {cwd, like: 'matcha'});
    await themeEditSet('m', 'font', 'Georgia', {cwd, on: 'body'});
    expect(css('m')).not.toMatch(headingFont);
    await themeEditNew('mh', {cwd, like: 'matcha'});
    await themeEditSet('mh', 'font', 'Georgia', {cwd, on: 'heading'});
    expect(css('mh')).toMatch(headingFont);
  }, 240_000);
});
