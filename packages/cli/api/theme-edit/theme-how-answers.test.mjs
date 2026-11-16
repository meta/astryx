// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how` answers to asks in plain words, read on fresh themes
 * made like the built-in neutral (`n`) and stone (`s`) themes. Each block
 * below covers one kind of ask; all of them share one project fixture,
 * because an answer writes nothing.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

/** @type {string} */
let cwd;
/** Why a bundled base could not be installed here, when one could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-how-answers-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral', 'stone']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
  await themeEditNew('s', {cwd, like: 'stone'});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

// `editor how`: a border color reaches every variant of a selector, the status
// and focus colors kept; one size named moves only the control height that size
// reads; a possessive owner's own element ("the dropdown menu's items") is that
// element; a later "the shadows softer" is the theme's shadows.
describe('border color reaches variant', () => {
  /** @param {string} q */
  const answer = async q => {
    const {data} = await themeEditHow(q, {cwd, theme: 'n'});
    const results = data.results ?? [];
    const sets = (/** @type {string[]} */ cs) =>
      cs
        .filter(c => / editor set /.test(c))
        .map(c => c.replace(/^.* editor set \S+ /, ''));
    return {
      first: sets(
        results.find(r => r.commands.some(c => / editor set /.test(c)))
          ?.commands ?? [],
      ),
      all: sets(results.flatMap(r => r.commands)),
    };
  };

  /** @param {import('vitest').TestContext} test */
  const needsBases = test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
  };

  const T = 300_000;

  describe('how border color reaches variant', () => {
    it.each([
      ['make the selector border blue', 'selector'],
      ['make the input border red', 'inputs'],
    ])(
      '%s: no variant pinned back, status and focus kept',
      async (q, on, test) => {
        needsBases(test);
        const r = await answer(q);
        expect(r.first[0]).toMatch(
          new RegExp(`^border-color '#[0-9a-f]{6}' --on ${on}\\b`),
        );
        for (const c of r.first.slice(1).filter(x => /^border-color /.test(x)))
          expect(c).not.toMatch(/--when variant:/);
      },
      T,
    );
    it(
      'one size named moves only that control height',
      async test => {
        needsBases(test);
        expect(
          (await answer('make the small buttons 4px taller')).first,
        ).toEqual(['--size-element-sm 32px --on button']);
      },
      T,
    );
    it(
      "a possessive owner's own element is that element",
      async test => {
        needsBases(test);
        expect(
          (await answer("make the dropdown menu's items red")).first,
        ).toEqual(["background-color '#dc2626' --on dropdown-menu-item"]);
        const text = await answer("make the dropdown menu's item text bigger");
        expect(text.first[0]).toMatch(/--on dropdown-menu-item$/);
        for (const c of text.all) expect(c).not.toMatch(/--on dropdown-menu$/);
      },
      T,
    );
    it(
      'a later "the shadows softer" is the theme shadows',
      async test => {
        needsBases(test);
        const r = await answer('make the card green and the shadows softer');
        expect(r.first[0]).toBe("background-color '#16a34a' --on card");
        const shadows = r.first.slice(1);
        expect(shadows.length).toBeGreaterThan(0);
        expect(shadows.every(c => /^--shadow-/.test(c))).toBe(true);
      },
      T,
    );
  });
});

// `editor how` (follow-up): on a theme that draws both modes, a clearly dark
// card or surface fill goes to dark mode, its own text with it, unless the same
// answer gives it its own text (a look in every mode); a clearly light
// whole-theme border color goes to light mode.
describe('draws modes clearly dark', () => {
  /** @param {string} q */
  const first = async q => {
    const {data} = await themeEditHow(q, {cwd, theme: 'n'});
    const r = (data.results ?? []).find(x =>
      x.commands.some(c => / editor set /.test(c)),
    );
    return (r?.commands ?? [])
      .filter(c => / editor set /.test(c))
      .map(c => c.replace(/^.* editor set \S+ /, ''));
  };

  describe('dark surfaces and light borders by mode', () => {
    it('go to the mode they suit', async test => {
      if (unbuilt) {
        console.warn(`skipped: ${unbuilt}`);
        test.skip();
      }
      expect(await first('cards #0f1011; main text #f7f8f8')).toEqual([
        "background-color '#0f1011' --on card --mode dark",
        "--color-text-primary '#f7f8f8' --mode dark",
      ]);
      expect(await first('dark cards')).toEqual([
        "background-color '#1f2937' --on card --mode dark",
      ]);
      // (Its own text said with it: a look in every mode.)
      expect((await first('navy header with white text'))[0]).toBe(
        "background-color '#1e3a8a' --on app-shell-header",
      );
      expect(
        await first('body text should be #1a1f36; borders #e3e8ee'),
      ).toEqual([
        "--color-text-primary '#1a1f36' --mode light",
        "--color-border '#e3e8ee' --mode light",
      ]);
      expect(await first('make the borders #333333')).toEqual([
        "--color-border '#333333'",
      ]);
    }, 300_000);
  });
});

