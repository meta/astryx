// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The answer check of `editor how`, seen in answers: a suggested
 * command makes the kind of change the words ask for, moves the way they
 * say from the value there now, and reaches none for a removal (the
 * measured check, theme-hunt87, covers the rest).
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

describe('the answer check in answers', () => {
  beforeAll(async () => {
    cwd = makeLinkedFixture('astryx-theme-hunt78b-', FIXTURE_PACKAGES);
    writeFixtureBaseTheme(cwd, 'neutral');
    await themeEditNew('q', {cwd, like: 'neutral'});
  }, 240_000);
  afterAll(() => removeLinkedFixture(cwd));

  /** Every set command in every answer. @param {string} q */
  const commands = async q => {
    const {data} = await themeEditHow(q, {cwd, theme: 'q'});
    return (data.results ?? [])
      .flatMap(r => r.commands)
      .filter(c => / editor set /.test(c))
      .map(c => c.replace(/^.* editor /, ''));
  };

  it.each(
    /** @type {Array<[string, RegExp]>} */ ([
      ['make the badge text all caps and smaller', /font-size .+ --on badge/],
      ['remove the top border on cards', /^set q border-top none --on card$/],
      ['remove shadows everywhere except dialogs', /box-shadow .+ --on dialog/],
      ['make the button background a bit lighter', /--on button/],
    ]),
  )(
    '%s still answers as asked',
    async (q, want) => {
      expect((await commands(q)).some(c => want.test(c))).toBe(true);
    },
    120_000,
  );

  it('no answer moves a corner or a text size the wrong way', async () => {
    /** @param {string} v */
    const px = v => {
      const m = /^'?(\d*\.?\d+)(px|rem)/.exec(v);
      return m ? Number(m[1]) * (m[2] === 'rem' ? 16 : 1) : null;
    };
    for (const [q, part, prop, now, dir] of /** @type {const} */ ([
      ['make the cards rounder', 'card', 'border-radius', 12, 1],
      ['make the cards sharper', 'card', 'border-radius', 12, -1],
      ['make the button text smaller', 'button', 'font-size', 14, -1],
    ])) {
      for (const c of await commands(q)) {
        const m = new RegExp(`^set q ${prop} (\\S+) --on ${part}`).exec(c);
        const v = m ? px(m[1]) : null;
        if (v != null) expect(Math.sign(v - now)).toBe(dir);
      }
    }
  }, 240_000);
});
