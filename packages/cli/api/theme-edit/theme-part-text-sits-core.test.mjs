// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A part whose text sits on Core's media surface inside it (a toast's
 * inverted surface) takes its text color through the on-dark and on-light
 * colors, which its color writes; resting shadows on ringed parts keep each render's own rings (no
 * shadow too) and give way to a state's own shadow; an input's focus ring
 * is its box-shadow ring; thumb words; covers notes keep their mode; the
 * corners help names the step between round and pill. Against real bundled
 * base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
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
    'astryx-theme-part-text-sits-core-',
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

describe("a toast's text color", () => {
  it('is its color on the toast, and a text token there is refused with that line', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('t', {cwd, like: 'neutral'});
    const r = await refusal(() =>
      themeEditSet('t', '--color-text-primary', '#2a2a2a', {cwd, on: 'toast'}),
    );
    expect(r.code).toBe('ERR_THEME_NO_EFFECT');
    expect(r.message).toMatch(/media surface/);
    const answer = await top('make the toast text #2a2a2a', 't');
    expect(answer.commands).toEqual(["set t color '#2a2a2a' --on toast"]);
    await themeEditSet('t', 'color', '#2a2a2a', {cwd, on: 'toast'});
    // The color goes into the two colors the surface gives its text, on
    // the toast alone.
    const css = fs.readFileSync(path.join(cwd, 'themes/t/t.css'), 'utf8');
    const toast = css.slice(css.indexOf('.astryx-toast'));
    expect(toast).toMatch(/--color-on-dark:\s*#2a2a2a/i);
    expect(toast).toMatch(/--color-on-light:\s*#2a2a2a/i);
  }, 240_000);
});

describe('the corners help', () => {
  it('names the step between round and pill', async ctx => {
    if (needBases(ctx)) return;
    const {data} = await themeEditHow('corners', {cwd});
    expect(JSON.stringify(data)).toMatch(
      /24px \(the step between round and pill\), pill/,
    );
  }, 240_000);
});

/** The box-shadow of the first rule for a selector. @param {string} css @param {string} sel */
const shadowOf = (css, sel) =>
  new RegExp(
    `${sel.replace(/[.[\]="()]/g, m => `\\${m}`)}[^{]*\\{\\s*box-shadow: ([^;]*);`,
  ).exec(css)?.[1];

describe('a resting shadow on a ringed part', () => {
  it("keeps each render's own rings: none leaves every field's focus ring, and a status draws the shadow under its ring while focused", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('r', {cwd, like: 'neutral'});
    await themeEditSet('r', 'box-shadow', 'none', {cwd, on: 'inputs'});
    let css = cssOf('r');
    expect(shadowOf(css, '.astryx-text-input:focus-within')).toBe(
      'inset 0 0 0 2px var(--color-accent-muted)',
    );
    expect(
      shadowOf(css, '.astryx-text-input[data-status="error"]:focus-within'),
    ).toBe('inset 0 0 0 2px var(--color-accent-muted)');
    await themeEditNew('r2', {cwd, like: 'neutral'});
    await themeEditSet('r2', 'box-shadow', '0 2px 6px #0000004d', {
      cwd,
      on: 'inputs',
    });
    css = cssOf('r2');
    expect(
      shadowOf(css, '.astryx-text-input[data-status="error"]:focus-within'),
    ).toBe('0 2px 6px #0000004d, inset 0 0 0 2px var(--color-accent-muted)');
    // A later hover shadow for the part wins on every render.
    await themeEditSet('r2', 'box-shadow', '0 0 0 1px red', {
      cwd,
      on: 'inputs',
      state: 'hover',
    });
    css = cssOf('r2');
    expect(css).not.toMatch(
      /\[data-status="error"\]:hover[^{]*\{\s*box-shadow: 0 2px 6px/,
    );
  }, 240_000);
});

describe("an input's focus ring", () => {
  it('is its box-shadow ring, and an outline color on it is refused', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('f', {cwd, like: 'neutral'});
    const r = await top('red focus ring on text inputs', 'f');
    expect(r.commands[0]).toBe(
      "set f box-shadow 'inset 0 0 0 2px #dc2626' --on text-input --state focus-within --only",
    );
    const no = await refusal(() =>
      themeEditSet('f', 'outline-color', 'red', {
        cwd,
        on: 'text-input',
        state: 'focus-within',
        only: true,
      }),
    );
    expect(no.code).toBe('ERR_THEME_NO_EFFECT');
  }, 240_000);
});

describe('words and notes', () => {
  it('reads a toggle thumb or switch knob as the thumb', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('w', {cwd, like: 'neutral'});
    expect((await top('make the toggle thumb blue', 'w')).commands[0]).toMatch(
      /--on switch-thumb$/,
    );
    expect(
      (await top('make the switch knob black in dark mode', 'w')).commands[0],
    ).toMatch(/--on switch-thumb --mode dark$/);
  }, 240_000);

  it('keeps the mode of a one-mode fill in its covers notes', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('m', {cwd, like: 'neutral'});
    const r = await themeEditSet('m', 'background-color', '#16a34a', {
      cwd,
      on: 'button',
      mode: 'light',
    });
    const note = r.data.notes.find(n =>
      /covers the fill Core gives it/.test(n),
    );
    expect(note).toMatch(/^in light mode, /);
    expect(note).toMatch(/--when variant:primary --mode light/);
  }, 240_000);
});
