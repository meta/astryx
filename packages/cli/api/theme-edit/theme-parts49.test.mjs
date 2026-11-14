// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Part facts read from Core's real styles: the hover fill a table row reads
 * under its table's look flags, the states a part takes from one list, the
 * parts that draw a part's corners, and the text tokens a part's inner text
 * reads. Also the corners dial on bases that pin radii, results that report
 * what they wrote, and refusals that point to working commands. Against real
 * bundled base themes.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';

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
  cwd = makeLinkedFixture('astryx-theme-parts49-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, [
    'neutral',
    'butter',
    'y2k',
    'stone',
    'chocolate',
  ]);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug */
const cssOf = slug =>
  fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8');

/** @param {string} slug @param {string} selector */
const ruleOf = (slug, selector) => {
  const css = cssOf(slug);
  const i = css.indexOf(`${selector} {`);
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i));
};

/** @param {import('vitest').TestContext} ctx */
const needBases = ctx => {
  if (!unbuilt) return false;
  console.warn(`skipped: ${unbuilt}`);
  ctx.skip();
  return true;
};

/** The set commands of a how answer's first result that changes the theme. */
const firstChange = async (/** @type {string} */ question, theme = 'h') => {
  const {data} = await themeEditHow(question, {cwd, theme});
  /** @type {Array<{commands: string[]}>} */
  const results = data.results ?? [];
  return (
    results.find(r => r.commands.some(c => / editor set /.test(c)))?.commands ??
    []
  );
};

describe('part facts from Core styles', () => {
  it("reads a table row's hover fill and steps that token for a lighter hover", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('h', {cwd, like: 'neutral'});
    const {data} = await themeEditHow('table-row', {cwd, theme: 'h'});
    const hover = data.reads.background.find(
      (/** @type {any} */ r) => r.token === '--color-overlay-hover',
    );
    expect(hover?.when).toContain('--state hover');
    const commands = await firstChange('make table row hover a bit lighter');
    expect(commands.join(' ')).toMatch(
      /set h --color-overlay-hover '[^']+' --on table-row/,
    );
    expect(commands.join(' ')).not.toMatch(/filter/);
  }, 240_000);

  it('lists the same states in how and in the refusal of a state the part lacks', async ctx => {
    if (needBases(ctx)) return;
    const {data} = await themeEditHow('table-row', {cwd, theme: 'h'});
    const r = await refusal(() =>
      themeEditSet('h', 'background-color', '#eeeeff', {
        cwd,
        on: 'table-row',
        state: 'checked',
      }),
    );
    expect(r.message).toContain(`States: ${data.states.join(', ')}.`);
  }, 240_000);

  it("rounds the parts that draw a part's corners, for the part and its group", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('c', {cwd, like: 'neutral'});
    await themeEditSet('c', 'corners', 'square', {cwd, on: 'inputs'});
    for (const segment of ['date', 'time'])
      expect(ruleOf('c', `.astryx-date-time-input-${segment}-segment`)).toMatch(
        /border-radius: 0px/,
      );
    await themeEditSet('c', 'corners', 'pill', {cwd, on: 'date-time-input'});
    expect(ruleOf('c', '.astryx-date-time-input-date-segment')).toMatch(
      /border-radius: 9999px/,
    );
  }, 240_000);

  it('writes a color on a part whose inner text reads a text token into that token', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('t', {cwd, like: 'butter'});
    await themeEditSet('t', 'color', '#ff0000', {cwd, on: 'top-nav-heading'});
    const rule = ruleOf('t', '.astryx-top-nav-heading');
    expect(rule).toMatch(/--color-text-primary: #ff0000/);
    expect(rule).toMatch(/color: #ff0000/);
    // A whole top nav: the text tokens the parts inside it read, on it.
    const commands = await firstChange('white text in the top nav', 't');
    expect(commands.join(' ')).toMatch(
      /set t --color-text-primary '#ffffff' --on top-nav/,
    );
  }, 240_000);
});

describe('the focus ring an indicator draws at focus time', () => {
  it('lets the focus outline tokens be set on checkbox and radio indicators', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('f', {cwd, like: 'neutral'});
    await themeEditSet('f', '--focus-outline-color', '#db2777', {
      cwd,
      on: 'checks',
    });
    for (const part of ['checkbox-indicator', 'radio-indicator'])
      expect(ruleOf('f', `.astryx-${part}`), part).toMatch(
        /--focus-outline-color: #db2777/,
      );
  }, 240_000);
});