// `editor how`: on a theme that draws both modes, a clearly light page or
// surface color goes to light mode and a clearly dark one to dark mode, said,
// unless the ask says both modes; a fill on a part that holds others names a
// part inside at nearly the same color; a prohibition on a part's text never
// writes the forbidden color; a later clause about everything or the theme text
// takes no part from the clause before; a size word before what changes is the
// amount, never the part's size; a value the question gives leads over show's
// missed list.
describe('draws modes clearly light', () => {
  /** @param {string} q */
  const answer = async q => {
    const {data} = await themeEditHow(q, {cwd, theme: 'n'});
    const results = data.results ?? [];
    const sets = (/** @type {string[]} */ cs) =>
      cs
        .filter(c => / editor set /.test(c))
        .map(c => c.replace(/^.* editor set \S+ /, ''));
    return {
      first: sets(
        results.find(r => r.commands.some(c => / editor set /.test(c)))
          ?.commands ?? [],
      ),
      all: sets(results.flatMap(r => r.commands)),
      text: results.map(r => r.text).join('\n'),
    };
  };

  /** @param {import('vitest').TestContext} test */
  const needsBases = test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
  };

  const T = 300_000;

  describe('a page or surface color, by mode', () => {
    it(
      'goes to the mode it suits, said; whole when the ask says both modes',
      async test => {
        needsBases(test);
        const cream = await answer('cream background');
        expect(cream.first.slice(0, 1)).toEqual([
          "--color-background-body '#fef3c7' --mode light",
        ]);
        expect(cream.text).toMatch(/dark mode keeps its own page/);
        expect((await answer('page bg #F2F2F7')).first.slice(0, 1)).toEqual([
          "--color-background-body '#f2f2f7' --mode light",
        ]);
        expect(
          (await answer('make the background #1e293b')).first.slice(0, 1),
        ).toEqual(["--color-background-body '#1e293b' --mode dark"]);
        expect(
          (await answer('make the page #fffbeb in both modes')).first.slice(
            0,
            1,
          ),
        ).toEqual(["--color-background-body '#fffbeb'"]);
        expect((await answer('white cards')).first).toEqual([
          "background-color '#ffffff' --on card --mode light",
        ]);
        // (An inverted surface, a tooltip, is dark in light mode by design.)
        for (const c of (await answer('make tooltips black')).first)
          expect(c).not.toMatch(/--mode dark/);
      },
      T,
    );
  });

  describe('clone and blind asks', () => {
    it(
      'a part inside a filled holder at nearly the same color is named',
      async test => {
        needsBases(test);
        expect((await answer('make the header black')).text).toMatch(
          /primary button inside app-shell-header has nearly the same color/,
        );
      },
      T,
    );
    it(
      "a prohibition on a part's text never writes the forbidden color",
      async test => {
        needsBases(test);
        for (const q of [
          'never use pure black for button text',
          'buttons: 3px radius, never use pure black for text',
        ])
          for (const c of (await answer(q)).all)
            expect(c, q).not.toMatch(/'#000000'/);
      },
      T,
    );
    it(
      'everything, or the theme text, takes no part from the clause before',
      async test => {
        needsBases(test);
        expect(
          (await answer('buttons: 3px radius; make everything more compact'))
            .first,
        ).toEqual(['border-radius 3px --on button', 'spacing less']);
        const text = await answer(
          'primary buttons with white text; text color #303030',
        );
        expect(text.first).toContain(
          "--color-text-primary '#303030' --mode light",
        );
      },
      T,
    );
    it(
      'a text ask after ";" is the theme\'s; a run\'s trailing mode covers it',
      async test => {
        needsBases(test);
        expect(
          (await answer('cards with a subtle shadow; 14px text')).first,
        ).toEqual(["box-shadow 'var(--shadow-low)' --on card", 'text-size 14']);
        for (const c of (await answer('cards #0f1011; main text #f7f8f8'))
          .first)
          if (/text/.test(c)) expect(c).not.toMatch(/--on card/);
        expect(
          (
            await answer(
              'secondary buttons white with a 1px border and a small shadow in light mode',
            )
          ).first[0],
        ).toBe(
          "background-color '#ffffff' --on button --when variant:secondary --mode light",
        );
        expect(
          (
            await answer(
              'primary buttons black with white text in light mode and white with black text in dark mode',
            )
          ).first,
        ).toEqual([
          "background-color '#000000' --on button --when variant:primary --mode light",
          "color '#ffffff' --on button --when variant:primary --mode light",
          "background-color '#ffffff' --on button --when variant:primary --mode dark",
          "color '#000000' --on button --when variant:primary --mode dark",
        ]);
      },
      T,
    );
    it(
      'wild: links unreadable on one page go to the other mode; dial clauses stay whole',
      async test => {
        needsBases(test);
        expect((await answer('links dark blue #0033aa')).first).toEqual([
          "--color-text-accent '#0033aa' --mode light",
        ]);
        expect((await answer('pill buttons, larger text')).first).toEqual([
          'corners pill --on button',
          'text-size more',
        ]);
        expect(
          (await answer('cards: 24px radius; roomier spacing')).first,
        ).toEqual(['border-radius 24px --on card', 'spacing more']);
        expect(
          (await answer('sepia page #f6f0e4 in light mode, dark brown text'))
            .first,
        ).toEqual([
          "--color-background-body '#f6f0e4' --mode light",
          "--color-text-primary '#92400e' --mode light",
        ]);
        // (A part's own text said with it after a comma stays the part's.)
        expect((await answer('buttons blue, white text')).first).toEqual([
          "background-color '#2563eb' --on button",
          "color '#ffffff' --on button",
        ]);
      },
      T,
    );
    it(
      'a size word before what changes is the amount',
      async test => {
        needsBases(test);
        expect((await answer('a small shadow on inputs')).first).toEqual([
          "box-shadow 'var(--shadow-low)' --on inputs",
        ]);
        for (const c of (await answer('large padding on buttons')).first)
          expect(c).not.toMatch(/--when size:/);
        expect((await answer('make small buttons red')).first).toEqual([
          "background-color '#dc2626' --on button --when size:sm",
        ]);
      },
      T,
    );
  });
});

