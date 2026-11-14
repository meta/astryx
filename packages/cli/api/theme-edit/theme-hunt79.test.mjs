// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hunt79: `editor how` amounts and property families: zero, none and
 * no in any position; one amount reader for shares, fractions and percents;
 * side-aware padding; step counts; opacity and see-through amounts; color
 * amounts on text, states, borders, dividers and links; warmer and cooler;
 * supporting text sizes; heading weights and ranges; widths from the part's
 * own width; thinner text, sharper shadows and overlays; camelCase property
 * names.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {blurScaled, exactFactor, shiftKeepAlpha} from './_how-question.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt79-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('q', {cwd, like: 'neutral'});
  await themeEditNew('faded', {cwd, like: 'neutral'});
  await themeEditSet('faded', 'opacity', '0.5', {cwd, on: 'card'});
}, 240_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** The first answer with a change: its commands and text. @param {string} q @param {string} [theme] */
const top = async (q, theme = 'q') => {
  const {data} = await themeEditHow(q, {cwd, theme});
  const r = (data.results ?? []).find(x =>
    x.commands.some(c => / editor (set|undo) /.test(c)),
  );
  return {
    all: (r ? (r.sequence ? r.commands : [r.commands[0]]) : [])
      .map(c => c.replace(/^.* editor /, ''))
      .join('\n'),
    text: r?.text ?? '',
    every: (data.results ?? []).map(x => x.text).join('\n'),
  };
};

const T = 120_000;

/** The value in an answer's "(now …)", parentheses inside kept. @param {string} text */
const nowIn = text => {
  const at = text.indexOf('(now ');
  if (at < 0) return '';
  let depth = 0;
  for (let i = at; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return text.slice(at + 5, i);
  }
  return '';
};

describe('zero, none and no in any position', () => {
  it.each([
    [
      'make card corners zero',
      /^set q (corners square|border-radius 0(px)?) --on card$/,
    ],
    ['set the card radius to zero', /^set q border-radius 0(px)? --on card$/],
    ['zero border on cards', /^set q border (0|none) --on card$/],
    ['zero shadow on dialogs', /^set q box-shadow none --on dialog$/],
    ['card opacity zero', /^set q opacity 0 --on card$/],
    [
      'zero letter spacing on headings',
      /^set q letter-spacing 0 --on heading$/,
    ],
    ['no letter spacing on buttons', /^set q letter-spacing 0 --on button$/],
  ])(
    '%s sets that property to 0 or none',
    async (q, want) => {
      expect((await top(q)).all).toMatch(want);
    },
    T,
  );
  it(
    'zero letter spacing never answers wider headings',
    async () => {
      const {all} = await top('zero letter spacing on headings');
      expect(all).not.toMatch(/headings wide|0\.04em/);
    },
    T,
  );
});

describe('one amount reader', () => {
  it.each([
    ['up 20%', 1.2],
    ['down by 10%', 0.9],
    ['increased by 50%', 1.5],
    ['2/3', 2 / 3],
    ['two thirds of what it is', 2 / 3],
    ['three quarters', 0.75],
    ['twice as small', 0.5],
    ['half as much again', 1.5],
    ['a third again', 4 / 3],
  ])(
    '"card padding %s" reads as a factor of now',
    async (amount, f) => {
      const {all, text} = await top(`card padding ${amount}`);
      const m = /padding (\d*\.?\d+)rem --on card/.exec(all);
      const now = /\(now (\d*\.?\d+)rem\)/.exec(text);
      expect(m && now).toBeTruthy();
      expect(Number(m?.[1])).toBeCloseTo(Number(now?.[1]) * f, 2);
    },
    T,
  );
  it(
    'a lone ½ is half of now, never 0.5px',
    async () => {
      const {all} = await top('card padding ½');
      expect(all).toMatch(/^set q padding \d*\.?\d+rem --on card$/);
      expect(all).not.toMatch(/0\.5px/);
    },
    T,
  );
  it(
    'raising the radius by a percent scales it, never a CSS percent',
    async () => {
      const {all} = await top('raise the card radius 50%');
      expect(all).toMatch(/border-radius \d*\.?\d+(rem|px) --on card/);
      expect(all).not.toMatch(/50%/);
    },
    T,
  );
  it(
    'a bare percent radius is refused with the exact command that works',
    async () => {
      const r = await top('card radius 50%');
      expect(r.all).toBe('');
      expect(r.every).toMatch(
        /50% of the radius now: .*how 'card radius 50% of now'/,
      );
    },
    T,
  );
  it('exactFactor reads the again shares', () => {
    expect(exactFactor('a third again')).toBeCloseTo(4 / 3, 5);
    expect(exactFactor('a quarter again')).toBeCloseTo(1.25, 5);
  });
});