describe('a group kept alike', () => {
  it('says one member changed alone now differs in height', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('a', {cwd, like: 'neutral'});
    const r = await themeEditSet('a', 'spacing', 'roomy', {
      cwd,
      on: 'text-input',
      only: true,
    });
    expect(r.data.notes.join(' ')).toMatch(
      /text-input alone now differs in height from the rest of inputs.*--on inputs/,
    );
  }, 240_000);
});

describe('the corners dial on bases that pin radii', () => {
  it("leaves a part Core rounds with a token the dial never moves (y2k's pill badge)", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('y', {cwd, like: 'y2k'});
    await themeEditSet('y', 'corners', 'pill', {cwd});
    const badge = ruleOf('y', '.astryx-badge');
    expect(badge).toMatch(/border-radius: 9999px/);
    expect(badge).not.toMatch(/border-radius: var\(--radius-full\)/);
  }, 240_000);

  it('moves a part a base pins to a fixed radius token', async ctx => {
    if (needBases(ctx)) return;
    for (const like of ['stone', 'chocolate']) {
      const slug = `s-${like}`;
      await themeEditNew(slug, {cwd, like});
      await themeEditSet(slug, 'corners', 'square', {cwd});
      expect(ruleOf(slug, '.astryx-button'), like).toMatch(
        /border-radius: var\(--radius-element\)/,
      );
    }
  }, 240_000);

  it('keeps corners set on a part when a whole-theme dial follows', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('k', {cwd, like: 'y2k'});
    await themeEditSet('k', 'corners', '20px', {cwd, on: 'card'});
    await themeEditSet('k', 'corners', 'small', {cwd});
    expect(ruleOf('k', '.astryx-card')).toMatch(/border-radius: 20px/);
  }, 240_000);
});

describe('results and refusals', () => {
  it('reports a state rule it writes where the base has a state block', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('r', {cwd, like: 'butter'});
    const r = await themeEditSet('r', 'color', '#ff0000', {
      cwd,
      on: 'button',
      state: 'hover',
      mode: 'dark',
    });
    expect(r.data.styled.join('\n')).toMatch(
      /button variant:secondary :hover: color /,
    );
  }, 240_000);

  it('says nothing covers a color given beside its own image', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('g', {cwd, like: 'chocolate'});
    const r = await themeEditSet(
      'g',
      'background',
      'linear-gradient(red, blue) no-repeat center / 50% 50%, ivory',
      {cwd, on: 'card', mode: 'dark'},
    );
    expect(r.data.notes.join(' ')).not.toMatch(/covers|does not show/);
  }, 240_000);

  it('offers only the color for a keyword with --mode on a token', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('w', {cwd, like: 'stone'});
    const r = await refusal(() =>
      themeEditSet('w', '--color-text-primary', 'inherit', {
        cwd,
        mode: 'dark',
      }),
    );
    expect(r.code).toBe('ERR_THEME_NO_MODE');
    expect(r.message).not.toMatch(/for both modes/);
    expect(r.run.join(' ')).not.toMatch(/ set w --color-text-primary inherit/);
  }, 240_000);

  it('never offers to change a one-mode theme for a thing that takes no mode', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('l', {cwd, like: 'stone'});
    await themeEditSet('l', 'mode', 'light-only', {cwd});
    const r = await refusal(() =>
      themeEditSet('l', 'spacing', 'roomy', {cwd, mode: 'dark'}),
    );
    expect(r.message).toMatch(/not a color/);
    expect(r.run.join(' ')).not.toMatch(/mode both/);
    expect(r.run[0]).toMatch(/ set l spacing roomy$/);
  }, 240_000);

  it('names the group member that cannot keep the other mode and offers --only', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('m', {cwd, like: 'butter'});
    const r = await refusal(() =>
      themeEditSet('m', 'border-color', '#ff0000', {
        cwd,
        on: 'text-input',
        state: 'focus-within',
        mode: 'dark',
      }),
    );
    // The members that cannot keep it are named, never the part asked for.
    expect(r.message).toMatch(/complex-selector/);
    expect(r.message).not.toMatch(/^text-input /);
    expect(r.run[0]).toMatch(
      /--on text-input --only --state focus-within --mode dark$/,
    );
  }, 240_000);
});