// `editor how`: the error banner's text weight is set under its status; a part
// kept to a place (said as "the dialog buttons" or "menu items in the dialog")
// writes nothing unless a token on the place holds it; a size named moves that
// size's own control height, or nothing when the part data shows none; an
// icon's size is said, never the button's.
describe('error banner text weight', () => {
  /** @param {string} q */
  const answer = async q => {
    const {data} = await themeEditHow(q, {cwd, theme: 'n'});
    const results = data.results ?? [];
    const sets = (/** @type {string[]} */ cs) =>
      cs
        .filter(c => / editor set /.test(c))
        .map(c => c.replace(/^.* editor set \S+ /, ''));
    return {
      first: sets(
        results.find(r => r.commands.some(c => / editor set /.test(c)))
          ?.commands ?? [],
      ),
      all: sets(results.flatMap(r => r.commands)),
      text: results.map(r => r.text).join('\n'),
    };
  };

  /** @param {import('vitest').TestContext} test */
  const needsBases = test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
  };

  const T = 300_000;

  describe('how error banner text weight', () => {
    it(
      "the error banner's text weight is set under its status",
      async test => {
        needsBases(test);
        const r = await answer("make the error banner's text bold");
        expect(r.first.length).toBeGreaterThan(0);
        for (const c of r.first) expect(c).toMatch(/--when status:error/);
      },
      T,
    );
    it.each([
      'make the dialog buttons red',
      'make the menu items in the dialog red',
      'make the tabs in the card bigger',
    ])(
      '%s: nothing written, the reason said',
      async (q, test) => {
        needsBases(test);
        const r = await answer(q);
        expect(r.all, q).toEqual([]);
        expect(r.text, q).toMatch(/cannot be kept apart|cannot keep/);
      },
      T,
    );
    it(
      'a token the place holds still answers',
      async test => {
        needsBases(test);
        expect((await answer('make the card links red')).first).toEqual([
          "--color-text-accent '#dc2626' --on card",
        ]);
      },
      T,
    );
    it(
      'a size named: its own control height, or nothing',
      async test => {
        needsBases(test);
        expect(
          (await answer('make the medium buttons 36px tall')).first,
        ).toEqual(['--size-element-md 36px --on button']);
        const lg = await answer('make the large buttons 4px taller');
        expect(lg.all).toEqual([]);
        expect(lg.text).toMatch(/lg size reads no control height/);
      },
      T,
    );
    it(
      'border widths keep each state, inputs shrink, sizes step',
      async test => {
        needsBases(test);
        for (const q of [
          'make the radio border thicker',
          'make the checkbox border thicker',
        ])
          for (const c of (await answer(q)).all)
            expect(c, q).not.toMatch(/^border /);
        expect((await answer('make the inputs 24px tall')).first).toEqual([
          '--size-element-md 24px --on inputs',
          '--size-element-sm 20px --on inputs',
        ]);
        expect((await answer('make the small buttons taller')).first).toEqual([
          '--size-element-sm 32px --on button',
        ]);
        expect((await answer('make the medium buttons taller')).first).toEqual([
          '--size-element-md 36px --on button',
        ]);
        const sel = (await answer('make the selectors 4px taller')).first;
        expect(sel.map(c => c.split(' ').slice(0, 2).join(' '))).toEqual([
          '--size-element-md 36px',
          '--size-element-sm 32px',
        ]);
        const inCards = await answer('make the inputs in cards rounder');
        expect(inCards.all).toEqual([]);
        expect(inCards.text).toMatch(/cannot be kept apart|cannot keep/);
      },
      T,
    );
    it.each(['make the button icon bigger', 'make the icon in buttons bigger'])(
      '%s: the icon size is said, the button untouched',
      async (q, test) => {
        needsBases(test);
        const r = await answer(q);
        expect(r.all, q).toEqual([]);
        expect(r.text, q).toMatch(/icon's size/);
      },
      T,
    );
  });
});

