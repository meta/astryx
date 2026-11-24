// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How's general readers: a bound is a limit on the asks of
 * its kind said with it (a part-less one holds the parts those asks name;
 * one inside another ask leaves that ask whole; a size bound holds each
 * size the step writes); a color bound holds a step by its own ink and a
 * dial seed by the modes still within it; a ratio's ground may name its
 * variant or a background token; a typed amount, opacity or see-through
 * fill is read as written; status, focus ring and line thickness questions
 * are answered from what the theme reads; typed tokens move the way asked;
 * the page's dials are the whole theme's; a word before "border" or "text"
 * naming a token is that token; a shape named as the thing given a color
 * is that thing; motion words are never an unknown part. Every line
 * offered is run.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-general-readers-bound-limit-',
    FIXTURE_PACKAGES,
  );
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('q0', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} theme @param {string} ask */
const how = async (theme, ask) => {
  const {data} = /** @type {any} */ (await themeEditHow(ask, {cwd, theme}));
  return /** @type {Array<{text: string, commands: string[]}>} */ (
    data.results ?? []
  ).map(r => ({
    text: r.text,
    commands: r.commands.map(c => c.replace(/^.*? editor /, '')),
  }));
};

/** @param {Array<{commands: string[]}>} rs */
const writes = rs =>
  rs.flatMap(r => r.commands).filter(c => /^(set|undo) /.test(c));

/** Run each line as offered. @param {string[]} lines */
const follow = async lines => {
  for (const line of lines) {
    const args =
      line.match(/'[^']*'|\S+/g)?.map(w => w.replace(/^'|'$/g, '')) ?? [];
    const r = await runCli(['experimental', 'theme', 'editor', ...args], cwd);
    expect(r.status, line).toBe(0);
  }
};

/** A fresh theme on neutral. @param {string} name */
const fresh = async name => {
  await themeEditNew(name, {cwd, like: 'neutral'});
  return name;
};

/** A length in px. @param {string} v */
const px = v => {
  const m = /^(\d*\.?\d+)(px|rem)$/.exec(v.trim());
  return m ? Number(m[1]) * (m[2] === 'rem' ? 16 : 1) : null;
};

describe('a bound is a limit on the asks of its kind', () => {
  it('said with no part, it holds the parts the asks name and writes no dial', async () => {
    const t = await fresh('b1');
    const rs = await how(
      t,
      'never rounder than 8px; make the buttons and cards rounder',
    );
    const lines = writes(rs);
    expect(lines.join('\n')).not.toMatch(
      /set b1 (corners|--radius-container|--radius-page) \S+$/m,
    );
    expect(rs[0].text).toMatch(/button is 0\.625rem already, past it/);
    await follow(lines);
  }, 240_000);

  it('said inside another ask, that ask stays whole', async () => {
    const t = await fresh('b2');
    const lines = writes(
      await how(
        t,
        'make the buttons rounder and the cards bolder, but never rounder than 8px',
      ),
    );
    expect(lines).toContain(`set ${t} font-weight 700 --on card`);
    expect(lines.join('\n')).not.toMatch(/border-radius 8px --on card/);
    await follow(lines);
  }, 240_000);

  it('a size bound holds each heading size the step writes', async () => {
    for (const [t, ask] of [
      ['b3', 'make the headings smaller and never smaller than 18px'],
      ['b4', 'make the headings smaller but never smaller than 18px'],
    ]) {
      await fresh(t);
      const lines = writes(await how(t, ask));
      expect(lines.length).toBeGreaterThan(0);
      for (const l of lines) {
        const v = /--text-heading-\d-size (\S+)/.exec(l)?.[1];
        expect(v, l).toBeDefined();
        expect(px(String(v)), l).toBeGreaterThanOrEqual(18);
      }
      expect(lines.join('\n')).not.toMatch(/font-size 18px --on heading/);
      await follow(lines);
    }
  }, 240_000);
});

describe('a color bound', () => {
  it('said by its color alone keeps the mode of the ask', async () => {
    const t = await fresh('c1');
    const lines = writes(
      await how(
        t,
        'make the card background darker in dark mode, at most #000000',
      ),
    );
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).toMatch(/--mode dark$/);
    await follow(lines);
  }, 240_000);

  it("holds a part's fill by its own ink, never the bound's color", async () => {
    const t = await fresh('c2');
    await themeEditSet(t, '--color-background-card', '#fff1d6', {
      cwd,
      mode: 'light',
    });
    const lines = writes(
      await how(
        t,
        'make the card background darker but not darker than #f0f0f0',
      ),
    );
    const v =
      /background-color '(#[0-9a-f]{6})' --on card --when variant:default/.exec(
        lines.join('\n'),
      )?.[1];
    expect(v).toBeDefined();
    expect(v).not.toBe('#f0f0f0');
    // (Its warm hue kept: more red than blue.)
    const n = parseInt(String(v).slice(1), 16);
    expect(n >> 16).toBeGreaterThan(n & 0xff);
    await follow(lines);
  }, 240_000);

  it('a dial seed past it in one mode is written to the token in the other', async () => {
    const t = await fresh('c3');
    const lines = writes(
      await how(t, 'make the accent lighter but never lighter than #e0e0ff'),
    );
    expect(lines).toEqual([
      expect.stringMatching(
        new RegExp(`^set ${t} --color-accent '#[0-9a-f]{6}' --mode light$`),
      ),
    ]);
    await follow(lines);
  }, 240_000);
});

