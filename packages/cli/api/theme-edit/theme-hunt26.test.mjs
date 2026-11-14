// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The twenty-sixth pass over `astryx experimental theme editor`: every
 * `set` a refusal suggests is checked as `set` checks it, and the
 * suggestions carry what was asked (a weight, a size, a number, a dial's own
 * words) instead of a fixed example.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {readSetLine, splitCommand, vetSuggestions} from './_vet.mjs';
import {AstryxError} from '../error.mjs';
import {P} from './_tables.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt26-', FIXTURE_PACKAGES);
  await themeEditNew('b', {cwd});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string[]} run */
const bare = run => run.map(r => r.replace(`${P} `, ''));

/**
 * Each suggested `set` of a refusal, run: none may be refused.
 * @param {string[]} run
 */
async function runsAll(run) {
  for (const line of run) {
    const read = readSetLine(line, 'b');
    if (!read) continue;
    await themeEditSet('b', read.thing, read.value, {cwd, ...read.flags});
  }
}

describe('hunt26: suggestions are checked', () => {
  it('reads a printed set line back into its setting', () => {
    expect(splitCommand(`a 'b c' 'it'\\''s' "d e"`)).toEqual([
      'a',
      'b c',
      "it's",
      'd e',
    ]);
    expect(
      readSetLine(`${P} set b font-size 15px --on card --when level:1`, 'b'),
    ).toEqual({
      thing: 'font-size',
      value: '15px',
      flags: {on: 'card', when: 'level:1'},
    });
    // Another command, another theme, a placeholder: not read.
    expect(readSetLine(`${P} how corners`, 'b')).toBeNull();
    expect(readSetLine(`${P} set c corners pill`, 'b')).toBeNull();
    expect(readSetLine(`${P} set b accent <a color>`, 'b')).toBeNull();
  });

  it('drops a suggested set that set would refuse, and keeps the rest', async () => {
    const e = new AstryxError(
      'x',
      [
        {name: `${P} set b corners 1.25`, reason: 'do this instead'},
        {name: `${P} set b corners pill`, reason: 'do this instead'},
        {name: `${P} how corners`, reason: 'do this instead'},
      ],
      'ERR_THEME_BAD_VALUE',
    );
    // The theme as loaded, through a real refusal's path.
    const r = await refusal(() => themeEditSet('b', 'corners', 'x9', {cwd}));
    expect(r.run.join('\n')).not.toMatch(/corners x9/);
    const {context} = await import('./_context.mjs');
    const {loadTheme} = await import('./_settings.mjs');
    const ctx = await context(cwd);
    const out = vetSuggestions(e, ctx, 'b', loadTheme(cwd, 'b', {}));
    expect(bare(out.suggestions.map(s => s.name))).toEqual([
      'set b corners pill',
      'how corners',
    ]);
  }, 120_000);
});