// `editor how` guards: a kept status look with no rule of its own is judged by
// what it draws (an error input's inherited weight); a kept variant that draws
// no line keeps it with nothing written back; and an unknown word between a
// part and what changes is said, nothing written.
describe('guards status look rule', () => {
  /** @param {string} q */
  const answer = async q => {
    const {data} = await themeEditHow(q, {cwd, theme: 'n'});
    const results = data.results ?? [];
    const sets = (/** @type {string[]} */ cs) =>
      cs
        .filter(c => / editor set /.test(c))
        .map(c => c.replace(/^.* editor set \S+ /, ''));
    return {
      first: sets(
        results.find(r => r.commands.some(c => / editor set /.test(c)))
          ?.commands ?? [],
      ),
      all: sets(results.flatMap(r => r.commands)),
      text: results.map(r => r.text).join('\n'),
    };
  };

  /** @param {import('vitest').TestContext} test */
  const needsBases = test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
  };

  const T = 300_000;

  describe('keeps judged by what draws', () => {
    it(
      'error inputs keep the weight they draw while the rest get bolder',
      async test => {
        needsBases(test);
        const r = await answer(
          'make the inputs bolder but keep the error inputs as they are',
        );
        expect(r.text).not.toMatch(/couldn't work out|cannot be kept apart/);
        expect(r.first[0]).toBe('font-weight 700 --on inputs');
        expect(r.first).toContain(
          'font-weight 400 --on inputs --when status:error',
        );
      },
      T,
    );
    it(
      'a kept variant that draws no border takes nothing written back',
      async test => {
        needsBases(test);
        const r = await answer(
          'remove the border from cards except the muted ones',
        );
        expect(r.text).not.toMatch(/couldn't work out/);
        expect(r.first).toEqual(['border none --on card']);
      },
      T,
    );
  });

  describe('an unknown word between a part and what changes', () => {
    it.each([
      ['make the card zorp border red', 'zorp'],
      ['make the button blorp padding bigger', 'blorp'],
    ])(
      '%s: said, nothing written',
      async (q, word, test) => {
        needsBases(test);
        const r = await answer(q);
        expect(r.text).toMatch(new RegExp(`no part or word called "${word}"`));
        expect(r.all).toEqual([]);
      },
      T,
    );
    it.each([
      'make the card top border red',
      'make the button text color red',
      'make the card hover background darker',
    ])(
      '%s: a known word there still answers',
      async (q, test) => {
        needsBases(test);
        expect((await answer(q)).first.length).toBeGreaterThan(0);
      },
      T,
    );
  });
});

// `editor how` holds a kept look to what it drew before, wherever Core wrote it
// (beside the variant and size), so a status except on inputs answers on every
// base; reads "invalid" as the error status in an except or a keep; and says an
// unknown subject of a later clause ("the gizmo red") instead of giving it the
// part of the clause before.
describe('keeps drawn', () => {
  /** @param {string} q @param {string} theme */
  const answer = async (q, theme) => {
    const {data} = await themeEditHow(q, {cwd, theme});
    const results = data.results ?? [];
    const sets = (/** @type {string[]} */ cs) =>
      cs
        .filter(c => / editor set /.test(c))
        .map(c => c.replace(/^.* editor set \S+ /, ''));
    return {
      first: sets(
        results.find(r => r.commands.some(c => / editor set /.test(c)))
          ?.commands ?? [],
      ),
      all: sets(results.flatMap(r => r.commands)),
      text: results.map(r => r.text).join('\n'),
    };
  };

  /** @param {import('vitest').TestContext} test */
  const needsBases = test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
  };

  const T = 300_000;

  describe('a status kept on inputs', () => {
    it.each([
      ['remove the border from inputs except error inputs', 'border'],
      ['make inputs blue but keep the error border', 'background-color'],
      ['text fields red except the error ones', 'background-color'],
      ['make inputs red except when invalid', 'background-color'],
      ['make inputs red but keep the error state', 'background-color'],
    ])(
      '%s: answered on neutral and stone, the error look kept',
      async (q, thing, test) => {
        needsBases(test);
        for (const theme of ['n', 's']) {
          const r = await answer(q, theme);
          expect(r.text, `${theme}: ${q}`).not.toMatch(/couldn't work out/);
          expect(r.text, `${theme}: ${q}`).not.toMatch(/cannot be kept apart/);
          const pins = r.first.filter(c => /--when status:error/.test(c));
          expect(pins.length, `${theme}: ${q}`).toBeGreaterThan(0);
          for (const c of pins) expect(c).toMatch(new RegExp(`^${thing} `));
          // (A member with no error look of its own takes no pin.)
          for (const c of pins) expect(c).not.toMatch(/--on date-time-input/);
        }
      },
      T,
    );
  });

  describe('an unknown subject in a later clause', () => {
    it(
      'is said, never given the part before',
      async test => {
        needsBases(test);
        const r = await answer('make cards rounder and the gizmo red', 'n');
        expect(r.text).toMatch(/no part is called "gizmo"/);
        expect(r.all).toContain('corners more --on card');
        expect(r.all.join('\n')).not.toMatch(
          /background-color '#dc2626' --on card/,
        );
        // (A known part, or none, still takes the ask.)
        expect(
          (await answer('make cards rounder and the buttons red', 'n')).first,
        ).toContain("background-color '#dc2626' --on button");
      },
      T,
    );
  });
});

// `editor how`: an element named in a place it cannot be kept to ("the dialog's
// buttons") writes nothing and says why, unless the answer holds there (a token
// set on the place, "the card's links"); the menu separators are the menu's own
// divider; "the controls N tall" moves the control heights every control reads.
describe('places', () => {
  /** @param {string} q */
  const answer = async q => {
    const {data} = await themeEditHow(q, {cwd, theme: 'n'});
    const results = data.results ?? [];
    const sets = (/** @type {string[]} */ cs) =>
      cs
        .filter(c => / editor set /.test(c))
        .map(c => c.replace(/^.* editor set \S+ /, ''));
    return {
      first: sets(
        results.find(r => r.commands.some(c => / editor set /.test(c)))
          ?.commands ?? [],
      ),
      all: sets(results.flatMap(r => r.commands)),
      text: results.map(r => r.text).join('\n'),
    };
  };

  /** @param {import('vitest').TestContext} test */
  const needsBases = test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
  };

  const T = 300_000;

  describe('an element in a place', () => {
    it(
      "the menu's own divider, which Core draws on its own, is answered",
      async test => {
        needsBases(test);
        expect(
          (await answer('make the menu separators twice as thick')).all,
        ).toEqual(['--border-width 2px --on dropdown-menu-divider']);
      },
      T,
    );
    it(
      'a plain part in a place it cannot be kept to writes nothing, said',
      async test => {
        needsBases(test);
        const r = await answer("make the dialog's buttons rounder");
        expect(r.all).toEqual([]);
        expect(r.text).toMatch(/cannot be kept apart/);
      },
      T,
    );
    it(
      'an answer that holds in the place still answers',
      async test => {
        needsBases(test);
        expect((await answer("make the card's links red")).first).toEqual([
          "--color-text-accent '#dc2626' --on card",
        ]);
      },
      T,
    );
  });

  describe('the controls', () => {
    it(
      'move every control height together',
      async test => {
        needsBases(test);
        expect((await answer('make the controls 40px tall')).first).toEqual([
          '--size-element-lg 44px',
          '--size-element-md 40px',
          '--size-element-sm 36px',
        ]);
        expect((await answer('make all controls taller by 4px')).first).toEqual(
          [
            '--size-element-lg 40px',
            '--size-element-md 36px',
            '--size-element-sm 32px',
          ],
        );
      },
      T,
    );
  });
});

