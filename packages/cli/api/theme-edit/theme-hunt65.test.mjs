// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The sixty-fifth pass over `astryx experimental theme editor how`
 * (chaos round 25): an exact amount of a part's scalar value is that factor
 * of what it has now; "3 times" is an amount, never a length; "double the
 * border width" is no double style; "half as round" is an amount; a quarter
 * of a padding with nothing to read is a step down; and a group's own name
 * ("checks") is a part.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt65-', FIXTURE_PACKAGES);
  await themeEditNew('t', {cwd});
  for (const [prop, value, on] of [
    ['border-width', '3px', 'button'],
    ['letter-spacing', '0.05em', 'button'],
    ['line-height', '1.2', 'card'],
    ['opacity', '0.8', 'card'],
    ['padding', '12px', 'card'],
    ['border-radius', '10px', 'button'],
    ['max-width', '600px', 'dialog'],
    ['font-size', '14px', 'badge'],
  ])
    await themeEditSet('t', prop, value, {cwd, on});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} q */
const commands = async q => {
  const r = /** @type {any} */ (await themeEditHow(q, {cwd, theme: 't'}));
  return JSON.stringify(r.data);
};

describe('hunt65: how amounts and parts', () => {
  it.each([
    ['half the font size on badges', /set t font-size 7px --on badge/],
    ['double the line height on cards', /set t line-height 2\.4 --on card/],
    ['half the line height on cards', /set t line-height 0\.6 --on card/],
    [
      'double the letter spacing on buttons',
      /set t letter-spacing 0\.1em --on button/,
    ],
    [
      'half the letter spacing on buttons',
      /set t letter-spacing 0\.025em --on button/,
    ],
    ['half the opacity of cards', /set t opacity 0\.4 --on card/],
    ['double the dialog width', /set t max-width 1200px --on dialog/],
    ['half the dialog width', /set t max-width 300px --on dialog/],
  ])(
    'R25-A: %s',
    async (q, want) => {
      expect(await commands(q)).toMatch(want);
    },
    240_000,
  );

  it('R25-B: double the border width doubles it, with no double style or width', async () => {
    const out = await commands('double the border width on buttons');
    expect(out).toMatch(/set t border-width 6px --on button/);
    expect(out).not.toMatch(/double var|set t width|max-width/);
  }, 240_000);

  it('R25-D: half/twice as round is an amount of the radius there now', async () => {
    expect(await commands('make buttons half as round')).toMatch(
      /set t border-radius 5px --on button/,
    );
    expect(await commands('make buttons twice as round')).toMatch(
      /set t border-radius 20px --on button/,
    );
  }, 240_000);

  it('R25-E: N times and N% bigger are amounts, never a length or a percent', async () => {
    expect(await commands('make card padding 3 times bigger')).toMatch(
      /set t padding 36px --on card/,
    );
    expect(await commands('make card padding 25% bigger')).toMatch(
      /set t padding 15px --on card/,
    );
    expect(await commands('make button corners 1.5 times bigger')).toMatch(
      /set t border-radius 15px --on button/,
    );
  }, 240_000);

  it('R25-H: a quarter of a gap with nothing to read is a step down, said so', async () => {
    const out = await commands('a quarter of the gap on cards');
    expect(out).toMatch(/set t spacing less --on card/);
    expect(out).toMatch(/one step, not an exact amount/);
  }, 240_000);

  it('R25-J: a group named by its own word is a part', async () => {
    expect(await commands('half the corner radius on checks')).toMatch(
      /--on checks/,
    );
    expect(await commands('remove shadows from checks')).toMatch(
      /set t box-shadow none --on checks/,
    );
  }, 240_000);

  it('R25-C: an amount with a state scales that state, and keeps it', async () => {
    await themeEditSet('t', 'border-radius', '6px', {
      cwd,
      on: 'button',
      state: 'hover',
    });
    await themeEditSet('t', 'padding', '8px', {
      cwd,
      on: 'button',
      state: 'hover',
    });
    expect(
      await commands('half the corner radius on buttons on hover'),
    ).toMatch(/set t border-radius 3px --on button --state hover/);
    expect(
      await commands('double the padding on buttons when hovered'),
    ).toMatch(/set t padding 16px --on button --state hover/);
  }, 240_000);

  it("R25-F: a dialog's header is the dialog header, never the app's top bar", async () => {
    const out = await commands('make the dialog header background red');
    expect(out).toMatch(/--on dialog-header/);
    expect(out).not.toMatch(/app-shell-header/);
    expect(await commands('double the padding in the card footer')).not.toMatch(
      /layout-footer/,
    );
  }, 240_000);

  it('R25-G: the excepted part keeps the value it has now', async () => {
    expect(
      await commands('double the corner radius of everything except cards'),
    ).not.toMatch(/border-radius 0\.625rem --on card/);
  }, 240_000);
});