describe("a ratio's ground", () => {
  it('a variant or a background token named as the ground is measured against', async () => {
    const t = await fresh('g1');
    const muted = await how(t, 'make the secondary text 4.5:1 on muted cards');
    expect(muted[0].text).toContain('against --color-background-muted');
    const bg = await how(
      t,
      'make the secondary text 4.5:1 on the muted background',
    );
    expect(bg[0].text).toContain('against --color-background-muted');
    expect(writes(bg).join('\n')).not.toMatch(/--color-background-body/);
    await follow(writes(bg));
  }, 240_000);
});

describe('amounts as written', () => {
  it('a typed percent fainter, a see-through fill, an opacity on the text', async () => {
    const t = await fresh('a1');
    const faint = await how(t, 'make the card border 20% fainter');
    expect(faint[0].text).toContain('80% of its alpha');
    await follow(writes(faint));
    const fill = writes(
      await how(t, 'make the card background more transparent'),
    );
    expect(fill).toEqual([
      `set ${t} background-color 'color-mix(in srgb, var(--color-background-card) 60%, transparent)' --on card`,
    ]);
    await follow(fill);
    const text = writes(await how(t, 'make the text 80% opaque'));
    expect(text[0]).toBe(
      `set ${t} --color-text-primary '#000000cc' --mode light`,
    );
    await follow(text);
  }, 240_000);
});

describe('value questions', () => {
  it("a status banner, the focus ring width, a divider's thickness", async () => {
    const banner = await how(
      'q0',
      'what color is the success banner background?',
    );
    expect(banner[0].text).toMatch(
      /#[0-9a-f]{6} \(--color-success-muted, status success\)/i,
    );
    const ring = await how('q0', 'how thick is the focus ring?');
    expect(ring[0].text).toContain('(--focus-outline-width)');
    const divider = await how('q0', 'how thick are dividers');
    expect(divider[0].text).toMatch(/^divider has border-width 1px now/);
    for (const r of [banner, ring, divider]) expect(writes(r)).toEqual([]);
  }, 240_000);
});

describe('tokens, pages, words', () => {
  it('typed tokens move the way asked, each from its own value', async () => {
    const t = await fresh('w1');
    const sizes = writes(
      await how(t, '--text-heading-1-size and --text-heading-2-size bigger'),
    );
    expect(sizes.map(l => l.split(' ')[2])).toEqual([
      '--text-heading-1-size',
      '--text-heading-2-size',
    ]);
    await follow(sizes);
    const colors = writes(
      await how(t, 'make --color-accent and --color-error darker'),
    );
    expect(new Set(colors.map(l => l.split(' ')[2]))).toEqual(
      new Set(['--color-accent', '--color-error']),
    );
    await follow(colors);
  }, 240_000);

  it("the page's corners and font are the whole theme's", async () => {
    const t = await fresh('w2');
    expect(writes(await how(t, 'make the page rounder'))).toEqual([
      `set ${t} corners more`,
    ]);
    const font = writes(await how(t, 'make the page font Georgia'));
    expect(font.join('\n')).not.toMatch(/background/);
    await follow(font);
  }, 240_000);

  it('a word before border or text that names a token is that token', async () => {
    const t = await fresh('w3');
    const em = writes(await how(t, 'make the emphasized border darker'));
    expect(em.every(l => l.includes('--color-border-emphasized'))).toBe(true);
    await follow(em);
    const muted = writes(await how(t, 'make the muted text 50% transparent'));
    expect(muted.every(l => l.includes('--color-text-secondary'))).toBe(true);
    await follow(muted);
  }, 240_000);

  it('dividers thicker and red: both; radio circles red: their color', async () => {
    const t = await fresh('w4');
    const div = writes(await how(t, 'make dividers thicker and red'));
    // (Every color its line is drawn in, then its thickness.)
    expect(div).toEqual([
      `set ${t} --color-border '#dc2626' --on divider`,
      `set ${t} --color-border-emphasized '#dc2626' --on divider`,
      `set ${t} --border-width 2px --on divider`,
    ]);
    await follow(div);
    const radio = writes(await how(t, 'make radio circles red'));
    expect(radio[0]).toMatch(
      /^set w4 background-color '#dc2626' --on radio-indicator/,
    );
    await follow(radio);
  }, 240_000);

  it('row dividers thicker: nothing written, and why (the cells draw the line per render)', async () => {
    const rs = await how('q0', 'make the table row dividers thicker');
    expect(writes(rs)).toEqual([]);
    expect(rs[0].text).toMatch(
      /^table-row dividers are drawn by table-header-cell and table-cell, whose line width Core sets per render; the editor can't change that width without touching the borders of the controls inside table-row/,
    );
  }, 240_000);

  it('motion words are what changes, never an unknown part', async () => {
    const t = await fresh('w5');
    const faster = writes(await how(t, 'make transitions faster'));
    expect(faster[0]).toMatch(/^set w5 --duration-fast \d+ms$/);
    await follow(faster);
    const typed = writes(await how(t, 'make animations 1,500 ms'));
    expect(typed[0]).toBe(`set ${t} --duration-fast 1500ms`);
    await follow(typed);
  }, 240_000);
});