// `editor how`: a possessive owner of several words is the place and a part's
// own divider is Core's divider there, never the owner painted; a height in px
// moves each control height token on the part; a status border made thicker
// keeps the color it reads under that status; a later clause whose subject is a
// role color or a dial takes no part from the clause before.
describe('possessive owner several words', () => {
  /** @param {string} q */
  const answer = async q => {
    const {data} = await themeEditHow(q, {cwd, theme: 'n'});
    const results = data.results ?? [];
    const sets = (/** @type {string[]} */ cs) =>
      cs
        .filter(c => / editor set /.test(c))
        .map(c => c.replace(/^.* editor set \S+ /, ''));
    return {
      first: sets(
        results.find(r => r.commands.some(c => / editor set /.test(c)))
          ?.commands ?? [],
      ),
      all: sets(results.flatMap(r => r.commands)),
      text: results.map(r => r.text).join('\n'),
    };
  };

  /** @param {import('vitest').TestContext} test */
  const needsBases = test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
  };

  const T = 300_000;

  describe('how possessive owner several words', () => {
    it.each([
      [
        "make the dropdown menu's separators red",
        "--color-border '#dc2626' --on dropdown-menu-divider",
      ],
      [
        "make the menus' separators thicker",
        '--border-width 2px --on dropdown-menu-divider',
      ],
      [
        'make the menu separators thicker',
        '--border-width 2px --on dropdown-menu-divider',
      ],
    ])(
      "%s: the menu's own divider, never the menu painted nor every divider",
      async (q, line, test) => {
        needsBases(test);
        expect((await answer(q)).all, q).toEqual([line]);
      },
      T,
    );
    it(
      'a height in px moves each control height token, never one height',
      async test => {
        needsBases(test);
        expect((await answer('make the inputs 4px shorter')).first).toEqual([
          '--size-element-md 28px --on inputs',
          '--size-element-sm 24px --on inputs',
        ]);
        expect((await answer('make the buttons 2px taller')).first).toEqual([
          '--size-element-md 34px --on button',
          '--size-element-sm 30px --on button',
        ]);
        // (A height value is a minimum; never one fixed height on a group
        // whose text area takes its height from its rows.)
        // (The control heights the inputs read, on the group; never one
        // fixed height, which would cut a text area to one line.)
        const tall = await answer('make the inputs 40px tall');
        expect(tall.first).toEqual([
          '--size-element-md 40px --on inputs',
          '--size-element-sm 36px --on inputs',
        ]);
        for (const c of tall.all) expect(c).not.toMatch(/^(?:min-)?height /);
      },
      T,
    );
    it.each([
      ['make the invalid input border thicker', 'error'],
      ["make the warning inputs' border thicker", 'warning'],
    ])(
      '%s: the border keeps the color it reads under that status',
      async (q, status, test) => {
        needsBases(test);
        const r = await answer(q);
        for (const c of r.all.filter(x => /^border /.test(x)))
          expect(c, q).toMatch(new RegExp(`var\\(--color-border-${status}\\)`));
      },
      T,
    );
    it(
      'a later clause about the accent takes no part from the one before',
      async test => {
        needsBases(test);
        const r = await answer('make the card green and the accent darker');
        expect(r.first[0]).toBe("background-color '#16a34a' --on card");
        expect(r.first.slice(1).join('\n')).toMatch(/^accent /);
        expect(r.first.filter(c => /--on card/.test(c))).toHaveLength(1);
      },
      T,
    );
  });
});

