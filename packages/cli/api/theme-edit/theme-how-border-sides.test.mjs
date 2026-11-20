// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Per-side border asks in `how`: colors written one per side, with a
 * width or style, said as a border color, or on a one-mode theme, are one
 * border color with every side as written (a light run said alone stays
 * one light border); a border said on several sides
 * ("top and sides", "left and right") is drawn on each side said, never
 * only the first; a side said transparent is that side's line drawn
 * see-through, never a fill or a fainter border; one side's border said
 * after a part's border is that part's side, never the theme's border
 * color; and the sides of a padding list are left to the spacing reader.
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

const T = 240_000;

/** @type {string} */
let cwd;
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-how-border-sides-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  await themeEditNew('n', {cwd, like: 'neutral'});
}, 600_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** What every answer says it applied. @param {string} q */
const said = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'n'});
  return (data.results ?? []).map((/** @type {any} */ r) => r.text).join('\n');
};

/** The set lines of the first answer, without the command prefix. @param {string} q */
const first = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'n'});
  return (data.results?.[0]?.commands ?? [])
    .flatMap((/** @type {string} */ c) => c.split(' && '))
    .filter((/** @type {string} */ c) => / editor set /.test(c))
    .map((/** @type {string} */ c) => c.replace(/^.* editor set \S+ /, ''));
};