describe('padding sides', () => {
  it.each([
    ['remove the top padding on cards', 'padding-top'],
    ['no left padding on cards', 'padding-left'],
    ['card padding left zero', 'padding-left'],
    ['get rid of the right padding on buttons', 'padding-right'],
  ])(
    '%s sets that side to 0',
    async (q, prop) => {
      expect((await top(q)).all).toMatch(
        new RegExp(`^set q ${prop} 0(px)? --on (card|button)$`),
      );
    },
    T,
  );
  it(
    'the left side reads its own value now, not the top',
    async () => {
      const {all, text} = await top('double the left padding on buttons');
      const now = /\(now (\d*\.?\d+)rem\)/.exec(text)?.[1];
      const top0 = /\(now (\d*\.?\d+)rem\)/.exec(
        (await top('double the top padding on buttons')).text,
      )?.[1];
      expect(Number(now)).not.toBe(Number(top0));
      expect(all).toMatch(new RegExp(`padding-left ${Number(now) * 2}rem`));
    },
    T,
  );
});

describe('step counts', () => {
  it(
    'two steps bigger is two dial steps in order',
    async () => {
      const {all} = await top('make the card padding two steps bigger');
      expect(all.split('\n')).toEqual([
        'set q spacing more --on card',
        'set q spacing more --on card',
      ]);
    },
    T,
  );
  it(
    '3 steps rounder is three corner steps',
    async () => {
      const {all} = await top('make cards 3 steps rounder');
      expect(all.split('\n')).toHaveLength(3);
      expect(all).toMatch(/^set q corners more --on card$/m);
    },
    T,
  );
  it(
    'N spacing units is N times the spacing unit token',
    async () => {
      expect((await top('make the card padding 2 spacing units')).all).toBe(
        "set q padding 'calc(2 * var(--spacing-1))' --on card",
      );
    },
    T,
  );
});

describe('opacity and see-through amounts', () => {
  it.each([
    ['make the card half transparent', 'opacity 0.5'],
    ['make the card 10% transparent', 'opacity 0.9'],
    ['card 50% opacity', 'opacity 0.5'],
  ])(
    '%s sets the opacity only',
    async (q, want) => {
      const {all} = await top(q);
      expect(all).toBe(`set q ${want} --on card`);
    },
    T,
  );
  it(
    'a semi-transparent fill keeps the fill at half alpha',
    async () => {
      const {all} = await top('make the badge background semi-transparent');
      expect(all).toMatch(
        /background-color 'color-mix\(in srgb, var\(--color-[a-z-]+\) 50%, transparent\)' --on badge/,
      );
    },
    T,
  );
  it(
    'a percent color is that color at that alpha',
    async () => {
      expect((await top('card background 5% gray')).all).toBe(
        "set q background 'color-mix(in srgb, gray 5%, transparent)' --on card",
      );
    },
    T,
  );
  it(
    'more opaque raises the opacity, never lowers it',
    async () => {
      const {all} = await top('make the card more opaque', 'faded');
      const v = Number(/opacity (\d*\.?\d+)/.exec(all)?.[1]);
      expect(v).toBeGreaterThan(0.5);
      const none = await top('make the card more opaque');
      expect(none.all).toBe('');
      expect(none.every).toMatch(/fully opaque/);
    },
    T,
  );
});

describe('color amounts', () => {
  it(
    'a percent on text lighter is that much',
    async () => {
      const a = (await top('make the card text 30% lighter')).all;
      const b = (await top('make the card text 50% lighter')).all;
      expect(a).not.toBe(b);
    },
    T,
  );
  it(
    'a percent on a hover fill is that much',
    async () => {
      expect(
        (await top('make the button hover background 20% darker')).all,
      ).toMatch(/brightness\(0\.8\)/);
      expect(
        (await top('make the button hover background 50% darker')).all,
      ).toMatch(/brightness\(0\.5\)/);
    },
    T,
  );
  it(
    'warmer moves the page hue toward warm at the same lightness',
    async () => {
      const {all, text} = await top('make the page background slightly warmer');
      expect(text).toMatch(/warmer page background/);
      const light =
        /--color-background-body '#([0-9a-f]{6})' --mode light/.exec(
          all,
        )?.[1] ?? '';
      const [r, , b] = [0, 2, 4].map(i => parseInt(light.slice(i, i + 2), 16));
      expect(r).toBeGreaterThan(b);
    },
    T,
  );
  it(
    'cooler moves the page hue toward blue',
    async () => {
      const {all} = await top('make the page background cooler');
      const light =
        /--color-background-body '#([0-9a-f]{6})' --mode light/.exec(
          all,
        )?.[1] ?? '';
      const [r, , b] = [0, 2, 4].map(i => parseInt(light.slice(i, i + 2), 16));
      expect(b).toBeGreaterThan(r);
    },
    T,
  );
  it('lighter and darker keep the alpha of functional colors', () => {
    expect(shiftKeepAlpha('rgb(51 102 204 / 50%)', 0.12)).toMatch(
      /^#[0-9a-f]{6}[0-9a-f]{2}$/,
    );
    expect(shiftKeepAlpha('hsl(220 60% 50% / 0.4)', -0.12)).toMatch(
      /^#[0-9a-f]{8}$/,
    );
    expect(shiftKeepAlpha('oklch(0.5 0.15 260 / 30%)', 0.1)).toMatch(
      /^#[0-9a-f]{8}$/,
    );
  });
});