// `editor how` names an unknown word in the part slot, keeps a status except on
// each group member that draws a border, reads a part's fainter text as its
// text color's alpha, and keeps a role, a keep and a ground where they are
// said.
describe('slot guards', () => {
  /** @param {string} q */
  const answer = async q => {
    const {data} = await themeEditHow(q, {cwd, theme: 'n'});
    const results = data.results ?? [];
    const sets = (/** @type {string[]} */ cs) =>
      cs
        .filter(c => / editor set /.test(c))
        .map(c => c.replace(/^.* editor /, ''));
    return {
      first: sets(
        results.find(r => r.commands.some(c => / editor set /.test(c)))
          ?.commands ?? [],
      ),
      all: sets(results.flatMap(r => r.commands)),
      text: results.map(r => r.text).join('\n'),
    };
  };

  /** @param {import('vitest').TestContext} test */
  const needsBases = test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
  };

  const T = 300_000;

  describe('guards', () => {
    it(
      'an unknown word in the part slot is said, never the whole theme',
      async test => {
        needsBases(test);
        for (const [q, word] of [
          ['make the zorp padding bigger', 'zorp'],
          ['remove the shadow from the blorp', 'blorp'],
        ]) {
          const r = await answer(q);
          expect(r.all, q).toEqual([]);
          expect(r.text, q).toMatch(new RegExp(`no part is called "${word}"`));
        }
        // (Known words in the same slot still answer.)
        expect(
          (await answer('make the card padding bigger')).all.length,
        ).toBeGreaterThan(0);
      },
      T,
    );
    it(
      'a status except keeps that status on each member that draws a border',
      async test => {
        needsBases(test);
        const removed = await answer(
          'remove the border from inputs except error inputs',
        );
        expect(removed.first[0]).toBe('set n border none --on inputs');
        expect(removed.first).toContain(
          "set n border '1px solid var(--color-border-error)' --on text-input --when status:error --only",
        );
        expect(removed.first.join('\n')).not.toMatch(/--on date-time-input/);
        const red = await answer(
          'make the input border red except error inputs',
        );
        expect(red.first).toContain(
          "set n border-color 'var(--color-border-error)' --on inputs --when status:error",
        );
      },
      T,
    );
    it(
      "a part's text made fainter is its text color's alpha, never the part's opacity",
      async test => {
        needsBases(test);
        for (const q of [
          'make button text more transparent',
          'make button text less visible',
          'make card text fainter',
        ]) {
          const r = await answer(q);
          expect(r.first.length, q).toBeGreaterThan(0);
          for (const c of r.all) expect(c, q).not.toMatch(/ opacity /);
        }
        const toast = await answer('make the toast text less visible');
        expect(toast.first[0]).toMatch(
          /^set n --color-on-dark '#[0-9a-f]{8}' --on toast/,
        );
      },
      T,
    );
  });

  describe('cases', () => {
    it(
      'roles, keeps, grounds and shapes stay where they are said',
      async test => {
        needsBases(test);
        const danger = await answer('make the danger badge text darker');
        for (const c of danger.first) expect(c).toMatch(/--when variant:error/);
        const sep = await answer('make the separator thicker');
        expect(sep.first).toEqual(['set n --border-width 2px --on divider']);
        const keep = await answer('make buttons red and keep the focus ring');
        expect(keep.all.join('\n')).not.toMatch(/--focus-outline-width/);
        const outline = await answer('make outline buttons blue on hover');
        expect(outline.text).not.toMatch(/undefined/);
        expect(outline.first).toContain(
          "set n border-color '#2563eb' --on button --when variant:primary --state hover",
        );
        expect((await answer('make tokens square')).first).toEqual([
          'set n corners square --on token',
        ]);
        const ratio = await answer('make the text on primary buttons 4.5:1');
        expect(ratio.all.join('\n')).not.toMatch(/set n --color-text-primary/);
      },
      T,
    );
  });
});

