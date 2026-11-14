// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `editor how`: step counts, sizes written as width x height, a
 * warmer or cooler accent, heading level ranges, variant words after
 * except, a part's own radius with several values, a see-through fill,
 * one variant's color from another's, bounds ("bigger than 4px") and a
 * part's color measured per variant.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt89-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('q', {cwd, like: 'neutral'});
}, 240_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** Every set command and every text. @param {string} q */
const answer = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'q'});
  const results = data.results ?? [];
  return {
    commands: results
      .flatMap(r => r.commands)
      .filter(c => / editor set /.test(c))
      .map(c => c.replace(/^.* editor /, '')),
    text: results.map(r => r.text).join('\n'),
  };
};

const T = 120_000;

describe('step counts', () => {
  it(
    'card padding 2 steps more is two spacing steps on cards',
    async () => {
      expect((await answer('card padding 2 steps more')).commands).toEqual([
        'set q spacing more --on card',
        'set q spacing more --on card',
      ]);
    },
    T,
  );
  it(
    '3 steps rounder is three corner steps for the whole theme',
    async () => {
      expect((await answer('3 steps rounder')).commands).toEqual([
        'set q corners more',
        'set q corners more',
        'set q corners more',
      ]);
    },
    T,
  );
  it(
    'card corners 3 steps rounder never sets 3px',
    async () => {
      const c = (await answer('card corners 3 steps rounder')).commands;
      expect(c).toHaveLength(3);
      expect(c.every(x => x === 'set q corners more --on card')).toBe(true);
    },
    T,
  );
  it(
    '2 spacing units more and less move opposite ways',
    async () => {
      expect((await answer('2 spacing units more on cards')).commands[0]).toBe(
        'set q spacing more --on card',
      );
      expect((await answer('2 spacing units less on cards')).commands[0]).toBe(
        'set q spacing less --on card',
      );
    },
    T,
  );
});

describe('a size written as width x height', () => {
  it(
    'avatars 24x24px sets their width and height',
    async () => {
      expect((await answer('avatars 24x24px')).commands).toEqual([
        'set q width 24px --on avatar',
        'set q height 24px --on avatar',
      ]);
    },
    T,
  );
  it(
    'padding 24x24px stays a padding',
    async () => {
      expect((await answer('card padding 24x24px')).commands[0]).toMatch(
        /^set q padding /,
      );
    },
    T,
  );
});

describe('a warmer or cooler accent', () => {
  it(
    'a gray accent has no hue to move: no command, no neutral change',
    async () => {
      const r = await answer('make the accent cooler');
      expect(r.commands).toEqual([]);
      expect(r.text).toMatch(/gray now/);
    },
    T,
  );
  it('hueToward moves only the hue', async () => {
    const {hueToward} = await import('./_how-question.mjs');
    expect(hueToward('#7c3aed', 220, 25)).toBe('#3a43ed');
    expect(hueToward('#808080', 220, 25)).toBe(null);
  });
});

describe('heading level ranges', () => {
  it(
    'headings 2-4 bigger scales only those levels, each from its own size',
    async () => {
      const c = (await answer('headings 2-4 bigger')).commands;
      expect(c.map(x => /--text-heading-(\d)-size/.exec(x)?.[1])).toEqual([
        '2',
        '3',
        '4',
      ]);
    },
    T,
  );
});

describe('variant words after except', () => {
  it(
    'cards except transparent ones keep no fill there',
    async () => {
      expect(
        (await answer('red background on cards except transparent ones'))
          .commands[1],
      ).toBe(
        'set q background transparent --on card --when variant:transparent',
      );
    },
    T,
  );
  it(
    'badges except success ones keep the success fill',
    async () => {
      expect(
        (await answer('red background on badges except success ones'))
          .commands[1],
      ).toMatch(/--on badge --when variant:success$/);
    },
    T,
  );
});

describe('a see-through fill', () => {
  it(
    'semi-transparent button background is its own fill at half alpha, never an overlay',
    async () => {
      expect(
        (await answer('semi-transparent button background')).commands,
      ).toEqual([
        "set q background-color 'color-mix(in srgb, var(--color-accent) 50%, transparent)' --on button",
      ]);
    },
    T,
  );
});

describe('one variant from another', () => {
  it(
    'primary button text takes the secondary text color',
    async () => {
      expect(
        (
          await answer(
            'make the primary button text the same color as the secondary button text',
          )
        ).commands,
      ).toEqual([
        "set q color 'var(--color-text-primary)' --on button --when variant:primary",
      ]);
    },
    T,
  );
  it(
    'secondary buttons take the primary fill',
    async () => {
      expect(
        (
          await answer(
            'make secondary buttons the same color as primary buttons',
          )
        ).commands[0],
      ).toMatch(
        /^set q background-color 'var\(--color-accent\)' --on button --when variant:secondary$/,
      );
    },
    T,
  );
});

describe('bounds', () => {
  it(
    'bigger than 4px when already bigger: nothing, never a min-height',
    async () => {
      const r = await answer('make the card padding bigger than 4px');
      expect(r.commands).toEqual([]);
      expect(r.text).toMatch(/already bigger than 4px/);
    },
    T,
  );
  it(
    'bigger than 24px goes past it',
    async () => {
      expect(
        (await answer('make the card padding bigger than 24px')).commands[0],
      ).toBe('set q padding 30px --on card');
    },
    T,
  );
});