describe('lighter and darker on borders, dividers and links are color', () => {
  it.each([
    ['make the card border darker', /--color-border '#[0-9a-f]+' --on card/],
    ['make the divider lighter', /--color-border '#[0-9a-f]+' --on divider/],
    ['make the link color darker', /--color-text-accent '#[0-9a-f]+'/],
    ['links lighter', /--color-text-accent '#[0-9a-f]+'/],
  ])(
    '%s changes the color, never the width',
    async (q, want) => {
      const {all} = await top(q);
      expect(all).toMatch(want);
      expect(all).not.toMatch(/border-width/);
    },
    T,
  );
});

describe('type sizes and weights', () => {
  it.each([
    ['make small text bigger'],
    ['make the secondary text smaller'],
    ['make the fine print smaller'],
  ])(
    '%s changes the supporting text size, not the base size',
    async q => {
      const {all} = await top(q);
      expect(all).toMatch(/^set q --text-supporting-size \d*\.?\d+rem$/);
    },
    T,
  );
  it(
    'a bare 100-900 after a heading level is its weight',
    async () => {
      expect((await top('h1 800')).all).toBe(
        'set q font-weight 800 --on heading --when level:1',
      );
    },
    T,
  );
  it(
    'a heading range changes each level',
    async () => {
      const {all} = await top('h2 through h4 bold');
      expect(all.split('\n')).toEqual(
        [2, 3, 4].map(
          n => `set q font-weight 700 --on heading --when level:${n}`,
        ),
      );
    },
    T,
  );
  it(
    'thinner body text is a lighter weight, never the border width',
    async () => {
      const {all} = await top('make body text thinner');
      expect(all).toMatch(/--text-body-weight 300/);
    },
    T,
  );
});