// `editor how` steps a part's text in a state ("disabled button text lighter")
// from each variant's own color, scoped to that variant and the state, so every
// variant moves the way asked: never one variant's color written on all of
// them.
describe('state variants', () => {
  /** @param {string} q */
  const first = async q => {
    const {data} = await themeEditHow(q, {cwd, theme: 'n'});
    const r = (data.results ?? []).find(x =>
      x.commands.some(c => / editor set /.test(c)),
    );
    return (r?.commands ?? []).filter(c => / editor set /.test(c));
  };

  describe('a state on a part with variants', () => {
    it.each([
      ['make the disabled button text lighter', 'lighter'],
      ['make the disabled button text darker', 'darker'],
    ])(
      '%s: each variant from its own color, in the state, the way asked',
      async (q, _way, test) => {
        if (unbuilt) {
          console.warn(`skipped: ${unbuilt}`);
          test.skip();
        }
        const cs = await first(q);
        expect(cs.length).toBeGreaterThan(1);
        for (const c of cs) {
          expect(c).toMatch(/--when variant:[a-z]+ --state disabled/);
        }
        // Each variant's step is its own: secondary (the main text color)
        // and primary (its on-accent) never take one shared value.
        const value = (/** @type {string} */ v, /** @type {string} */ m) =>
          cs
            .find(c => c.includes(`variant:${v} `) && c.includes(`--mode ${m}`))
            ?.match(/color '(#[0-9a-f]+)'/)?.[1];
        for (const m of ['light', 'dark']) {
          const [s2, p2] = [value('secondary', m), value('primary', m)];
          if (s2 && p2) expect(s2, `${q} ${m}`).not.toBe(p2);
        }
        expect(
          new Set(cs.map(c => /variant:([a-z]+)/.exec(c)?.[1])).size,
        ).toBeGreaterThan(1);
      },
      300_000,
    );
  });
});

// `editor how`: a thicker radio or checkbox border keeps its resting color,
// never the hover tint; possessives name the owner's own element, its state
// kept, the parts themselves before a thing they have, and an element the owner
// lacks is said; a height in a decimal unit is that height and a negative one
// is refused.
describe('thicker radio checkbox border', () => {
  /** @param {string} q */
  const answer = async q => {
    const {data} = await themeEditHow(q, {cwd, theme: 'n'});
    const results = data.results ?? [];
    const sets = (/** @type {string[]} */ cs) =>
      cs
        .filter(c => / editor set /.test(c))
        .map(c => c.replace(/^.* editor set \S+ /, ''));
    return {
      first: sets(
        results.find(r => r.commands.some(c => / editor set /.test(c)))
          ?.commands ?? [],
      ),
      all: sets(results.flatMap(r => r.commands)),
      text: results.map(r => r.text).join('\n'),
    };
  };

  /** @param {import('vitest').TestContext} test */
  const needsBases = test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
  };

  const T = 300_000;

  describe('how thicker radio checkbox border', () => {
    it.each([
      'make the radio border thicker',
      'make the checkbox border thicker',
    ])(
      '%s: never the hover tint',
      async (q, test) => {
        needsBases(test);
        const r = await answer(q);
        for (const c of r.all) expect(c, q).not.toMatch(/--color-tint-hover/);
      },
      T,
    );
    it(
      'possessives',
      async test => {
        needsBases(test);
        expect(
          (await answer("make the menu's hovered items red")).first,
        ).toEqual([
          "background-color '#dc2626' --on dropdown-menu-item --state hover",
        ]);
        // (A button set on every toggle button would reach those outside a
        // group too: nothing is written.)
        expect(
          (await answer("make the toggle group's buttons red")).first,
        ).toEqual([]);
        const both = await answer("make the cards' and buttons' borders red");
        expect(both.first.some(c => /--on card$/.test(c))).toBe(true);
        expect(both.first.some(c => /--on button$/.test(c))).toBe(true);
        const days = await answer("make the date picker's days rounder");
        expect(days.all).toEqual([]);
        expect(days.text).toMatch(/has no day part/);
      },
      T,
    );
    it(
      'heights in a decimal unit, and never negative',
      async test => {
        needsBases(test);
        expect((await answer('make the inputs 2.5rem high')).first).toEqual([
          '--size-element-md 40px --on inputs',
          '--size-element-sm 36px --on inputs',
        ]);
        const neg = await answer('make the buttons -4px tall');
        expect(neg.all).toEqual([]);
        expect(neg.text).toMatch(/cannot be -4px/);
      },
      T,
    );
  });
});

