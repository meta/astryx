// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for desktopMatches: media queries in the picture window.
 * @input picture-window.mjs
 * @output Level 4 conditions (`not`, `and`, `or`, nesting) and the forms read
 *   before them, each answered for the 1280 x 900 window with a mouse
 * @position Beside picture-window.mjs; theme-media-width.test.mjs checks the
 *   same function end to end through a theme sheet
 */

import {describe, expect, it} from 'vitest';

import {PICTURE_WINDOW, desktopMatches} from './picture-window.mjs';

const {width, height} = PICTURE_WINDOW;

describe('desktopMatches', () => {
  it('answers a negated condition in parentheses', () => {
    expect(
      desktopMatches('(not ((min-width: 768px) and (min-height: 500px)))'),
    ).toBe(false);
    expect(
      desktopMatches(
        `(not ((min-width: ${width + 1}px) and (min-height: 500px)))`,
      ),
    ).toBe(true);
    expect(desktopMatches('(not (min-width: 768px))')).toBe(false);
    expect(desktopMatches('not (max-width: 640px)')).toBe(true);
  });

  it('answers `or`, `not` around `or`, and nesting', () => {
    expect(desktopMatches('(max-width: 640px) or (min-height: 500px)')).toBe(
      true,
    );
    expect(desktopMatches('(max-width: 640px) or (max-height: 499px)')).toBe(
      false,
    );
    expect(
      desktopMatches('(not ((max-width: 640px) or (max-height: 499px)))'),
    ).toBe(true);
    expect(
      desktopMatches('(not ((max-width: 640px) or (min-height: 500px)))'),
    ).toBe(false);
    expect(
      desktopMatches(
        '((max-width: 767.98px) or ((max-width: 1023.98px) and (max-height: 499.99px)))',
      ),
    ).toBe(false);
    expect(
      desktopMatches(
        '(pointer: fine) and (not ((not (min-width: 768px)) or (not (min-height: 500px))))',
      ),
    ).toBe(true);
    expect(
      desktopMatches(
        '(not (min-width: 768px)) and (not (pointer: coarse)), (not (min-height: 500px)) and (not (pointer: coarse))',
      ),
    ).toBe(false);
  });

  it('answers ranges inside a condition', () => {
    expect(desktopMatches('(not (width < 768px))')).toBe(true);
    expect(
      desktopMatches(`(400px < width <= ${width}px) and (height < 500px)`),
    ).toBe(false);
    expect(desktopMatches(`(width < 768px) or (height <= ${height}px)`)).toBe(
      true,
    );
  });

  it('answers the forms it read before as before', () => {
    expect(desktopMatches(`(max-width: ${width - 1}px)`)).toBe(false);
    expect(desktopMatches(`(min-width: ${width}px)`)).toBe(true);
    expect(desktopMatches('(width < 640px)')).toBe(false);
    expect(desktopMatches(`(400px < width <= ${width}px)`)).toBe(true);
    expect(desktopMatches('screen and (min-width: 1024px)')).toBe(true);
    expect(desktopMatches('only screen and (min-width: 1024px)')).toBe(true);
    expect(desktopMatches('print')).toBe(false);
    expect(desktopMatches('print, (min-width: 1024px)')).toBe(true);
    expect(desktopMatches('not all and (max-width: 640px)')).toBe(true);
    expect(desktopMatches('not all and (pointer: coarse)')).toBe(true);
    expect(
      desktopMatches('not all and (min-width: 768px) and (min-height: 500px)'),
    ).toBe(false);
    expect(desktopMatches('(width < 768px), (height < 500px)')).toBe(false);
    expect(desktopMatches('(hover: hover) and (pointer: fine)')).toBe(true);
  });

  it('lets a feature the window does not judge hold, unless sure', () => {
    expect(desktopMatches('(prefers-reduced-motion: reduce)')).toBe(true);
    expect(
      desktopMatches('(prefers-reduced-motion: reduce)', {sure: true}),
    ).toBe(false);
    expect(desktopMatches('not all and (prefers-reduced-motion: reduce)')).toBe(
      false,
    );
    expect(
      desktopMatches(
        '(min-width: 1024px) or (prefers-reduced-motion: reduce)',
        {
          sure: true,
        },
      ),
    ).toBe(true);
    expect(
      desktopMatches(
        '(not ((prefers-reduced-motion: reduce) and (min-width: 768px)))',
        {sure: true},
      ),
    ).toBe(false);
  });

  it('never matches a media type followed by a condition with `or` at its top level', () => {
    expect(
      desktopMatches('screen and (max-width: 640px) or (min-width: 1024px)'),
    ).toBe(false);
    expect(
      desktopMatches(
        'not screen and (max-width: 640px) or (min-width: 1024px)',
      ),
    ).toBe(false);
    expect(
      desktopMatches(
        'screen and (max-width: 640px) or (min-width: 1024px), (min-width: 1024px)',
      ),
    ).toBe(true);
    expect(
      desktopMatches('screen and ((max-width: 640px) or (min-width: 1024px))'),
    ).toBe(true);
    expect(desktopMatches('screen and not (max-width: 640px)')).toBe(true);
    expect(
      desktopMatches('not print and (max-width: 640px) or (min-width: 1024px)'),
    ).toBe(false);
    expect(
      desktopMatches(
        'not speech and (max-width: 640px) or (min-width: 1024px)',
      ),
    ).toBe(false);
    expect(
      desktopMatches(
        'screen and not (min-width: 640px) or (min-width: 1024px)',
      ),
    ).toBe(false);
    expect(
      desktopMatches(
        'not screen and not (min-width: 640px) or (min-width: 1024px)',
      ),
    ).toBe(false);
    expect(
      desktopMatches(
        'screen and (min-width: 640px) and (min-width: 800px) or (pointer: coarse)',
      ),
    ).toBe(false);
    expect(desktopMatches('not print and (max-width: 640px)')).toBe(true);
  });

  it('never matches `and` or `or` written straight against `(`, and reads `not(…)` as an unknown group', () => {
    expect(desktopMatches('not(min-width: 2000px)')).toBe(false);
    expect(desktopMatches('(not(min-width: 2000px))')).toBe(false);
    expect(desktopMatches('screen and not(min-width: 2000px)')).toBe(false);
    expect(desktopMatches('(max-width: 640px) or(min-width: 1024px)')).toBe(
      false,
    );
    expect(desktopMatches('(min-width: 640px) and(min-width: 800px)')).toBe(
      false,
    );
    expect(
      desktopMatches('(max-width: 640px) or(min-width: 1024px), screen'),
    ).toBe(true);
    expect(desktopMatches('not(min-width: 768px) or (min-width: 1024px)')).toBe(
      true,
    );
    expect(
      desktopMatches('(min-width: 1024px) or (not(min-width: 768px))'),
    ).toBe(true);
    expect(
      desktopMatches('(min-width: 1024px) and not(min-width: 768px)'),
    ).toBe(false);
  });

  it('reads text it cannot parse as before', () => {
    expect(desktopMatches('(min-width: 1024px) and')).toBe(true);
    expect(desktopMatches('((min-width: 1024px)')).toBe(true);
    expect(
      desktopMatches(
        '(min-width: 1024px) and (max-width: 2000px) or (pointer: coarse)',
      ),
    ).toBe(false);
  });
});