describe('hunt26: the cases', () => {
  it('N17: a var() fallback inside a color function must be a color', async () => {
    const mix = await refusal(() =>
      themeEditSet(
        'b',
        'background-color',
        'color-mix(in srgb, var(--nope, 12px), red)',
        {cwd, on: 'card'},
      ),
    );
    expect(mix.message).toMatch(/"12px", a var\(\) fallback/);
    await refusal(() =>
      themeEditSet(
        'b',
        'border-color',
        'color-mix(in srgb, red, var(--nope, 1px))',
        {cwd, on: 'card'},
      ),
    );
    // A color fallback, and a channel fallback, are taken.
    await themeEditSet(
      'b',
      'background-color',
      'color-mix(in srgb, var(--nope, blue), red)',
      {cwd, on: 'card'},
    );
    await themeEditSet('b', 'border-color', 'rgb(var(--nope, 0) 0 0)', {
      cwd,
      on: 'card',
    });
  }, 240_000);

  it('N18: an invalid color is never echoed into the token suggestion', async () => {
    for (const v of ['banana', '12px', 'var(--nope, 12px)']) {
      const r = await refusal(() =>
        themeEditSet('b', 'color', v, {cwd, on: 'text'}),
      );
      expect(r.run.join('\n')).not.toContain(v);
      // Nothing readable as a color: no stock color, only how.
      expect(r.run.join('\n')).not.toMatch(/ set b --color-text-primary /);
      await runsAll(r.run);
    }
    const ok = await refusal(() =>
      themeEditSet('b', 'color', 'red', {cwd, on: 'text'}),
    );
    expect(bare(ok.run)[0]).toBe('set b --color-text-primary red');
  }, 240_000);

  it('N19: headings --on heading offers the dial and the asked weight or tracking', async () => {
    const light = await refusal(() =>
      themeEditSet('b', 'headings', 'light', {cwd, on: 'heading'}),
    );
    expect(bare(light.run)).toEqual([
      'set b headings light',
      'set b font-weight 300 --on heading --when level:1',
    ]);
    const tight = await refusal(() =>
      themeEditSet('b', 'headings', 'tight', {cwd, on: 'heading'}),
    );
    expect(bare(tight.run)[1]).toBe(
      'set b letter-spacing -0.02em --on heading --when level:1',
    );
    const odd = await refusal(() =>
      themeEditSet('b', 'headings', 'zzz', {cwd, on: 'heading'}),
    );
    expect(odd.run.join('\n')).not.toMatch(/font-weight 700/);
    await runsAll([...light.run, ...tight.run]);
  }, 240_000);

  it('N20: number tokens carry the number meant', async () => {
    const cases = /** @type {Array<[string, string, string]>} */ ([
      ['--font-weight-bold', '700px', '700'],
      ['--font-weight-bold', '1001', '1000'],
      ['--font-weight-bold', '7OO', '700'],
      ['--text-body-leading', '1,5', '1.5'],
      ['--spacing-4', 'calc(1rem+2px)', "'calc(1rem + 2px)'"],
    ]);
    for (const [token, typed, meant] of cases) {
      const r = await refusal(() => themeEditSet('b', token, typed, {cwd}));
      expect(bare(r.run)[0]).toBe(`set b ${token} ${meant}`);
    }
  }, 240_000);

  it('N21: text-size --on a part carries the asked size', async () => {
    for (const [v, px] of [
      ['large', '15px'],
      ['20', '20px'],
      ['32', '32px'],
    ]) {
      const r = await refusal(() =>
        themeEditSet('b', 'text-size', v, {cwd, on: 'card'}),
      );
      expect(bare(r.run)[0]).toBe(`set b font-size ${px} --on card`);
    }
    const step = await refusal(() =>
      themeEditSet('b', 'text-size', 'more', {cwd, on: 'card'}),
    );
    expect(step.run.join('\n')).not.toMatch(/font-size 13px/);
  }, 240_000);

  it("N22: a word dial given a number suggests that dial's own words", async () => {
    const ratio = await refusal(() => themeEditSet('b', 'type', '1.3', {cwd}));
    expect(bare(ratio.run)[0]).toBe('set b type editorial');
    // A number no table of the dial reads gets how, never a stock word.
    for (const dial of ['type', 'surfaces', 'buttons']) {
      const r = await refusal(() => themeEditSet('b', dial, '16', {cwd}));
      expect(r.run.join('\n')).not.toMatch(/ corners /);
      expect(r.run.join('\n')).not.toMatch(new RegExp(` set b ${dial} `));
    }
    // A size with a unit on buttons is still the corners on the button.
    const px = await refusal(() => themeEditSet('b', 'buttons', '4px', {cwd}));
    expect(bare(px.run)[0]).toBe('set b corners 4px --on button');
  }, 240_000);

  it('how: more washed out colors is less vibrancy', async () => {
    await themeEditNew('w', {cwd});
    await themeEditSet('w', 'accent', '#0d9488', {cwd});
    const top = async (/** @type {string} */ q) =>
      (
        await themeEditHow(q, {cwd, theme: 'w'})
      ).data.results[0].commands[0].replace(/^.* editor /, '');
    expect(await top('more washed out colors')).toBe('set w vibrancy less');
    expect(await top('more muted colors')).toBe('set w vibrancy less');
    expect(await top('more colorful')).toBe('set w vibrancy more');
  }, 240_000);
});
