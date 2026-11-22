// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The feel dials, press and hover: one wash for the whole theme that
 * every part paints over its own fill in that moment; a part whose moment
 * the theme sets keeps the base wash; and how reads "darker on press" as
 * the dial.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditHow,
  themeEditNew,
  themeEditSet,
  themeEditShow,
} from './theme-edit.mjs';
import {feelWash} from './_settings.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const T = 240_000;

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-feel-dials-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug */
const css = slug =>
  fs
    .readdirSync(path.join(cwd, 'themes', slug))
    .filter(f => f.endsWith('.css'))
    .map(f => fs.readFileSync(path.join(cwd, 'themes', slug, f), 'utf8'))
    .join('\n');

/** @param {string} slug @param {string} q */
const writes = async (slug, q) =>
  /** @type {any} */ ((await themeEditHow(q, {cwd, theme: slug})).data).results
    .flatMap((/** @type {any} */ r) => r.commands)
    .filter((/** @type {string} */ c) => / editor set /.test(c))
    .map((/** @type {string} */ c) => c.replace(/^.* editor /, ''));

describe('the press and hover dials', () => {
  it(
    'set one wash for every part, in each mode',
    async () => {
      await themeEditNew('fd', {cwd, like: 'neutral'});
      await themeEditSet('fd', 'press', 'darker', {cwd});
      await themeEditSet('fd', 'hover', '8%', {cwd});
      const out = css('fd');
      expect(out).toMatch(/--color-overlay-pressed:\s*rgb\(0 0 0 \/ 12%\)/);
      // (A percent is the base wash's own color in each mode at that
      // strength.)
      expect(out).toMatch(
        /--color-overlay-hover:\s*light-dark\(rgb\([\d ]+\/ 8%\), rgb\([\d ]+\/ 8%\)\)/,
      );
    },
    T,
  );

  it('give darker, lighter, stronger and a percent their washes', () => {
    const base = {light: {}, dark: {}};
    const tokens = {
      '--color-overlay-pressed': 'rgb(0 0 0 / 10%)',
      '--color-overlay-hover': 'rgb(0 0 0 / 5%)',
    };
    expect(feelWash('press', 'darker', base, tokens)[0]).toBe(
      'rgb(0 0 0 / 12%)',
    );
    expect(feelWash('press', 'lighter', base, tokens)[1]).toBe(
      'rgb(255 255 255 / 16%)',
    );
    expect(feelWash('hover', 'stronger', base, tokens)[0]).toMatch(
      /currentColor 12%/,
    );
    expect(feelWash('press', '20%', base, tokens)[0]).toBe('rgb(0 0 0 / 20%)');
  });

  it(
    'keep the base wash on a part whose moment the theme sets',
    async () => {
      await themeEditNew('fk', {cwd, like: 'neutral'});
      await themeEditSet('fk', 'press', 'lighter', {cwd});
      await themeEditSet('fk', 'background-color', '#cc0000', {
        cwd,
        on: 'button',
        state: 'pressed',
      });
      const out = css('fk');
      expect(out).toMatch(
        /--color-overlay-pressed:\s*rgb\(255 255 255 \/ 16%\)/,
      );
      expect(out).toMatch(
        /\.astryx-button[^{]*\{[^}]*--color-overlay-pressed:\s*light-dark\(/,
      );
    },
    T,
  );

  it(
    "keep the theme's wash on looks Core paints with it at rest, and on one mode's own pressed fill",
    async () => {
      await themeEditNew('fw', {cwd, like: 'neutral'});
      await themeEditSet('fw', 'hover', 'lighter', {cwd});
      await themeEditSet('fw', 'background-color', '#cc0000', {
        cwd,
        on: 'button',
        state: 'pressed',
        mode: 'dark',
      });
      await themeEditSet('fw', 'press', 'lighter', {cwd});
      const out = css('fw');
      // (An open menu's trigger and a toggle that is on keep their fill; a
      // highlighted option follows the pointer, so it takes the dial.)
      for (const part of ['item', 'typeahead-option', 'command-palette-item'])
        expect(out, part).not.toMatch(
          new RegExp(
            `\\.astryx-${part}\\[data-highlighted="highlighted"\\]\\s*\\{[^}]*--color-overlay-hover:`,
          ),
        );
      expect(out).toMatch(
        /\.astryx-top-nav-menu:is\(\[aria-expanded="true"\]\)\s*\{[^}]*--color-overlay-hover:\s*light-dark\(/,
      );
      expect(out).toMatch(
        /\.astryx-toggle-button\[data-is-pressed="true"\]\s*\{[^}]*--color-overlay-pressed:\s*light-dark\(/,
      );
      // (A pressed fill set for dark mode keeps the dark wash only.)
      const dark = out.match(
        /\[aria-pressed="true"\]\)\s*\{[^}]*--color-overlay-pressed:\s*([^;]+);/,
      );
      expect(dark?.[1]).not.toMatch(/light-dark/);
    },
    T,
  );

  it(
    "reach a switch's press, and keep a part's own wash only in the mode it saves",
    async () => {
      await themeEditNew('fs', {cwd, like: 'neutral'});
      await themeEditSet('fs', '--color-overlay-pressed', '#11111133', {
        cwd,
        on: 'toggle-button',
        mode: 'dark',
      });
      await themeEditSet('fs', 'press', 'darker', {cwd});
      const out = css('fs');
      // (A switch's press is its press: it follows the dial.)
      expect(out).not.toMatch(
        /\.astryx-switch\s*\{[^}]*--color-overlay-pressed:/,
      );
      // (A toggle that is on keeps the theme's wash in light mode, where the
      // part saves none of its own.)
      const kept = [
        ...out.matchAll(
          /\.astryx-toggle-button\[data-is-pressed="true"\][^{]*\{[^}]*--color-overlay-pressed:\s*([^;}]+)/g,
        ),
      ].map(x => x[1].trim());
      expect(kept.length).toBeGreaterThan(0);
      // (Only the light half: the dark one is the part's own wash.)
      for (const v of kept) expect(v).not.toMatch(/light-dark\(/);
      expect(out).toContain('#11111133');
    },
    T,
  );

  it(
    'keep an exact wash the theme saves, where they keep a wash',
    async () => {
      await themeEditNew('fx', {cwd, like: 'neutral'});
      await themeEditSet('fx', '--color-overlay-pressed', '#22222233', {cwd});
      await themeEditSet('fx', 'press', 'lighter', {cwd});
      expect(css('fx')).toMatch(
        /\.astryx-toggle-button\[data-is-pressed="true"\]\s*\{[^}]*--color-overlay-pressed:\s*light-dark\(#22222233, #22222233\)/i,
      );
    },
    T,
  );

  it(
    "write nothing for a wash the theme's own source sets",
    async () => {
      await themeEditNew('fo', {cwd, like: 'neutral'});
      const src = path.join(cwd, 'themes/fo/fo.theme.ts');
      fs.writeFileSync(
        src,
        fs
          .readFileSync(src, 'utf8')
          .replace(
            /defineTheme\(\{/,
            "defineTheme({tokens: {'--color-overlay-pressed': 'light-dark(#33333333, #cccccc33)'}, ",
          ),
      );
      const r = await themeEditSet('fo', 'press', 'lighter', {cwd});
      // (The result says the file's wash stays, never that it already shows.)
      const notes = JSON.stringify(r.data.notes ?? r.data);
      expect(notes).toContain(
        'fo.theme.ts sets --color-overlay-pressed itself',
      );
      expect(notes).not.toContain('this changes nothing you see');
      // (how and show name the file too.)
      const asked = JSON.stringify(
        await themeEditHow('darker on press', {cwd, theme: 'fo'}),
      );
      expect(asked).toContain('fo.theme.ts sets the press wash itself');
      expect(asked).not.toContain('already darker');
      // (A joined ask leaves the press out with its reason and keeps the
      // rest, the hover the file does not set included.)
      const joined = await writes(
        'fo',
        'rounder corners and roomy spacing. lighter on hover. darker on press',
      );
      expect(joined.some(c => /^set fo hover lighter/.test(c))).toBe(true);
      expect(joined.some(c => /^set fo press /.test(c))).toBe(false);
      expect(joined.some(c => /^set fo corners /.test(c))).toBe(true);
      const shown = JSON.stringify(await themeEditShow('fo', {cwd}));
      expect(shown).toContain('--color-overlay-pressed');
      expect(shown).toContain('fo.theme.ts');
      const out = css('fo');
      expect(out).not.toMatch(
        /--color-overlay-pressed:\s*rgb\(255 255 255 \/ 16%\)/,
      );
      expect(out).not.toMatch(
        /\.astryx-toggle-button\[data-is-pressed="true"\]\s*\{[^}]*--color-overlay-pressed:/,
      );
    },
    T,
  );

  it(
    'leave a feel unread in how on a theme that saves an exact wash, as before the dials',
    async () => {
      await themeEditNew('fe', {cwd, like: 'neutral'});
      await themeEditSet('fe', '--color-overlay-pressed', '#22222233', {cwd});
      expect(await writes('fe', 'lighter on press')).toEqual([]);
      await themeEditNew('fm', {cwd, like: 'neutral'});
      await themeEditSet('fm', '--color-overlay-pressed', '#ff000033', {
        cwd,
        mode: 'dark',
      });
      expect(await writes('fm', 'darker on press')).toEqual([]);
      // (The other dial still reads.)
      expect(await writes('fm', 'darker on hover')).toEqual([
        'set fm hover darker',
      ]);
    },
    T,
  );

  it(
    'refuse a scope and a value they do not take',
    async () => {
      await themeEditNew('fr', {cwd, like: 'neutral'});
      await expect(
        themeEditSet('fr', 'press', 'darker', {cwd, on: 'button'}),
      ).rejects.toThrow(/drop the scope/);
      for (const scope of [
        {mode: 'dark'},
        {state: 'active'},
        {when: 'variant:primary'},
      ])
        await expect(
          themeEditSet('fr', 'hover', 'darker', {cwd, on: 'button', ...scope}),
          JSON.stringify(scope),
        ).rejects.toThrow(/drop the scope/);
      await expect(themeEditSet('fr', 'hover', 'darkr', {cwd})).rejects.toThrow(
        /hover takes darker, lighter, stronger or a percent/,
      );
      // (A press and a hover always keep a look: none is no value either
      // takes.)
      for (const dial of ['press', 'hover'])
        for (const v of ['80%', '0.5%', 'none'])
          await expect(
            themeEditSet('fr', dial, v, {cwd}),
            `${dial} ${v}`,
          ).rejects.toThrow(
            new RegExp(`${dial} takes darker, lighter, stronger or a percent`),
          );
      // (A mode alone is a scope too; it names the wash for that mode.)
      await expect(
        themeEditSet('fr', 'hover', 'darker', {cwd, mode: 'dark'}),
      ).rejects.toThrow(
        /for dark mode only, set the wash itself: .* --color-overlay-hover 'rgb\(0 0 0 \/ 6%\)' --mode dark/,
      );
      // (A percent for one mode names the token, never a line for both.)
      await expect(
        themeEditSet('fr', 'press', '15%', {cwd, mode: 'dark'}),
      ).rejects.toThrow(
        /set --color-overlay-pressed --mode dark to the wash you want/,
      );
    },
    T,
  );
});

describe('how', () => {
  it(
    'reads a feel said with its moment as the dial',
    async () => {
      await themeEditNew('fh', {cwd, like: 'neutral'});
      expect(await writes('fh', 'darker on press')).toEqual([
        'set fh press darker',
      ]);
      // (One mode takes the wash itself, for that mode.)
      expect(await writes('fh', 'darker on hover in light mode only')).toEqual([
        "set fh --color-overlay-hover 'rgb(0 0 0 / 6%)' --mode light",
      ]);
      expect(await writes('fh', 'lighter on hover')).toEqual([
        'set fh hover lighter',
      ]);
      expect(await writes('fh', '8% tint on hover')).toEqual([
        "set fh hover '8%'",
      ]);
      expect(await writes('fh', 'darker on click')).toEqual([
        'set fh press darker',
      ]);
      // (A look other than the fill, said with its moment, is that look's;
      // a musing or a "no" writes nothing.)
      for (const q of [
        'borders darker on hover',
        'the text lighter on press',
        'maybe darker on press',
        'no darker on press',
      ])
        expect(
          (await writes('fh', q)).some(c => / (?:press|hover) /.test(c)),
          q,
        ).toBe(false);
      // (A design system's feel line, its press half the dial.)
      expect(
        await writes('fh', 'Feel: light gray fill on hover, darker on press.'),
      ).toContain('set fh press darker');
      // (A "should" ask of a part's look reads as on main; only the dial's
      // own feel reading is held back by thinking-aloud wording.)
      expect(
        (await writes('fh', 'the cards should be blue')).some(c =>
          /background-color '#2563eb' --on card/.test(c),
        ),
      ).toBe(true);
      expect(
        (await writes('fh', 'buttons should be darker on press')).some(c =>
          /--on button .*--state active/.test(c),
        ),
      ).toBe(true);
      // (An ask that wonders anywhere keeps main's answer for the rest:
      // the feel is left unread, never the whole ask.)
      for (const [q, want] of [
        ['Could the corners be rounder? Darker on press.', /^set fh corners /],
        ['Rounder corners? Lighter on hover.', /^set fh corners /],
      ]) {
        const w = await writes('fh', q);
        expect(
          w.some(c => want.test(c)),
          q,
        ).toBe(true);
        expect(
          w.some(c => /^set fh (?:press|hover) /.test(c)),
          q,
        ).toBe(false);
      }
      for (const q of [
        'Darker on press. It could feel more tactile.',
        'Darker on press. Would that work?',
      ])
        expect(
          (await writes('fh', q)).some(c => /^set fh press /.test(c)),
          q,
        ).toBe(false);
      // (A feel said as what is not wanted writes nothing, as before.)
      for (const q of [
        'never darker on press',
        'avoid darker on press',
        'without darker on press',
        'I do not want it darker on press',
        'never lighter on hover',
        'what if it were darker on press',
        'the old theme was darker on hover',
        'I wonder if it should be darker on press',
      ])
        expect(await writes('fh', q), q).toEqual([]);
    },
    T,
  );
});
