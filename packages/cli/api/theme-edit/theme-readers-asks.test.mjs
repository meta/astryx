// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` readers: how plain-words asks are read into the parts,
 * tokens and amounts they name, on themes made like the built-in neutral
 * theme. Each block below covers one kind of ask and makes its own themes;
 * all of them share one project fixture and the read-only theme `q0`.
 *
 * @position api/theme-edit — tests
 */

import fs from 'node:fs';
import path from 'node:path';
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
  cwd = makeLinkedFixture('astryx-theme-readers-asks-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('q0', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

// How's general readers: a bound is a limit on the asks of its kind said with
// it (a part-less one holds the parts those asks name; one inside another ask
// leaves that ask whole; a size bound holds each size the step writes); a color
// bound holds a step by its own ink and a dial seed by the modes still within
// it; a ratio's ground may name its variant or a background token; a typed
// amount, opacity or see-through fill is read as written; status, focus ring
// and line thickness questions are answered from what the theme reads; typed
// tokens move the way asked; the page's dials are the whole theme's; a word
// before "border" or "text" naming a token is that token; a shape named as the
// thing given a color is that thing; motion words are never an unknown part.
// Every line offered is run.
describe('general readers bound limit', () => {
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
      const muted = await how(
        t,
        'make the secondary text 4.5:1 on muted cards',
      );
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
});

// How's readers: a text part colored like a filled part takes its fill, and a
// possessive paint ("the error inputs' border") is that paint; a word for a
// look with no fill names the variant drawn with none; a role the part lacks
// names WHICH parts so set refuses it by name; see-through by a share on a part
// and fainter text theme-wide; the focus ring of one variant stays on that
// variant; two excepts joined by "and" keep each one. Every line offered is
// run.
describe('readers text part colored', () => {
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

  /** @param {string} name */
  const fresh = async name => {
    await themeEditNew(name, {cwd, like: 'neutral'});
    return name;
  };

  describe('a text part like a filled part', () => {
    it('takes the fill it shows; a possessive paint is that paint', async () => {
      const t = await fresh('a1x1');
      const head = writes(
        await how(t, 'make the headings the color of the danger buttons'),
      );
      expect(head).toEqual([
        `set ${t} color 'var(--color-error-muted)' --on heading`,
      ]);
      await follow(head);
      const link = writes(
        await how(t, 'make the links the same color as the danger buttons'),
      );
      expect(link).toEqual([
        `set ${t} --color-text-accent 'var(--color-error-muted)'`,
      ]);
      await follow(link);
      const div = writes(
        await how(t, "make the dividers the color of the error inputs' border"),
      );
      // (The divider draws its line in either of its two line colors.)
      expect(div).toEqual([
        `set ${t} --color-border 'var(--color-border-error)' --on divider`,
        `set ${t} --color-border-emphasized 'var(--color-border-error)' --on divider`,
      ]);
      await follow(div);
    }, 240_000);
  });

  describe('words that name which parts', () => {
    it('the transparent buttons are the ones drawn with no fill', async () => {
      const t = await fresh('b1x1');
      const lines = writes(await how(t, 'make the transparent buttons red'));
      expect(lines).toEqual([
        `set ${t} background-color '#dc2626' --on button --when variant:ghost`,
      ]);
      await follow(lines);
      expect(writes(await how(t, 'make the transparent cards red'))).toEqual([
        `set ${t} background-color '#dc2626' --on card --when variant:transparent`,
      ]);
    }, 240_000);

    it('a role the part lacks is refused by name, never every one', async () => {
      for (const q of [
        'make the success toasts green',
        "make the selector's primary variant red",
      ]) {
        const rs = await how('q0', q);
        expect(writes(rs), q).toEqual([]);
        expect(rs.map(r => r.text).join(' '), q).toMatch(
          /has no (?:(?:type|variant) "(?:success|primary)"|primary part)/,
        );
      }
    }, 240_000);
  });

  describe('amounts', () => {
    it('see-through by a share on a part; fainter text theme-wide', async () => {
      const t = await fresh('c1x1');
      for (const q of [
        'make the cards transparent by a quarter',
        'make the cards a quarter more transparent',
      ])
        expect(writes(await how(t, q)), q).toEqual([
          `set ${t} opacity 0.75 --on card`,
        ]);
      const text = await how(t, 'make the text a third fainter');
      expect(text[0].text).toContain('33% lower (× 0.67)');
      await follow(writes(text));
    }, 240_000);
  });

  describe('focus ring of a variant', () => {
    it('every line stays on that variant', async () => {
      const lines = writes(
        await how('q0', 'make the focus ring of the primary buttons blue'),
      );
      expect(lines.length).toBeGreaterThan(0);
      for (const l of lines) expect(l).toContain('--when variant:primary');
    }, 240_000);
  });

  describe('two excepts joined by and', () => {
    it('keep each one', async () => {
      const t = await fresh('e1');
      const rs = await how(
        t,
        'make the inputs red except the disabled ones and the error ones',
      );
      const lines = writes(rs);
      expect(lines).toContain(
        `set ${t} background-color 'var(--color-background-surface)' --on text-input --when status:error --only`,
      );
      expect(
        lines.some(
          l => /--state disabled/.test(l) && !/--when status:error/.test(l),
        ),
      ).toBe(true);
      expect(
        lines.some(l => /--when status:error --state disabled/.test(l)),
      ).toBe(false);
      await follow(lines);
    }, 240_000);
  });
});

// How's readers: a typed share on a part's fainter text; an exact amount on a
// height scales the control heights the part reads; a state word is read by the
// one table of words for states (expanded, a toggle's pressed); height
// questions are answered; a way word goes with the thing named ("corners twice
// as tight"); an exact border width keeps the borderless looks; typed tokens
// each with a way; a mode named in a phrase or a label is read by the one mode
// reader. Every line offered is run.
describe('readers share part fainter', () => {
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

  /** @param {string} name */
  const fresh = async name => {
    await themeEditNew(name, {cwd, like: 'neutral'});
    return name;
  };

  describe('amounts as typed', () => {
    it("a part's text 30% fainter is 30% lower alpha", async () => {
      const t = await fresh('a1x2');
      const rs = await how(t, 'make the card text 30% fainter');
      expect(rs[0].text).toContain('30% lower (× 0.7)');
      expect(writes(rs)[0]).toBe(
        `set ${t} --color-text-primary '#000000b3' --on card --mode light`,
      );
      await follow(writes(rs));
    }, 240_000);

    it('twice as short, half as tall, twice as tall scale the control heights', async () => {
      const t = await fresh('a2');
      const short = writes(await how(t, 'make the buttons twice as short'));
      expect(short).toEqual([
        `set ${t} --size-element-md 16px --on button`,
        `set ${t} --size-element-sm 14px --on button`,
      ]);
      expect(writes(await how(t, 'make the buttons half as tall'))).toEqual(
        short,
      );
      const tall = writes(await how(t, 'make the buttons twice as tall'));
      expect(tall[0]).toBe(`set ${t} --size-element-md 64px --on button`);
      await follow(short);
    }, 240_000);

    it('an exact border width keeps the borderless looks, as thinner does', async () => {
      const t = await fresh('a3');
      const half = writes(await how(t, 'make the input border half as thick'));
      const thinner = writes(await how(t, 'make the input border thinner'));
      expect(half).toEqual(thinner);
      expect(half[0]).toBe(`set ${t} border-width 0.5px --on inputs`);
      await follow(half);
    }, 240_000);

    it('corners twice as tight: the corners only, with no line about room', async () => {
      const t = await fresh('a4');
      const rs = await how(t, 'make the button corners twice as tight');
      expect(rs.map(r => r.text).join('\n')).not.toMatch(/nothing is written/);
      // (Half the radius it has now.)
      expect(writes(rs)).toEqual([
        `set ${t} border-radius 0.313rem --on button`,
      ]);
      await follow(writes(rs));
    }, 240_000);
  });

  describe('states by the one table of words for them', () => {
    it("expanded is the part's expanded state; pressed is a toggle's isPressed", async () => {
      const t = await fresh('s1');
      const exp = writes(await how(t, 'button text bold when expanded'));
      expect(exp).toEqual([
        `set ${t} font-weight 700 --on button --state expanded`,
      ]);
      await follow(exp);
      const pressed = writes(
        await how(t, 'make the toggle button background red when pressed'),
      );
      expect(pressed).toEqual([
        `set ${t} background-color '#dc2626' --on toggle-button --state isPressed`,
      ]);
      // (A button's press is still its active state.)
      const press = writes(await how(t, 'make buttons darker when pressed'));
      expect(press.every(l => / --state active\b/.test(l))).toBe(true);
    }, 240_000);
  });

  describe('questions and words', () => {
    it('height questions are answered from the heights the part reads', async () => {
      for (const q of [
        'what is the height of buttons?',
        'how tall are the buttons?',
      ]) {
        const rs = await how('q0', q);
        expect(rs[0].text, q).toMatch(
          /^button has height 32px \(--size-element-md\)/,
        );
        expect(writes(rs)).toEqual([]);
      }
    }, 240_000);

    it("a mode named in a phrase or the editor's own label, typos that keep the letters too", async () => {
      for (const [q, mode] of [
        ['make the button background red in drak mode', 'dark'],
        ['make the button background red in ligth mode', 'light'],
        ['button background red (drak)', 'dark'],
        ['button background red [dark only]', 'dark'],
      ]) {
        expect(writes(await how('q0', q)), q).toEqual([
          `set q0 background-color '#dc2626' --on button --mode ${mode}`,
        ]);
      }
    }, 240_000);

    it('typed tokens, each with its own way', async () => {
      const t = await fresh('w1x1');
      const lines = writes(
        await how(t, 'make --color-accent darker and --color-error darker'),
      );
      expect(new Set(lines.map(l => l.split(' ')[2]))).toEqual(
        new Set(['--color-accent', '--color-error']),
      );
      await follow(lines);
    }, 240_000);
  });
});

// How's readers, testers: a one-line look request is a list of asks through the
// readers (the theme's mode, a named color for the accent or the page, density,
// contrast, fonts), each its line, with the words no setting reads named;
// design color names ("terracotta", "sage", "blue-gray") resolve through the
// color table; a light page is the light page; a complaint says how a part
// looks now; "calmer" is less saturated; a status's fill on one part also
// offers its dial; "almost square" is the small corners; a shadow's size word
// picks its size. Every line offered is run.
describe('readers look request list', () => {
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

  /** @param {string} name */
  const fresh = async name => {
    await themeEditNew(name, {cwd, like: 'neutral'});
    return name;
  };

  /** The one-step answer's commands, "all of it" when several. @param {Array<{text: string, commands: string[]}>} rs */
  const top = rs => (rs[0]?.commands ?? []).filter(c => /^(set|undo) /.test(c));

  describe('a one-line look request', () => {
    it('a calm, Linear-like dark theme with a violet accent', async () => {
      const t = await fresh('b1x2');
      const rs = await how(
        t,
        'Give our project-management app a calm, Linear-like dark theme with a violet accent.',
      );
      const lines = top(rs);
      expect(lines).toContain(`set ${t} mode dark-only`);
      expect(lines).toContain(`set ${t} accent '#7c3aed'`);
      expect(lines.join(' ')).not.toMatch(/--mode dark/);
      expect(rs.map(r => r.text).join(' ')).toMatch(
        /not taken: [^:]*"calm", "linear-like"/,
      );
      await follow(lines);
    }, 240_000);

    it('cream background, terracotta accent, serif headings', async () => {
      const t = await fresh('b2x1');
      const rs = await how(
        t,
        'Make a warm, friendly theme for our recipe site: cream background, terracotta accent, serif headings.',
      );
      const lines = top(rs);
      expect(lines).toContain(
        `set ${t} --color-background-body '#fef3c7' --mode light`,
      );
      expect(lines).toContain(`set ${t} accent '#c2603d'`);
      expect(lines).toContain(`set ${t} font serif --on heading`);
      await follow(lines);
    }, 240_000);

    it('high-contrast compact enterprise theme in navy and white', async () => {
      const lines = top(
        await how(
          'q0',
          'high-contrast compact enterprise theme in navy and white',
        ),
      );
      expect(lines).toContain('set q0 spacing less');
      expect(lines).toContain(`set q0 accent '#1e3a8a'`);
      expect(lines.some(l => /--color-text-secondary/.test(l))).toBe(true);
      expect((await how('q0', 'navy'))[0].commands[0]).toBe(
        `set q0 accent '#1e3a8a'`,
      );
    }, 240_000);

    it('a list of colors for a part stays one ask', async () => {
      const lines = writes(
        await how('q0', 'make the buttons red, green and blue'),
      );
      expect(lines.join(' ')).not.toMatch(/\baccent\b/);
    }, 240_000);
  });

  describe('colors and complaints', () => {
    it('a blue-gray is a gray with blue in it', async () => {
      const lines = writes(await how('q0', 'make the neutral a blue-gray'));
      expect(lines[0]).toMatch(/^set q0 neutral '#[0-9a-f]{6}'$/);
      expect(lines[0]).not.toContain('#2563eb');
    }, 240_000);

    it('the error toast is too bright red; make it calmer', async () => {
      const t = await fresh('c1x2');
      const lines = top(
        await how(t, 'the error toast is too bright red; make it calmer'),
      );
      expect(lines.length).toBeGreaterThan(0);
      for (const l of lines) expect(l).toMatch(/--on toast --when type:error/);
      expect(lines.join(' ')).not.toContain('#dc2626');
      await follow(lines);
    }, 240_000);

    it('the main content area is white; make it cream', async () => {
      expect(
        writes(
          await how(
            'q0',
            'the main content area is white; make it cream too in light mode',
          ),
        ),
      ).toEqual([
        `set q0 background-color '#fef3c7' --on layout-content --mode light`,
      ]);
    }, 240_000);

    it('a status fill on one part offers its dial too', async () => {
      const rs = await how('q0', 'make the info banner navy');
      expect(rs[0].commands.filter(c => /^set /.test(c))).toEqual([
        `set q0 background-color '#1e3a8a' --on banner --when status:info`,
        `set q0 info '#1e3a8a'`,
      ]);
    }, 240_000);
  });

  describe('dials', () => {
    it('sharper corners, almost square: the small corners', async () => {
      expect(writes(await how('q0', 'sharper corners, almost square'))).toEqual(
        ['set q0 corners small'],
      );
    }, 240_000);

    it('a small or big shadow picks that size', async () => {
      expect(writes(await how('q0', 'give the cards a small shadow'))).toEqual([
        `set q0 box-shadow 'var(--shadow-low)' --on card`,
      ]);
      expect(writes(await how('q0', 'give the cards a big shadow'))).toEqual([
        `set q0 box-shadow 'var(--shadow-high)' --on card`,
      ]);
    }, 240_000);
  });

  describe('wild', () => {
    it('a role named with its value is that role: the accent text', async () => {
      const lines = writes(await how('q0', 'make the accent text #0033aa'));
      expect(lines[0]).toMatch(/^set q0 --color-text-accent '#0033aa'/);
    }, 240_000);

    it('a rounded font is a font, never corners', async () => {
      expect(writes(await how('q0', 'rounded font'))).toEqual([
        'set q0 font rounded',
      ]);
      const both = top(
        await how('q0', 'very round pill buttons and a rounded font'),
      );
      expect(both).toEqual([
        'set q0 corners pill --on button',
        'set q0 font rounded',
      ]);
    }, 240_000);

    it('a typed hex wins over off-white', async () => {
      const lines = writes(
        await how('q0', 'warm off-white page #f6f0e4 in light mode'),
      );
      expect(lines.join(' ')).not.toMatch(/#fafafa|neutral/);
      expect(lines[0]).toBe(
        `set q0 --color-background-body '#f6f0e4' --mode light`,
      );
    }, 240_000);

    it("the theme's mode in everyday words; right to left needs no change", async () => {
      expect(writes(await how('q0', 'light only'))).toEqual([
        'set q0 mode light-only',
      ]);
      expect(writes(await how('q0', 'no dark mode'))).toEqual([
        'set q0 mode light-only',
      ]);
      const rtl = await how('q0', 'right-to-left app for Arabic');
      expect(writes(rtl)).toEqual([]);
      expect(rtl.map(r => r.text).join(' ')).toMatch(/dir="rtl"/);
    }, 240_000);
  });
});

// How's readers: a clause after "and" whose subject is no part takes none from
// the clause before; a part named as the color reference gives the color it
// shows (a link's text, a card's border); a color given to a token that is that
// color already is left; a page's text in a part is the part's own, by role; a
// row line's color with its width says why the width stays; a color bound how
// cannot measure is said, never a removal; a value set on the part is what it
// has now. Every line offered is run.
describe('readers clause subject part', () => {
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

  /** @param {string} name */
  const fresh = async name => {
    await themeEditNew(name, {cwd, like: 'neutral'});
    return name;
  };

  describe('readers', () => {
    it('an unknown subject after "and" takes no part from the clause before', async () => {
      const rs = await how('q0', 'make the cards rounder and the gizmo red');
      expect(writes(rs)).toEqual(['set q0 corners more --on card']);
      expect(rs.map(r => r.text).join('\n')).toContain(
        'no part is called "gizmo"',
      );
    }, 240_000);

    it('a part named as the color gives the color it shows', async () => {
      const t = await fresh('r1');
      const links = writes(
        await how(t, 'make the buttons the same color as the links'),
      );
      expect(links).toEqual([
        `set ${t} background-color 'var(--color-text-accent)' --on button`,
      ]);
      await follow(links);
      const div = writes(
        await how(t, 'make the dividers the card border color'),
      );
      expect(div).toEqual([
        `set ${t} --color-border-emphasized 'var(--color-border)' --on divider`,
      ]);
      await follow(div);
    }, 240_000);

    it("the muted text in cards fainter: the cards' secondary text only", async () => {
      const t = await fresh('r2');
      for (const q of [
        'make the muted text in cards fainter',
        'make the secondary text on cards fainter',
      ]) {
        const lines = writes(await how(t, q));
        expect(lines.length, q).toBeGreaterThan(0);
        for (const l of lines)
          expect(l).toMatch(
            /^set r2 --color-text-secondary '#[0-9a-f]{8}' --on card --mode (light|dark)$/,
          );
      }
      await follow(
        writes(await how(t, 'make the muted text in cards fainter')),
      );
    }, 240_000);

    it('row dividers thicker and blue: the color, and why the width stays', async () => {
      const t = await fresh('r3');
      const rs = await how(t, 'make the table row dividers thicker and blue');
      expect(writes(rs)).toEqual([
        `set ${t} --color-border '#2563eb' --on table-row`,
      ]);
      expect(rs[0].text).toMatch(/their width is left as it is/);
      await follow(writes(rs));
    }, 240_000);

    it('a color bound how cannot measure is said, never a removal', async () => {
      const t = await fresh('r4');
      const rs = await how(
        t,
        'make the cards red but never redder than #ff0000',
      );
      expect(writes(rs)).toEqual([
        `set ${t} background-color '#dc2626' --on card`,
      ]);
      expect(rs[0].text).toContain('"never redder than #ff0000" is not held');
      await follow(writes(rs));
    }, 240_000);

    it('a value set on the part is what it has now', async () => {
      const t = await fresh('r5');
      await themeEditSet(t, 'border-radius', '20px', {cwd, on: 'card'});
      const rs = await how(t, 'how round are the cards now?');
      expect(rs[0].text).toMatch(
        /^card has border-radius 20px \(set on card\) now/,
      );
      expect(writes(rs)).toEqual([]);
    }, 240_000);
  });
});

// How's readers, mediums and: what a color is read on is the ground ("darker so
// it reads on the page", stepped to 3:1); a page's color paints the main panel
// drawn over it in its second line; a length beside a text look is the text's
// size; a ring said of the focused state is the focus ring on those parts; only
// one side's border, and that side's color alone; every text color measured for
// "all text 7:1"; "large text", "grayscale"; a fill typed on a part takes a
// text color its label reads on; one-line looks: a deep shade, a quiet color
// the neutral, "works in dark mode" scoping nothing, the mode the app opens in;
// a purpose clause names no part; "a bit lighter" headings one rung; a color
// before the part says how it looks now. Every line offered is run.
describe('readers mediums color ground', () => {
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

  /** @param {string} name */
  const fresh = async name => {
    await themeEditNew(name, {cwd, like: 'neutral'});
    return name;
  };

  /** The one-step answer's commands. @param {Array<{text: string, commands: string[]}>} rs */
  const top = rs => (rs[0]?.commands ?? []).filter(c => /^(set|undo) /.test(c));

  describe('grounds and pages', () => {
    it('the warning color darker so it reads on the page', async () => {
      const lines = top(
        await how(
          'q0',
          'make the warning color darker so it reads on the page',
        ),
      );
      expect(lines[0]).toMatch(/^set q0 warning '#[0-9a-f]{6}'$/);
    }, 240_000);

    it('the page in dark mode also offers the main panel drawn over it', async () => {
      const rs = await how('q0', 'page background #0b1020 in dark mode');
      expect(rs[0].commands.filter(c => /^set /.test(c))).toEqual([
        `set q0 --color-background-body '#0b1020' --mode dark`,
        `set q0 background-color '#0b1020' --on app-shell --mode dark`,
        `set q0 background-color '#0b1020' --on layout-content --mode dark`,
      ]);
    }, 240_000);
  });

  describe('text, rings and borders', () => {
    it('table header text uppercase 12px keeps the size', async () => {
      const t = await fresh('t1');
      const lines = top(await how(t, 'table header text uppercase 12px'));
      expect(lines).toEqual([
        `set ${t} text-transform uppercase --on table-header-cell`,
        `set ${t} font-size 12px --on table-header-cell`,
      ]);
      await follow(lines);
    }, 240_000);

    it('when inputs are focused, a ring: the inputs focus ring', async () => {
      const lines = writes(
        await how('q0', 'when inputs are focused, a 2px #4f46e5 ring'),
      );
      expect(lines[0]).toBe(
        `set q0 box-shadow 'inset 0 0 0 2px #4f46e5' --on inputs --state focus-within`,
      );
      expect(lines.join(' ')).not.toMatch(/--focus-outline-color/);
    }, 240_000);

    it('only a bottom border; a darker bottom edge', async () => {
      const t = await fresh('b1x3');
      const only = top(await how(t, 'inputs should have only a bottom border'));
      expect(only[0]).toBe(`set ${t} border none --on inputs`);
      expect(only[1]).toMatch(/^set \S+ border-bottom '1px solid /);
      await follow(only);
      const edge = writes(await how(t, 'slightly darker bottom edge on cards'));
      expect(edge).toEqual([
        `set ${t} border-bottom-color 'color-mix(in srgb, var(--color-border) 85%, black)' --on card`,
      ]);
      await follow(edge);
    }, 240_000);

    it('all text 7:1 measures every text color', async () => {
      const rs = await how('q0', 'all text at least 7:1 contrast');
      expect(rs[0].text).toContain(
        '--color-text-primary, --color-text-secondary, --color-text-accent',
      );
    }, 240_000);
  });

  describe('dials and labels', () => {
    it('large text, grayscale on a gray theme', async () => {
      expect(writes(await how('q0', 'large text'))).toEqual([
        'set q0 text-size more',
      ]);
      const g = await how('q0', 'grayscale');
      expect(writes(g)).toEqual([]);
      expect(g[0].text).toMatch(/no color to take out/);
    }, 240_000);
  });

  describe('one-line looks and purposes', () => {
    it('a deep green accent and a sand neutral', async () => {
      const lines = top(
        await how(
          'q0',
          'elegant, airy boutique hotel theme: deep green and sand',
        ),
      );
      expect(lines).toContain(`set q0 accent '#166534'`);
      expect(lines).toContain(`set q0 neutral '#d6c6a5'`);
    }, 240_000);

    it('a theme that works in dark mode scopes nothing to dark', async () => {
      const lines = top(
        await how(
          'q0',
          'clean, very readable docs site theme that works in dark mode with a teal brand color',
        ),
      );
      expect(lines).toContain(`set q0 accent '#0d9488'`);
      expect(lines.join(' ')).not.toMatch(/--mode dark/);
    }, 240_000);

    it('the app opens in dark mode: <Theme mode>, or dark-only', async () => {
      const rs = await how('q0', 'the app should open in dark mode by default');
      expect(rs[0].text).toContain('<Theme mode="dark">');
      expect(writes(rs)).toEqual(['set q0 mode dark-only']);
    }, 240_000);

    it('a purpose clause names no part; readable text is larger', async () => {
      const rs = await how(
        'q0',
        'make the selected sidebar item teal so readers see which page they are on',
      );
      expect(rs.map(r => r.text).join(' ')).not.toMatch(
        /page has no selected state/,
      );
      expect(writes(await how('q0', 'make text more readable'))).toEqual([
        'set q0 text-size more',
      ]);
    }, 240_000);

    it('headings a bit lighter is one rung', async () => {
      expect(
        top(
          await how(
            'q0',
            'corners a little less rounded everywhere, and headings a bit lighter',
          ),
        ),
      ).toEqual(['set q0 corners less', 'set q0 headings medium']);
    }, 240_000);

    it('a color before the part says how it looks now', async () => {
      expect(
        writes(await how('q0', 'make the brown dark content area deep green')),
      ).toEqual([`set q0 background-color '#166534' --on layout-content`]);
    }, 240_000);
  });
});

// How's readers: a fainter word before a part's text with a color says which
// text; a bare color after an ask on a part's text is that text's color (with
// "fainter and red", the red at that alpha); a look word before a part
// ("borderless", "text-only") names the variants drawn without that paint; "the
// destructive button the primary button color" reads the primary look; a title
// block's title alone; a share in words of darker or lighter; a shadow's label
// follows its factor; a status word after a possessive is that look. Every line
// offered is run.
describe('readers fainter word part', () => {
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

  /** @param {string} name */
  const fresh = async name => {
    await themeEditNew(name, {cwd, like: 'neutral'});
    return name;
  };

  describe('text', () => {
    it("the card's fainter text red, and fainter and red", async () => {
      const t = await fresh('x1');
      const red = writes(await how(t, "make the card's fainter text red"));
      expect(red).toEqual([
        `set ${t} --color-text-secondary '#dc2626' --on card`,
      ]);
      await follow(red);
      expect(
        writes(await how(t, "make the card's fainter text fainter and red")),
      ).toEqual([`set ${t} --color-text-secondary '#dc262699' --on card`]);
      const big = writes(await how(t, 'make the card text bigger and red'));
      expect(
        big.some(l => /--color-text-primary '#dc2626' --on card/.test(l)),
      ).toBe(true);
    }, 240_000);

    it("a dialog's title alone", async () => {
      expect(writes(await how('q0', 'make the dialog title red'))).toEqual([
        `set q0 --color-text-primary '#dc2626' --on dialog-header-title-block`,
      ]);
    }, 240_000);
  });

  describe('looks', () => {
    it('borderless and text-only buttons are the variants drawn so', async () => {
      const t = await fresh('x7');
      const lines = writes(await how(t, 'make the borderless buttons red'));
      expect(lines.join(' ')).not.toMatch(/border none/);
      for (const l of lines) expect(l).toMatch(/--when variant:/);
      await follow(lines);
      expect(writes(await how(t, 'make the text-only buttons red'))).toEqual([
        `set ${t} color '#dc2626' --on button --when variant:ghost`,
      ]);
    }, 240_000);

    it('the destructive button the primary button color', async () => {
      expect(
        writes(
          await how(
            'q0',
            'make the destructive button the primary button color',
          ),
        ),
      ).toEqual([
        `set q0 background-color 'var(--color-accent)' --on button --when variant:destructive`,
      ]);
    }, 240_000);

    it('a status word after a possessive is that look', async () => {
      // (The success color for the whole theme follows as the second line.)
      expect(
        writes(await how('q0', "make the badge's success background green")),
      ).toEqual([
        `set q0 background-color '#16a34a' --on badge --when variant:success`,
        `set q0 success '#16a34a'`,
      ]);
    }, 240_000);
  });

  describe('amounts', () => {
    it('a third darker is a third of the way; a third as strong is softer', async () => {
      const a = writes(await how('q0', 'make the cards a third darker'));
      const b = writes(await how('q0', 'make the cards darker by a third'));
      expect(a[0]).toMatch(
        /'#aaaaaa' --on card --when variant:default --mode light/,
      );
      expect(b[0]).toBe(a[0]);
      expect(
        (await how('q0', 'make the shadows a third as strong'))[0].text,
      ).toMatch(/^softer shadows/);
    }, 240_000);
  });
});

// The page color's main-panel line: followed after the frame's line (or before
// it), the main panel draws the page color; the see-through rule the frame's
// line writes for the main area never covers a panel color a setting gives.
describe('main panel page color', () => {
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
  // (The readable-text line set's own check adds beside a fill is measured
  // on its own: these asks read the rest.)
  const writes = rs =>
    rs
      .filter(r => !/^readable text on that fill/.test(r.text))
      .flatMap(r => r.commands)
      .filter(c => /^(set|undo) /.test(c));

  /** Run each line as offered. @param {string[]} lines */
  const follow = async lines => {
    for (const line of lines) {
      const args =
        line.match(/'[^']*'|\S+/g)?.map(w => w.replace(/^'|'$/g, '')) ?? [];
      const r = await runCli(['experimental', 'theme', 'editor', ...args], cwd);
      expect(r.status, line).toBe(0);
    }
  };

  /** @param {string} name */
  const fresh = async name => {
    await themeEditNew(name, {cwd, like: 'neutral'});
    return name;
  };

  /** The built rules for the main panel, in order. @param {string} t */
  const panelRules = t =>
    [
      ...fs
        .readFileSync(path.join(cwd, 'themes', t, `${t}.css`), 'utf8')
        .matchAll(/([^{}]*astryx-layout-content[^{]*)\{([^}]*)\}/g),
    ].map(m => ({sel: m[1].trim(), body: m[2]}));

  describe('the main panel', () => {
    it('takes the page color the second line gives it, in either order', async () => {
      const t = await fresh('m1');
      const rs = await how(t, 'page background #0b1020 in dark mode');
      const lines = rs[0].commands.filter(c => /^set /.test(c));
      expect(lines).toContain(
        `set ${t} background-color '#0b1020' --on layout-content --mode dark`,
      );
      await follow(lines);
      const rules = panelRules(t);
      expect(rules.some(r => /#0b1020/.test(r.body))).toBe(true);
      expect(
        rules.some(
          r => /role="main"/.test(r.sel) && /transparent/.test(r.body),
        ),
      ).toBe(false);
      const t2 = await fresh('m2');
      await themeEditSet(t2, 'background-color', '#000000', {
        cwd,
        on: 'layout-content',
        mode: 'dark',
      });
      await themeEditSet(t2, 'background-color', '#000000', {
        cwd,
        on: 'app-shell',
        mode: 'dark',
      });
      expect(
        panelRules(t2).some(
          r => /role="main"/.test(r.sel) && /transparent/.test(r.body),
        ),
      ).toBe(false);
    }, 240_000);

    it('a page color alone still makes the main area see-through', async () => {
      const t = await fresh('m3');
      await themeEditSet(t, 'background-color', '#000000', {
        cwd,
        on: 'app-shell',
        mode: 'dark',
      });
      expect(
        panelRules(t).some(
          r => /role="main"/.test(r.sel) && /transparent/.test(r.body),
        ),
      ).toBe(true);
    }, 240_000);
  });
});

// How's readers, leftovers: "the buttons the color of the links" fills the
// buttons (the reference's words are never the subject's paint); a part's
// fainter or muted text, said with an owner's possessive or a place, is that
// part's secondary text, and a fainter word before the text with another way
// says which text; "the row hovered and selected" is the part in both states at
// once. Every line offered is run.
describe('readers buttons color links', () => {
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

  /** @param {string} name */
  const fresh = async name => {
    await themeEditNew(name, {cwd, like: 'neutral'});
    return name;
  };

  describe('leftovers', () => {
    it('the buttons the color of the links are filled with it', async () => {
      const t = await fresh('l1');
      const lines = writes(
        await how(t, 'make the buttons the color of the links'),
      );
      expect(lines).toEqual([
        `set ${t} background-color 'var(--color-text-accent)' --on button`,
      ]);
      await follow(lines);
    }, 240_000);

    it("a part's fainter or muted text is its secondary text", async () => {
      const t = await fresh('l2');
      for (const q of [
        "make the card's fainter text lighter",
        "make the card's muted text darker",
        'make the muted text in cards 20% lighter',
        "make the card's fainter text 30% lighter",
      ]) {
        const lines = writes(await how(t, q));
        expect(lines.length, q).toBeGreaterThan(0);
        for (const l of lines)
          expect(l, q).toMatch(
            /^set \S+ --color-text-secondary '#[0-9a-f]{6}' --on card --mode (light|dark)$/,
          );
      }
      await follow(
        writes(await how(t, "make the card's fainter text lighter")),
      );
    }, 240_000);

    it('the row hovered and selected is both states at once, never one dropped', async () => {
      const rs = await how('q0', 'make the row hovered and selected red');
      expect(rs[0].text).toMatch(/table-row when selected\+hover/);
      const tab = writes(
        await how('q0', 'make the tab hovered and selected blue'),
      );
      expect(tab).toEqual([
        `set q0 background-color '#2563eb' --on tab --state selected+hover`,
      ]);
    }, 240_000);
  });
});

// How's readers: a value question reads the part the clause reads ("the card
// title" is its heading) and the secondary text token for "secondary text"; a
// reference named in a look that draws none of that paint (the ghost button's
// fill) never gives the plain look's paint; a size named on the other part of a
// comparison is read in that size or said; "N times fainter" is that share; a
// part that draws no corners stays as it is under "everything rounder except".
// Every line offered is run.
describe('readers value question part', () => {
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

  /** @param {string} name */
  const fresh = async name => {
    await themeEditNew(name, {cwd, like: 'neutral'});
    return name;
  };

  describe('value questions', () => {
    it('the card title is its heading; the secondary text its own token', async () => {
      const title = await how('q0', 'what color is the card title?');
      expect(title[0].text).toMatch(/^heading has color #[0-9a-f]{6} now/);
      const sec = await how('q0', "what color is the card's secondary text?");
      expect(sec[0].text).toContain(
        '#474747 in light mode, #9e9e9e in dark mode (--color-text-secondary',
      );
      const theme = await how(
        'q0',
        'what color is the secondary text in dark mode?',
      );
      expect(theme[0].text).toContain(
        '#9e9e9e in dark mode (--color-text-secondary)',
      );
    }, 240_000);
  });

  describe('references and comparisons', () => {
    it('the ghost button draws no fill: never the primary fill', async () => {
      const lines = writes(
        await how('q0', 'make the card the color of the ghost button'),
      );
      expect(lines.join(' ')).not.toContain('--color-accent');
      expect(
        writes(
          await how('q0', 'make the card the color of the primary button'),
        ),
      ).toEqual([`set q0 background-color 'var(--color-accent)' --on card`]);
    }, 240_000);

    it('a size named on the other part is read in that size, or said', async () => {
      const t = await fresh('s1x1');
      const rs = await how(t, 'make the buttons as tall as the small inputs');
      expect(writes(rs)).toEqual([]);
      expect(rs.map(r => r.text).join(' ')).toMatch(
        /inputs in size sm has no height of its own/,
      );
      const lines = writes(
        await how(t, 'make the inputs as tall as the small buttons'),
      );
      expect(lines).toEqual([
        `set ${t} height 'var(--size-element-sm)' --on inputs`,
      ]);
      await follow(lines);
    }, 240_000);
  });

  describe('amounts and keeps', () => {
    it('N times fainter is that share', async () => {
      expect(
        (await how('q0', 'make the card text 2 times fainter'))[0].text,
      ).toContain('50% lower (× 0.5)');
    }, 240_000);

    it('everything rounder except a part that draws no corners', async () => {
      const t = await fresh('k1');
      const rs = await how(t, 'make everything rounder except the headings');
      expect(writes(rs)).toEqual([`set ${t} corners more`]);
      expect(rs[0].text).toContain('heading draws no corners');
      await follow(writes(rs));
    }, 240_000);
  });
});
