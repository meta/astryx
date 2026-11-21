// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * An element named in a part that the part data draws inside it under
 * another component's name (a context menu's rows), or by a state of its
 * own (the calendar's today); a state typed with an ARIA prefix on a part
 * whose doc names it as a prop (a toggle button's aria-pressed). Against
 * real bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-elements-', FIXTURE_PACKAGES);
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

describe('an element named in a part', () => {
  it('is a part drawn inside it by its last words, or the one whose own state the words name', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('e', {cwd, like: 'neutral'});
    // (A context menu's rows are the plain dropdown menu items: a write
    // would reach every menu's, so nothing is written.)
    expect(
      (await top('make the hovered item in the context menu red', 'e'))
        .commands,
    ).toEqual([]);
    expect(
      (await top("make today's date in the calendar bold", 'e')).commands,
    ).toEqual(['set e font-weight 700 --on calendar-day --state today']);
    expect(
      (await top('make the checked indicator in checkboxes red', 'e'))
        .commands[0],
    ).toMatch(/--on checkbox-indicator --state checked --only$/);
    expect(
      (await top('make the hovered item in menus in cards red', 'e')).commands,
    ).toEqual([
      "set e background-color '#dc2626' --on dropdown-menu-item --state hover",
    ]);
    expect((await top('make the dot in radios red', 'e')).commands).toEqual([
      "set e background-color '#dc2626' --on radio-indicator-dot",
    ]);
    expect(
      (await top('make the indicator in selects red', 'e')).commands[0],
    ).toMatch(/--on selector-indicator-icon$/);
    expect(
      (await top('make the knob of switches red', 'e')).commands[0],
    ).toMatch(/--on switch-thumb$/);
    expect((await top("make the tabs' indicator green", 'e')).commands).toEqual(
      ["set e background-color '#16a34a' --on tab-indicator"],
    );
    expect(
      (await top('make the header cells in the table bold', 'e')).commands,
    ).toEqual(['set e font-weight 700 --on table-header-cell']);
    expect(
      (await top('make the close button in the dialog red', 'e')).commands[0],
    ).toMatch(/--on dialog-header-close-icon$/);
    const icons = await top("make the buttons' icons red", 'e');
    expect(icons.commands.every(x => / --on button$/.test(x))).toBe(true);
    expect(icons.commands.join(' ')).toMatch(/--color-icon-primary/);
    // A toast's close button is a part of its own: written there, never on
    // every button.
    const close = await themeEditHow('make the close button of toasts red', {
      cwd,
      theme: 'e',
    });
    const closeWrites = (close.data.results ?? [])
      .flatMap((/** @type {any} */ r) => r.commands)
      .filter((/** @type {string} */ c) => / editor set /.test(c));
    expect(closeWrites.length).toBeGreaterThan(0);
    expect(closeWrites.every(c => / --on toast-close$/.test(c))).toBe(true);
    const today = await themeEditHow(
      'make the today date in the date picker bold',
      {cwd, theme: 'e'},
    );
    expect(
      (today.data.results ?? [])
        .flatMap((/** @type {any} */ r) => r.commands)
        .filter((/** @type {string} */ c) => / editor set /.test(c)),
    ).toEqual([]);
    // (The date picker's calendar is the plain Calendar in its popover: the
    // alternative is named, changing every calendar, never offered as a
    // step.)
    expect(JSON.stringify(today.data.results)).toMatch(
      /DateInput's calendar is the plain Calendar, drawn in the layer DateInput opens.*reaches every calendar; nothing is written.*--on calendar-day --state today/,
    );
    expect(
      (await top('make the highlighted option in the selector blue', 'e'))
        .commands,
    ).toEqual([
      "set e background-color '#2563eb' --on selector-option-row --state highlighted",
    ]);
  }, 240_000);
});

describe('several states at once', () => {
  it('takes a pressed toggle button hovered, and a checked and disabled box said together', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('s', {cwd, like: 'neutral'});
    const r = await themeEditSet('s', 'background-color', '#ff0000', {
      cwd,
      on: 'toggle-button',
      state: 'isPressed+hover',
    });
    expect(r.data.setting).toMatchObject({state: 'isPressed+hover'});
    expect(
      (await top('make the checked and disabled checkbox gray', 's')).commands,
    ).toEqual([
      // (A gray on a surface: the theme's gray step and its mirror.)
      "set s background-color 'light-dark(#9e9e9e, #525252)' --on checkbox-indicator --state checked+disabled --only",
    ]);
  }, 240_000);
});

describe('a variant that never reads the token set', () => {
  it('offers the line with the state and the mode asked', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('v', {cwd, like: 'neutral'});
    const e = await refusal(() =>
      themeEditSet('v', '--color-border', '#ff0000', {
        cwd,
        on: 'divider',
        when: 'variant:strong',
        mode: 'dark',
      }),
    );
    expect(e.run.join(' ')).toMatch(
      /--color-border-emphasized '#ff0000' --on divider --when variant:strong --mode dark/,
    );
  }, 240_000);
});

describe("a menu's separator", () => {
  it('is colored through the token its line reads', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('m', {cwd, like: 'neutral'});
    // (The menu's own divider draws its line from --color-border: the token
    // set on it holds for the menu's separators only.)
    expect(
      (await top("make the dropdown menu's separators red", 'm')).commands,
    ).toEqual(["set m --color-border '#dc2626' --on dropdown-menu-divider"]);
    expect((await top('make the menu separators red', 'm')).commands).toEqual([
      "set m --color-border '#dc2626' --on dropdown-menu-divider",
    ]);
  }, 240_000);
});

describe('a state typed with an ARIA prefix', () => {
  it("is a toggle button's own pressed state", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('a', {cwd, like: 'neutral'});
    const r = await themeEditSet('a', 'background-color', '#ff0000', {
      cwd,
      on: 'toggle-button',
      state: 'aria-pressed',
    });
    expect(r.data.setting).toMatchObject({state: 'isPressed'});
  }, 240_000);
});

describe('a part named in the value', () => {
  it('offers the value on that part when --on is missing', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('l', {cwd, like: 'neutral'});
    const r = await refusal(() =>
      themeEditSet('l', 'background-color', 'card: #eeeeee', {cwd}),
    );
    expect(r.code).toBe('ERR_MISSING_ARGUMENT');
    expect(r.run[0]).toMatch(/ set l background-color '#eeeeee' --on card$/);
  }, 240_000);
});
