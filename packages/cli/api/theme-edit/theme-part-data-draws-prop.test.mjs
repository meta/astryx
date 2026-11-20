// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The part data draws every prop that changes a part's look (a toast's
 * type, an avatar's shape), and reads a prop as a condition where it
 * changes a color the part paints; pieces of a part (a select's chevron, a
 * field's segments) and a selection said in another word (a toggle
 * button's pressed state) are read as the part has them; an indeterminate
 * ask reaches indeterminate boxes only. Against real bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
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

/** Why a bundled theme could not be built here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-part-data-draws-prop-',
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

describe("an error toast's background", () => {
  it('is read from what Core paints an error toast, so darker steps from its red', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('e', {cwd, like: 'neutral'});
    const r = await top('make the error toast background darker', 'e');
    expect(r.text).toMatch(/from --color-background-error-inverted/);
    expect(r.commands).toEqual([
      expect.stringMatching(
        /^set e background-color '#[0-9a-f]{6}' --on toast --when type:error --mode light$/,
      ),
      expect.stringMatching(
        /^set e background-color '#[0-9a-f]{6}' --on toast --when type:error --mode dark$/,
      ),
    ]);
  }, 240_000);
});

describe('a kept avatar', () => {
  it('pins every corner token its shapes read', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('a', {cwd, like: 'neutral'});
    const r = await top('square corners on everything but avatars', 'a');
    expect(r.commands[0]).toBe('set a corners square');
    expect(
      r.commands.filter(x => / --on avatar$/.test(x)).length,
    ).toBeGreaterThan(1);
  }, 240_000);
});

describe('pieces and words', () => {
  it("reads a select's chevron or caret as its indicator icon, never the select or the text cursor", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('p', {cwd, like: 'neutral'});
    for (const q of [
      'make the select chevron blue',
      'make the dropdown caret blue',
    ])
      expect((await top(q, 'p')).commands, q).toEqual([
        "set p color '#2563eb' --on selector-indicator-icon",
      ]);
  }, 240_000);

  it('reaches indeterminate boxes only for an indeterminate ask', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('i', {cwd, like: 'neutral'});
    expect(
      (await top('make indeterminate checkboxes red', 'i')).commands,
    ).toEqual([
      "set i background-color '#dc2626' --on checkbox-indicator --when checked:indeterminate --only",
    ]);
  }, 240_000);

  it("reads selected as a toggle button's pressed state", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('t', {cwd, like: 'neutral'});
    expect(
      (await top('make toggle buttons red when selected', 't')).commands,
    ).toEqual([
      "set t background-color '#dc2626' --on toggle-button --state isPressed",
    ]);
  }, 240_000);

  it('names segments a date picker does not have, never bordering the whole field', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('d', {cwd, like: 'neutral'});
    const {data} = await themeEditHow('make date picker segments bordered', {
      cwd,
      theme: 'd',
    });
    expect(
      (data.results ?? []).flatMap(x =>
        x.commands.filter(c => / editor set /.test(c)),
      ),
    ).toEqual([]);
    expect(JSON.stringify(data)).toMatch(
      // (Named by Core's part: a date picker is the date input.)
      /Core has no date input segment part of its own/,
    );
  }, 240_000);
});

describe('rings, borders and dots in one mode or for all', () => {
  it('keeps the hover ring beside a one-mode hover shadow on inputs', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('h', {cwd, like: 'neutral'});
    const r = await top(
      'make hovered inputs have a blue shadow in dark mode',
      'h',
    );
    expect(r.commands[0]).toMatch(
      /^set h box-shadow 'inset 0 0 0 2px color-mix\(.*\), .*light-dark\(transparent, #2563eb\).*' --on inputs --state hover$/,
    );
  }, 240_000);

  it('reads "half as visible" as the input ring at half its alpha', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('v', {cwd, like: 'neutral'});
    expect(
      (await top('make the input focus ring half as visible', 'v')).commands[0],
    ).toBe(
      "set v box-shadow 'inset 0 0 0 2px color-mix(in srgb, var(--color-accent-muted) 50%, transparent)' --on inputs --state focus-within",
    );
  }, 240_000);

  it('draws a one-mode border on a part with no line, see-through in the other mode', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('b', {cwd, like: 'neutral'});
    expect(
      (await top('make the button border red in dark mode', 'b')).commands,
    ).toEqual([
      // (A ring at its edge, which takes no room: a border would take its
      // width in the other mode too.)
      "set b box-shadow 'inset 0 0 0 1px light-dark(transparent, #dc2626)' --on button --when elevation:none",
    ]);
  }, 240_000);

  it("reads a radio's dot as its dot part", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('r', {cwd, like: 'neutral'});
    expect((await top('make the radio dot red', 'r')).commands).toEqual([
      "set r background-color '#dc2626' --on radio-indicator-dot",
    ]);
  }, 240_000);

  it("colors every focus ring, the inputs' box-shadow rings included", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('fr', {cwd, like: 'neutral'});
    const r = await top('make all focus rings red', 'fr');
    expect(r.commands.slice(0, 2)).toEqual([
      "set fr --focus-outline-color '#dc2626'",
      "set fr box-shadow 'inset 0 0 0 2px #dc2626' --on inputs --state focus-within",
    ]);
  }, 240_000);
});

describe('a state a part does not draw apart', () => {
  it('names it for a progress bar, and never adds the checkboxes', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('pg', {cwd, like: 'neutral'});
    const {data} = await themeEditHow(
      'make the progress indicator red when indeterminate',
      {cwd, theme: 'pg'},
    );
    const all = (data.results ?? []).flatMap(x => x.commands);
    expect(all.filter(c => / editor set /.test(c))).toEqual([]);
    expect(JSON.stringify(data)).toMatch(
      /progress-bar-fill has no indeterminate state/,
    );
  }, 240_000);
});