describe('per-side border asks', () => {
  it(
    'keeps colors written one per side as one border color',
    async () => {
      if (unbuilt) return;
      expect(
        await first('border-color: #eee #eee #ddd on hovered tabs'),
      ).toEqual([
        "border-color '#eee #eee #ddd' --on tab --state hover --mode light",
      ]);
      // (A light run with no width or style said is one border, drawn in
      // both modes, as it always was.)
      expect(await first('tabs with a #eee #eee #ddd border')).toEqual([
        "border '1px solid light-dark(#eee, var(--color-border))' --on tab",
      ]);
    },
    T,
  );

  it(
    'draws a border said on several sides on each of them',
    async () => {
      if (unbuilt) return;
      expect(
        await first(
          'selected tab: #dddddd border on top and sides, no bottom border',
        ),
      ).toEqual([
        "border-top '1px solid #dddddd' --on tab --state selected",
        "border-left '1px solid #dddddd' --on tab --state selected",
        "border-right '1px solid #dddddd' --on tab --state selected",
        'border-bottom none --on tab --state selected',
      ]);
      expect(
        await said('selected tab: #dddddd border on top and sides'),
      ).toContain('a border on its top, left and right');
      expect(await first('no border on the sides of cards')).toEqual([
        'border-left none --on card',
        'border-right none --on card',
      ]);
    },
    T,
  );

  it(
    'reads a side said transparent as that side drawn see-through',
    async () => {
      if (unbuilt) return;
      const lines = await first(
        'selected tab border #dddddd with transparent bottom',
      );
      expect(lines.at(-1)).toBe(
        "border-bottom '1px solid transparent' --on tab --state selected",
      );
      expect(lines.join('\n')).not.toMatch(/background/);
      expect(
        await said('selected tab border #dddddd with transparent bottom'),
      ).toContain('read "transparent" as that side\'s line');
    },
    T,
  );

  it(
    "reads one side's border after a part's border as that part's side",
    async () => {
      if (unbuilt) return;
      const lines = await first('input border #dddddd, bottom border #999999');
      expect(lines.at(-1)).toBe(
        "border-bottom '1px solid #999999' --on inputs",
      );
      expect(lines.join('\n')).not.toMatch(/--color-border /);
      expect(await said('input border #dddddd, bottom border #999999')).toMatch(
        /read "bottom border #999999" as inputs' bottom border/,
      );
    },
    T,
  );

  it(
    'leaves a list of padding sides to the spacing reader',
    async () => {
      if (unbuilt) return;
      const lines = await first('buttons padding top and bottom 8px');
      expect(lines.some(l => /^padding-bottom 8px/.test(l))).toBe(true);
    },
    T,
  );

  it(
    'keeps a padding list beside a border word whole',
    async () => {
      if (unbuilt) return;
      const lines = await first(
        'cards with a #dddddd border, buttons padding top and bottom 8px',
      );
      expect(lines).toContainEqual(
        expect.stringMatching(/^padding-bottom 8px --on button$/),
      );
    },
    T,
  );

  it(
    'reads "on top of" as a place, never a side',
    async () => {
      if (unbuilt) return;
      const lines = await first(
        'make the header transparent on top of the hero',
      );
      expect(lines.join('\n')).not.toMatch(/border-top/);
      expect(lines.join('\n')).toMatch(/background-color transparent/);
    },
    T,
  );

  it(
    'leaves a slightly see-through side to the fainter border',
    async () => {
      if (unbuilt) return;
      const lines = await first(
        'inputs with a slightly transparent bottom border',
      );
      expect(lines.join('\n')).not.toMatch(/solid transparent/);
    },
    T,
  );

  it(
    'reads a light run with no width as one border, a see-through run per side',
    async () => {
      if (unbuilt) return;
      expect(await first('card border #eee #eee #ddd')).toContain(
        "border '1px solid light-dark(#eee, var(--color-border))' --on card",
      );
      expect(
        await first(
          'a rgba(0,0,0,.1) rgba(0,0,0,.1) rgba(0,0,0,.25) border on primary buttons',
        ),
      ).toEqual([
        "border-color 'rgba(0,0,0,.1) rgba(0,0,0,.1) rgba(0,0,0,.25)' --on button --when variant:primary",
      ]);
    },
    T,
  );

  it(
    'draws every side of a comma list, and only the sides said',
    async () => {
      if (unbuilt) return;
      expect(
        await first('cards with a #dddddd border on top, left and right'),
      ).toEqual([
        "border-top '1px solid #dddddd' --on card",
        "border-left '1px solid #dddddd' --on card",
        "border-right '1px solid #dddddd' --on card",
      ]);
      expect(
        await first('inputs with only a top and bottom border #999999'),
      ).toEqual([
        'border none --on inputs',
        "border-top '1px solid #999999' --on inputs",
        "border-bottom '1px solid #999999' --on inputs",
      ]);
    },
    T,
  );

  it(
    'leaves a padding side list beside a border word to the padding',
    async () => {
      if (unbuilt) return;
      const lines = await first(
        'inputs with a #cccccc border and padding top and bottom 6px',
      );
      expect(lines.some(l => /^padding-top .* --on inputs$/.test(l))).toBe(
        true,
      );
      expect(lines).toContain('padding-bottom 6px --on inputs');
    },
    T,
  );

  it(
    'keeps any graded transparent side a fainter border, never an invisible line',
    async () => {
      if (unbuilt) return;
      for (const w of ['barely', 'very', 'fairly', 'subtly', 'lightly'])
        expect(
          (await first(`inputs with a ${w} transparent bottom border`)).join(
            '\n',
          ),
          w,
        ).not.toMatch(/solid transparent/);
    },
    T,
  );

  it(
    'draws a border on each side said with no color, width or style',
    async () => {
      if (unbuilt) return;
      const lines = await first('cards with a border on top and bottom');
      expect(lines.map(l => l.split(' ')[0])).toEqual([
        'border-top',
        'border-bottom',
      ]);
    },
    T,
  );

  it(
    'keeps color functions said after border one per side',
    async () => {
      if (unbuilt) return;
      expect(
        await first(
          'card border rgba(0,0,0,.1) rgba(0,0,0,.1) rgba(0,0,0,.25)',
        ),
      ).toEqual([
        "border-color 'rgba(0,0,0,.1) rgba(0,0,0,.1) rgba(0,0,0,.25)' --on card",
      ]);
    },
    T,
  );

  it(
    'draws a darker edge on every side said',
    async () => {
      if (unbuilt) return;
      const lines = await first(
        'cards with a slightly darker top and bottom edge',
      );
      expect(lines.map(l => l.split(' ')[0])).toEqual([
        'border-top-color',
        'border-bottom-color',
      ]);
    },
    T,
  );

  it(
    'gives each side of a padding list its length, before or after padding',
    async () => {
      if (unbuilt) return;
      expect(await first('inputs with padding top and bottom 6px')).toEqual([
        'padding-top 6px --on inputs',
        'padding-bottom 6px --on inputs',
      ]);
    },
    T,
  );

  it(
    'leaves a side list said before padding to the padding',
    async () => {
      if (unbuilt) return;
      const lines = await first(
        'inputs with a #cccccc border and top and bottom padding 6px',
      );
      expect(lines.some(l => /^padding-top .* --on inputs$/.test(l))).toBe(
        true,
      );
      expect(lines.some(l => /^padding-bottom .* --on inputs$/.test(l))).toBe(
        true,
      );
      expect(lines.join('\n')).not.toMatch(/^border-(top|bottom) /m);
    },
    T,
  );

  it(
    'reads transparent after a label colon as the side drawn see-through, after the border',
    async () => {
      if (unbuilt) return;
      const lines = await first(
        'selected tab: transparent bottom, #dddddd border',
      );
      const side = lines.findIndex(l =>
        /^border-bottom '1px solid transparent' --on tab/.test(l),
      );
      const whole = lines.findIndex(l => /^border '/.test(l));
      expect(side).toBeGreaterThan(-1);
      // (The shorthand first, so the side said stays.)
      expect(whole).toBeLessThan(side);
    },
    T,
  );

  it(
    'keeps colors one per side with a width said beside them',
    async () => {
      if (unbuilt) return;
      expect(await first('cards border 2px #eee #eee #ddd')).toEqual([
        'border-width 2px --on card',
        'border-style solid --on card',
        // (Both modes: most card looks draw no border of their own, so the
        // dark mode has none to keep.)
        "border-color '#eee #eee #ddd' --on card",
      ]);
    },
    T,
  );

  it(
    'draws every side said with its own "on" and "the"',
    async () => {
      if (unbuilt) return;
      for (const q of [
        'cards with a border on the top and the bottom',
        'cards with borders on the left and on the right',
        'cards with a border above and below',
        'cards bordered on the left and right',
      ])
        expect(
          (await first(q)).map(l => l.split(' ')[0]),
          q,
        ).toHaveLength(2);
    },
    T,
  );

  it(
    'leaves corners on top and bottom every corner',
    async () => {
      if (unbuilt) return;
      expect(
        (await first('4px corners on top and bottom of cards')).join('\n'),
      ).not.toMatch(/border-start-(?:start|end)-radius/);
    },
    T,
  );

  it(
    "reads a side's line said transparent after it as see-through",
    async () => {
      if (unbuilt) return;
      expect(
        (await first('tabs: bottom border transparent')).join('\n'),
      ).toMatch(/^border-bottom '1px solid transparent' --on tab/m);
      const top = await first('cards with the top edge transparent');
      expect(top.join('\n')).toMatch(
        /^border-top '1px solid transparent' --on card/m,
      );
      expect(top.join('\n')).not.toMatch(/^border '/m);
    },
    T,
  );

  it(
    'writes per-side colors for both modes on a part that draws no border',
    async () => {
      if (unbuilt) return;
      const lines = await first('buttons border 2px #eee #eee #ddd');
      expect(lines.join('\n')).toMatch(
        /^border-color '#eee #eee #ddd' --on button$/m,
      );
      expect(lines.join('\n')).not.toMatch(/--mode light/);
      // (The answer says why, with the colors' contrast on the dark page.)
      expect(await said('buttons border 2px #eee #eee #ddd')).toMatch(
        /written for both modes, at \d+(?:\.\d)?:1 on the dark page/,
      );
    },
    T,
  );

  it(
    'keeps a style said without a width',
    async () => {
      if (unbuilt) return;
      expect(await first('cards border dashed #eee #eee #ddd')).toEqual([
        'border-style dashed --on card',
        "border-color '#eee #eee #ddd' --on card",
      ]);
    },
    T,
  );

  it(
    'reads transparent said last, after the side and its part',
    async () => {
      if (unbuilt) return;
      expect(
        (
          await first('make the bottom border of selected tabs transparent')
        ).join('\n'),
      ).toMatch(
        /^border-bottom '1px solid transparent' --on tab --state selected/m,
      );
    },
    T,
  );

  it(
    'keeps a keyword color in a run of per-side colors',
    async () => {
      if (unbuilt) return;
      expect(
        (await first('tabs border-color #dddddd #dddddd transparent')).join(
          '\n',
        ),
      ).toMatch(/^border-color '#dddddd #dddddd transparent' --on tab/m);
      // (One answer: "transparent" is a side there, never a fill.)
      expect(
        await said('tabs border-color #dddddd #dddddd transparent'),
      ).not.toMatch(/nothing is written/);
    },
    T,
  );

  it(
    "never lists a part name's side word with a padding side list",
    async () => {
      if (unbuilt) return;
      const lines = await first('top nav padding left and right 24px');
      expect(lines.join('\n')).toMatch(/^padding-left 24px /m);
      expect(lines.join('\n')).toMatch(/^padding-right 24px /m);
      expect(lines.join('\n')).not.toMatch(/^padding-top /m);
    },
    T,
  );

  it(
    'reads a color word with a side after it as the line, never a variant',
    async () => {
      if (unbuilt) return;
      expect(await first('cards: transparent bottom border')).toEqual([
        "border-bottom '1px solid transparent' --on card",
      ]);
      expect(
        (await first('cards: #ddd border, transparent bottom')).join('\n'),
      ).toMatch(/^border-bottom '1px solid transparent' --on card$/m);
    },
    T,
  );

  it(
    "keeps a variant leading a part's list, a side after it",
    async () => {
      if (unbuilt) return;
      expect(await first('buttons: primary bottom border #dddddd')).toEqual([
        "border-bottom '1px solid #dddddd' --on button --when variant:primary",
      ]);
    },
    T,
  );

  it(
    'gives a style said alone a width on a part that draws no line',
    async () => {
      if (unbuilt) return;
      expect(
        await first('buttons with a dotted #eee #eee #ddd border'),
      ).toEqual([
        "border-width 'var(--border-width)' --on button",
        'border-style dotted --on button',
        "border-color '#eee #eee #ddd' --on button",
      ]);
      // (A named look whose only line is a group seam, the secondary
      // button's, draws none standing alone.)
      expect(
        await first('secondary buttons with a dotted #eee #eee #ddd border'),
      ).toEqual([
        "border-width 'var(--border-width)' --on button --when variant:secondary",
        'border-style dotted --on button --when variant:secondary',
        // (Both modes: the secondary look's own dark line would be its
        // text color.)
        "border-color '#eee #eee #ddd' --on button --when variant:secondary",
      ]);
      // (With a width the line is drawn in every mode: the colors go to
      // both, never the secondary look's text color in dark mode.)
      expect(
        await first('secondary buttons with a 2px #eee #eee #ddd border'),
      ).toEqual([
        'border-width 2px --on button --when variant:secondary',
        'border-style solid --on button --when variant:secondary',
        "border-color '#eee #eee #ddd' --on button --when variant:secondary",
      ]);
    },
    T,
  );

  it(
    "never takes the next look's color word into a run",
    async () => {
      if (unbuilt) return;
      expect(
        (await first('cards border #dddddd white background')).join('\n'),
      ).not.toMatch(/#dddddd white/);
    },
    T,
  );

  it(
    'keeps the inputs light-only, and a light run on secondary buttons',
    async () => {
      if (unbuilt) return;
      // (Most inputs draw a line around: the dark mode keeps theirs.)
      expect(
        (await first('inputs with a 2px #eeeeee #eeeeee #dddddd border')).join(
          '\n',
        ),
      ).toMatch(
        /^border-color '#eeeeee #eeeeee #dddddd' --on inputs --mode light$/m,
      );
      // (A light run with no width: one border, drawn in both modes.)
      expect(
        await first('secondary buttons with a #eee #eee #ddd border'),
      ).toEqual([
        "border '1px solid light-dark(#eee, var(--color-border))' --on button --when variant:secondary",
      ]);
      expect(await first('buttons border #eee #eee #ddd')).toEqual([
        "border '1px solid light-dark(#eee, var(--color-border))' --on button",
      ]);
    },
    T,
  );

  it(
    'ends a side list at a comma when another look follows',
    async () => {
      if (unbuilt) return;
      expect(
        await first('cards with a border on top, bottom padding 8px'),
      ).toEqual([
        "border-top '1px solid var(--color-border)' --on card",
        'padding-bottom 8px --on card',
      ]);
      expect(
        (await first('cards with a border on top, bottom margin 8px'))[0],
      ).toBe("border-top '1px solid var(--color-border)' --on card");
      // (A comma and "and" ends it too.)
      expect(
        await first('cards with a border on top, and bottom padding 8px'),
      ).toEqual([
        "border-top '1px solid var(--color-border)' --on card",
        'padding-bottom 8px --on card',
      ]);
      expect(
        (await first('cards with a border on top, and bottom margin 8px'))[0],
      ).toBe("border-top '1px solid var(--color-border)' --on card");
      // (And a plain "and".)
      expect(
        await first('cards with a border on top and bottom padding 8px'),
      ).toEqual([
        "border-top '1px solid var(--color-border)' --on card",
        'padding-bottom 8px --on card',
      ]);
      // (A side right after the look word ends there too.)
      expect(await first('cards with border top, bottom padding 8px')).toEqual([
        "border-top '1px solid var(--color-border)' --on card",
        'padding-bottom 8px --on card',
      ]);
      expect(
        (await first('cards with border left, right padding 12px'))[0],
      ).toBe("border-left '1px solid var(--color-border)' --on card");
      expect(await first('cards with padding top, bottom border')).toContain(
        "border-bottom '1px solid var(--color-border)' --on card",
      );
      expect(
        await first('cards with an outline top, bottom padding 8px'),
      ).toEqual([
        "border-top '1px solid var(--color-border)' --on card",
        'padding-bottom 8px --on card',
      ]);
      // (Placed with "along", "across" or "on its" too, and a line is a
      // look of its own.)
      for (const ask of [
        'cards with a border along the top, bottom padding 8px',
        'cards with a border across the top, bottom padding 8px',
        'cards with a border on its top, bottom padding 8px',
        'cards with an outline along the top, bottom padding 8px',
      ])
        expect(await first(ask), ask).toEqual([
          "border-top '1px solid var(--color-border)' --on card",
          'padding-bottom 8px --on card',
        ]);
      // (A line's side never takes the tail's padding.)
      expect(await first('cards with a line top, bottom padding 8px')).toEqual([
        'padding-bottom 8px --on card',
      ]);
      // (After any look: a shadow on top, then the padding's bottom.)
      for (const look of ['a shadow', 'a glow', 'an underline'])
        expect(
          (await first(`cards with ${look} on top, bottom padding 8px`)).at(-1),
          look,
        ).toBe('padding-bottom 8px --on card');
      // (A corner word earlier in the clause leaves a border's list whole.)
      for (const ask of [
        'cards with rounded corners and a #ddd border on top, left and right',
        'rounded cards with a #ddd border on top, left and right',
      ])
        expect(
          (await first(ask)).filter(l => /^border-(top|left|right) /.test(l)),
          ask,
        ).toHaveLength(3);
      // (A gradient's color stops are never a side's line.)
      expect(
        (
          await first(
            'cards with a gradient from blue to white on top, bottom padding 8px',
          )
        ).some(l => /^border-top /.test(l)),
      ).toBe(false);
      // (Two sides of one look stay a list.)
      expect(await first('cards with a border on top and bottom')).toEqual([
        "border-top '1px solid var(--color-border)' --on card",
        "border-bottom '1px solid var(--color-border)' --on card",
      ]);
    },
    T,
  );

  it(
    'moves a shorthand before its side only within one list',
    async () => {
      if (unbuilt) return;
      // (Across a sentence or a "then", the later one is the next step.)
      expect(
        await first(
          'Give cards a red top border. Then give cards a 1px solid gray border.',
        ),
      ).toEqual([
        "border-top '1px solid #dc2626' --on card",
        "border '1px solid #9e9e9e' --on card",
      ]);
      expect(
        await first('tabs: a 2px bottom border, then a 1px gray border'),
      ).toEqual([
        "border-bottom '2px solid var(--color-border)' --on tab",
        "border '1px solid #9e9e9e' --on tab",
      ]);
    },
    T,
  );

  it(
    "never moves a shorthand before the editor's own kept step",
    async () => {
      if (unbuilt) return;
      const lines = await first(
        'inputs: 1px border #79747e, 2px #6750a4 when focused',
      );
      const focus = lines.filter(l =>
        /^border(?:-[a-z-]+)? .*--state focus-within/.test(l),
      );
      // (The asked focus color is the last focus border step: it wins.)
      expect(focus.at(-1)).toMatch(/^border '2px solid #6750a4'/);
    },
    T,
  );

  it(
    'names the card looks that draw no border, with the line that gives one',
    async () => {
      if (unbuilt) return;
      // (A run read per side, not a light one: a light run is one border on
      // every look.)
      const ask = 'cards with a #999999 #999999 #777777 border';
      const lines = await first(ask);
      // (No border brought: the default card draws one.)
      expect(lines.join('\n')).not.toMatch(/border-width|border-style/);
      expect(await said(ask)).toMatch(
        /card looks .*draw no border, so the colors show on the others; to give one a border: .* border 'var\(--border-width\) solid #999999' --on card --when variant:/,
      );
      // (A light run: one border, drawn on every card look, no note.)
      expect(await said('cards with a #eee #eee #ddd border')).not.toMatch(
        /draw no border/,
      );
    },
    T,
  );

  it(
    'moves a shorthand before its side only within one list',
    async () => {
      if (unbuilt) return;
      // (Across a sentence or a "then", the later one is the next step.)
      expect(
        await first(
          'Give cards a red top border. Then give cards a 1px solid gray border.',
        ),
      ).toEqual([
        "border-top '1px solid #dc2626' --on card",
        "border '1px solid #9e9e9e' --on card",
      ]);
      expect(
        await first('tabs: a 2px bottom border, then a 1px gray border'),
      ).toEqual([
        "border-bottom '2px solid var(--color-border)' --on tab",
        "border '1px solid #9e9e9e' --on tab",
      ]);
    },
    T,
  );
});