// `editor how` reads "twice as thin / small / narrow / short / tight" as half
// of now in that way, keeping what the words change: a divider's line, a
// border's width, the text size, the room inside.
describe('twice as', () => {
  /** @param {string} q */
  const first = async q => {
    const {data} = await themeEditHow(q, {cwd, theme: 'n'});
    const r = (data.results ?? []).find(x =>
      x.commands.some(c => / editor set /.test(c)),
    );
    return (r?.commands ?? [])
      .filter(c => / editor set /.test(c))
      .map(c => c.replace(/^.* editor set \S+ /, ''));
  };

  describe('twice as thin', () => {
    it('is half of now in that way, on what the words change', async test => {
      if (unbuilt) {
        console.warn(`skipped: ${unbuilt}`);
        test.skip();
      }
      expect(await first('make dividers twice as thin')).toEqual([
        '--border-width 0.5px --on divider',
      ]);
      expect(await first('make card borders twice as thin')).toEqual([
        'border-width 0.5px --on card',
      ]);
      expect(await first('make the text twice as small')).toEqual([
        'text-size less',
      ]);
      expect(await first('make the padding twice as tight')).toEqual([
        'spacing less',
      ]);
    }, 300_000);
  });
});

// `editor how` reads "twice as soft" as softer, a possessive owner ("the menus'
// separators") as the place, never a second part to change, and a divider's
// variant ("the strong divider") on its thickness line.
describe('twice soft softer possessive', () => {
  /** @param {string} q */
  const answer = async q => {
    const {data} = await themeEditHow(q, {cwd, theme: 'n'});
    const results = data.results ?? [];
    const sets = (/** @type {string[]} */ cs) =>
      cs
        .filter(c => / editor set /.test(c))
        .map(c => c.replace(/^.* editor set \S+ /, ''));
    return {
      first: sets(
        results.find(r => r.commands.some(c => / editor set /.test(c)))
          ?.commands ?? [],
      ),
      all: sets(results.flatMap(r => r.commands)),
      text: results.map(r => r.text).join('\n'),
    };
  };

  /** @param {import('vitest').TestContext} test */
  const needsBases = test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
  };

  const T = 300_000;

  describe('how twice soft softer possessive', () => {
    it(
      'twice as soft is softer: each shadow alpha halved, never doubled',
      async test => {
        needsBases(test);
        const r = await answer('make the shadow twice as soft');
        expect(r.text).toMatch(/alpha ×0\.5/);
        expect(r.text).not.toMatch(/×2\b/);
      },
      T,
    );
    it.each([
      "make the menus' separators red",
      "make the menu's separators red",
    ])(
      '%s: the owner is the place, never painted',
      async (q, test) => {
        needsBases(test);
        // (The menu's own divider, which the census records drawing the
        // line: never the menu, never every divider.)
        expect((await answer(q)).all, q).toEqual([
          "--color-border '#dc2626' --on dropdown-menu-divider",
        ]);
      },
      T,
    );
    it.each([
      ['make the strong divider thicker', 'strong', '2px'],
      ['make subtle dividers thicker', 'subtle', '2px'],
      ['make the strong divider 3px', 'strong', '3px'],
    ])(
      '%s: the thickness on that variant only',
      async (q, v, px, test) => {
        needsBases(test);
        expect((await answer(q)).first).toEqual([
          `--border-width ${px} --on divider --when variant:${v}`,
        ]);
      },
      T,
    );
  });
});

// `editor how` says an unknown word held by a place ("the zorp in cards") and
// writes nothing, as it does one between a part and what changes; a known word
// there still answers.
describe('unknown place', () => {
  /** @param {string} q */
  const answer = async q => {
    const {data} = await themeEditHow(q, {cwd, theme: 'n'});
    const results = data.results ?? [];
    return {
      all: results.flatMap(r => r.commands).filter(c => / editor set /.test(c)),
      text: results.map(r => r.text).join('\n'),
    };
  };

  /** @param {import('vitest').TestContext} test */
  const needsBases = test => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      test.skip();
    }
  };

  const T = 300_000;

  describe('an unknown word held by a place', () => {
    it.each([
      ['make the zorp in cards red', 'zorp'],
      ['make the zorps on buttons rounder', 'zorp'],
    ])(
      '%s: said, nothing written',
      async (q, word, test) => {
        needsBases(test);
        const r = await answer(q);
        expect(r.all).toEqual([]);
        expect(r.text).toMatch(new RegExp(`no part or word called "${word}"`));
      },
      T,
    );
    it.each([
      'make the links in cards red',
      'make the padding in cards bigger',
      'make the border on inputs red',
    ])(
      '%s: a known word still answers',
      async (q, test) => {
        needsBases(test);
        expect((await answer(q)).all.length).toBeGreaterThan(0);
      },
      T,
    );
  });
});