describe('widths, shadows, scrollbars and overlays', () => {
  it(
    'wider takes no made-up 720px width',
    async () => {
      const r = await top('make the sidebar wider');
      expect(r.all).not.toMatch(/720px/);
    },
    T,
  );
  it(
    'a sharper shadow halves the blur of the shadow now, never the corners',
    async () => {
      const {all, text} = await top('make the dialog shadow sharper');
      expect(all).toMatch(/^set q box-shadow '.+' --on dialog$/);
      expect(all).not.toMatch(/corners|var\(--shadow-/);
      const now = nowIn(text);
      expect(all).toContain(String(blurScaled(now, 0.5)));
      const none = await top('make the card shadow sharper');
      expect(none.all).not.toMatch(/corners/);
    },
    T,
  );
  it(
    'a softer shadow on a part doubles the blur',
    async () => {
      const {all, text} = await top('make the dialog shadow softer');
      const now = nowIn(text);
      expect(all).toContain(String(blurScaled(now, 2)));
    },
    T,
  );
  it('blurScaled scales only the blur of each layer', () => {
    expect(
      blurScaled('0 4px 12px rgb(0 0 0 / 0.1), 0 1px 3px rgba(0,0,0,.2)', 0.5),
    ).toBe('0 4px 6px rgb(0 0 0 / 0.1), 0 1px 1.5px rgba(0,0,0,.2)');
    expect(blurScaled('rgb(0 0 0 / 0.1) 0 4px 12px', 2)).toBe(
      'rgb(0 0 0 / 0.1) 0 4px 24px',
    );
    expect(blurScaled('none', 2)).toBeNull();
  });
  it(
    'a thinner scrollbar never changes the border width',
    async () => {
      const r = await top('make the scrollbar thinner');
      expect(r.all).toBe('');
      expect(r.every).toMatch(/no scrollbar part/);
    },
    T,
  );
  it(
    'the overlay behind dialogs changes only the overlay alpha, never fully opaque',
    async () => {
      const {data} = await themeEditHow(
        'make the overlay behind dialogs lighter',
        {cwd, theme: 'q'},
      );
      expect(data.results.map(x => x.commands.join(' ')).join(' ')).not.toMatch(
        /--on dialog/,
      );
      const dark = (await top('make the dialog backdrop darker')).all;
      expect(dark).not.toMatch(/#000000ff/);
      expect(dark).toMatch(
        /--color-overlay '#[0-9a-f]{6}(?!ff)[0-9a-f]{2}' --mode dark/,
      );
    },
    T,
  );
});

describe('state words and heading comparisons', () => {
  it(
    '"the active one" is the same parts in that state',
    async () => {
      const {all} = await top(
        'make the nav links bolder and the active one blue',
      );
      const lines = all.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[1]).toMatch(/--on top-nav-item --state (active|selected)$/);
    },
    T,
  );
  it.each([
    ['h1 twice as big as body text', "'calc(2 * var(--text-body-size))'", 1],
    ['h3 the same size as h2', "'var(--text-heading-2-size)'", 3],
    ['h2 half the size of h1', "'calc(0.5 * var(--text-heading-1-size))'", 2],
  ])(
    '%s takes the other size times the amount',
    async (q, value, level) => {
      const {all} = await top(q);
      expect(all).toBe(
        `set q font-size ${value} --on heading --when level:${level}`,
      );
      await themeEditSet('faded', 'font-size', value.replace(/'/g, ''), {
        cwd,
        on: 'heading',
        when: `level:${level}`,
      });
    },
    T,
  );
});

describe('length deltas', () => {
  it.each([
    ['card padding +4px', 4],
    ['card padding 4px more', 4],
    ['card padding -2px', -2],
  ])(
    '%s is the padding now plus that length',
    async (q, d) => {
      const {all, text} = await top(q);
      const now = /from (\d*\.?\d+)rem to/.exec(text)?.[1];
      expect(now).toBeTruthy();
      expect(all).toBe(`set q padding ${Number(now) * 16 + d}px --on card`);
    },
    T,
  );
  it(
    'a button padding delta moves each side',
    async () => {
      const {all, text} = await top('add 8px to the button padding');
      const m = /from (\d*\.?\d+)rem (\d*\.?\d+)rem to/.exec(text);
      expect(m).toBeTruthy();
      expect(all).toBe(
        `set q padding '${Number(m?.[1]) * 16 + 8}px ${Number(m?.[2]) * 16 + 8}px' --on button`,
      );
    },
    T,
  );
  it(
    'a heading font size delta starts from that level',
    async () => {
      const {all, text} = await top('h1 font size +4px');
      const now = /from (\d*\.?\d+)rem to/.exec(text)?.[1];
      expect(all).toBe(
        `set q font-size ${Number(now) * 16 + 4}px --on heading --when level:1`,
      );
    },
    T,
  );
  it(
    'a radius delta moves from the radius now',
    async () => {
      expect((await top('card radius -2px')).all).toMatch(
        /^set q border-radius .*- 2px.* --on card$|^set q border-radius \d+(\.\d+)?px --on card$/,
      );
    },
    T,
  );
});

describe('the other headings', () => {
  it(
    'h1 800 and the other headings 600 sets each level',
    async () => {
      const {all} = await top('h1 800 weight and the other headings 600');
      expect(all.split('\n')).toEqual([
        'set q font-weight 800 --on heading --when level:1',
        ...[2, 3, 4, 5, 6].map(
          n => `set q font-weight 600 --on heading --when level:${n}`,
        ),
      ]);
    },
    T,
  );
});

describe('a size on padding', () => {
  it.each([
    ['card padding 24x24px', 'set q padding 24px --on card'],
    ['card padding 24x16px', "set q padding '16px 24px' --on card"],
  ])(
    '%s is that exact padding',
    async (q, want) => {
      expect((await top(q)).all).toBe(want);
    },
    T,
  );
});

describe('camelCase property names', () => {
  it.each([
    ['paddingLeft', 'padding-left'],
    ['borderRadius', 'border-radius'],
    ['fontSize', 'font-size'],
  ])(
    'how %s looks up %s',
    async (q, prop) => {
      const {data} = await themeEditHow(q, {cwd, theme: 'q'});
      expect(data.kind).toBe('setting');
      expect(/** @type {any} */ (data).subject).toBe(prop);
    },
    T,
  );
});
