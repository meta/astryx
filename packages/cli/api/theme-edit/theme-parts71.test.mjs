// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A part's text made transparent by an amount is its text color's alpha;
 * states typed by their prop or ARIA name; several states at once where
 * the element takes them, in one order; a one-mode border on a part that
 * draws one in that state; a divider's line per variant, fainter, hidden,
 * thicker. Against real bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditHow,
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
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

/** @type {string} */
let cwd;

/** Why a bundled theme could not be built here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-parts71-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {import('vitest').TestContext} ctx */
const needBases = ctx => {
  if (!unbuilt) return false;
  console.warn(`skipped: ${unbuilt}`);
  ctx.skip();
  return true;
};

/** The first answer's commands, bare. @param {string} q @param {string} theme */
const top = async (q, theme) => {
  const {data} = await themeEditHow(q, {cwd, theme});
  const r = (data.results ?? []).find(x =>
    x.commands.some(c => / editor (set|undo) /.test(c)),
  );
  return {
    text: (data.results ?? []).map(x => x.text).join('\n'),
    commands: (r?.commands ?? []).map(c => c.replace(/^.*? editor /, '')),
  };
};

describe("a part's text made transparent by an amount", () => {
  it('is its text colors at that alpha, never the whole part faded', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('x', {cwd, like: 'neutral'});
    const r = await top('make the button text 50% transparent', 'x');
    expect(r.commands.length).toBeGreaterThan(0);
    expect(r.commands.join(' ')).not.toMatch(/\bopacity\b/);
    for (const c of r.commands)
      expect(c).toMatch(/^set x color '#[0-9a-f]{6}80' --on button /);
    const card = await top(
      'make the fainter text in cards 50% transparent',
      'x',
    );
    expect(card.commands.join(' ')).not.toMatch(/\bopacity\b/);
    expect(card.commands[0]).toMatch(
      /^set x --color-text-primary '#[0-9a-f]{6}80' --on card --mode light$/,
    );
  }, 240_000);
});

describe('a state typed by its prop or ARIA name', () => {
  it('is the state of that name', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('n', {cwd, like: 'neutral'});
    for (const [on, state, saved] of [
      ['button', 'isPressed', 'pressed'],
      ['button', 'aria-expanded', 'expanded'],
      ['tab', 'isSelected', 'selected'],
    ]) {
      const r = await themeEditSet('n', 'background-color', '#ff0000', {
        cwd,
        on,
        state,
      });
      expect(r.data.setting).toMatchObject({on, state: saved});
    }
  }, 240_000);
});

describe('several states at once', () => {
  it('takes a hovered selected tab, in one order, and undoes it in either', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('t', {cwd, like: 'neutral'});
    expect(
      (await top('make hovered selected tabs blue', 't')).commands,
    ).toEqual([
      "set t background-color '#2563eb' --on tab --state hover+selected",
    ]);
    await themeEditSet('t', 'background-color', '#ff0000', {
      cwd,
      on: 'tab',
      state: 'hover+selected',
    });
    await themeEditSet('t', 'background-color', '#0000ff', {
      cwd,
      on: 'tab',
      state: 'selected+hover',
    });
    const saved = (await themeEditShow('t', {cwd})).data.settings.filter(
      (/** @type {any} */ x) => x.on === 'tab',
    );
    expect(saved).toEqual([
      expect.objectContaining({state: 'selected+hover', value: '#0000ff'}),
    ]);
    await themeEditUndo('t', {
      cwd,
      thing: 'background-color',
      on: 'tab',
      state: 'hover+selected',
    });
    expect(
      (await themeEditShow('t', {cwd})).data.settings.some(
        (/** @type {any} */ x) => x.on === 'tab',
      ),
    ).toBe(false);
    const r = await refusal(() =>
      themeEditSet('t', 'background-color', '#ff0000', {
        cwd,
        on: 'checkbox-indicator',
        state: 'checked+hover',
      }),
    );
    expect(r.code).toBe('ERR_THEME_UNKNOWN_STATE');
  }, 240_000);
});

describe('a one-mode border on a part that draws one in that state', () => {
  it("is that state's border color alone, the other mode's focus ring kept", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('f', {cwd, like: 'neutral'});
    expect(
      (await top('make the focused border of inputs blue in dark mode', 'f'))
        .commands,
    ).toEqual([
      "set f border-color '#2563eb' --on inputs --state focus-within --mode dark",
    ]);
  }, 240_000);
});

describe("a divider's line", () => {
  it('fades and hides every variant, and thickens the variant said', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('d', {cwd, like: 'neutral'});
    const faint = await top('make dividers fainter', 'd');
    expect(faint.commands.join(' ')).toMatch(/--color-border-emphasized/);
    expect((await top('hide the dividers', 'd')).commands).toEqual([
      'set d --color-border transparent --on divider',
      'set d --color-border-emphasized transparent --on divider',
    ]);
    expect((await top('make subtle dividers thicker', 'd')).commands).toEqual([
      'set d --border-width 2px --on divider --when variant:subtle',
    ]);
  }, 240_000);
});
