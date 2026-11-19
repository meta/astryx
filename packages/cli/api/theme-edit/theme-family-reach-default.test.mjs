// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Family reach is the editor's default: a setting on one part reaches the
 * members of its family that draw the same thing alike, unless --only. A
 * part's own setting wins over its group's or family's whatever the order;
 * a later setting on another member of a thing the family already carries
 * is that member's drill-in; one undo takes a spread back; show says which
 * settings reach a family and which drill in. Against real bundled base
 * themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
import {context} from './_context.mjs';
import {unreadableReach} from './_edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-family-reach-', FIXTURE_PACKAGES);
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

/** @param {string} theme */
const cssOf = theme =>
  fs.readFileSync(path.join(cwd, 'themes', theme, `${theme}.css`), 'utf8');

/** @param {string} css @param {string} part */
const ruleOf = (css, part) =>
  new RegExp(`\\.astryx-${part} \\{[^}]*\\}`).exec(css)?.[0] ?? '';

/** @param {string} theme */
const settingsOf = theme =>
  JSON.parse(
    fs.readFileSync(
      path.join(cwd, 'themes', theme, `${theme}.settings.json`),
      'utf8',
    ),
  ).settings;

const GRADIENT = 'linear-gradient(#ffffff, #e6e6e6)';

describe('family reach by default', () => {
  it('a look set on one member reaches the members drawn alike; --only keeps it to the member', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('r', {cwd, like: 'neutral'});
    const r = await themeEditSet('r', 'background-image', GRADIENT, {
      cwd,
      on: 'button',
    });
    expect(r.data.group?.name).toBe('button-like');
    expect(r.data.parts).toEqual(
      expect.arrayContaining(['button', 'toggle-button']),
    );
    expect(r.data.group?.only).toMatch(/--on button --only$/);
    expect(r.data.notes.join(' ')).toMatch(
      /reaches button's family \(button-like\).*toggle-button.*--only/,
    );
    // (A toggle button is drawn on its Button: the button's entry reaches it
    // there, and no entry of its own would block later button looks.)
    expect(ruleOf(cssOf('r'), 'button')).toContain(GRADIENT);
    expect(ruleOf(cssOf('r'), 'toggle-button')).not.toContain(GRADIENT);
    // One undo takes the spread back from every part it reached.
    await themeEditUndo('r', {cwd});
    expect(ruleOf(cssOf('r'), 'button')).not.toContain(GRADIENT);
    const only = await themeEditSet('r', 'background-image', GRADIENT, {
      cwd,
      on: 'button',
      only: true,
    });
    expect(only.data.parts).toEqual(['button']);
    expect(only.data.group).toBeNull();
    expect(ruleOf(cssOf('r'), 'toggle-button')).not.toContain(GRADIENT);
  }, 240_000);

  it("a member's own setting wins over the family's, set before or after", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('o', {cwd, like: 'neutral'});
    // Before: the toggle button's own, then the family's from the button.
    await themeEditSet('o', 'background-image', 'linear-gradient(red, blue)', {
      cwd,
      on: 'toggle-button',
      only: true,
    });
    const r = await themeEditSet('o', 'background-image', GRADIENT, {
      cwd,
      on: 'button',
    });
    expect(r.data.group?.kept).toEqual(['toggle-button']);
    expect(r.data.parts).not.toContain('toggle-button');
    expect(r.data.notes.join(' ')).toMatch(/toggle-button keeps its own/);
    const css = cssOf('o');
    expect(ruleOf(css, 'button')).toContain(GRADIENT);
    expect(ruleOf(css, 'toggle-button')).toContain(
      'linear-gradient(red, blue)',
    );
  }, 240_000);

  it('a later setting on another member is its drill-in; undo gives it the family look back', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('d', {cwd, like: 'neutral'});
    await themeEditSet('d', 'background-image', GRADIENT, {cwd, on: 'button'});
    const drill = await themeEditSet(
      'd',
      'background-image',
      'linear-gradient(red, blue)',
      {cwd, on: 'toggle-button'},
    );
    expect(drill.data.setting.only).toBe(true);
    expect(drill.data.parts).toEqual(['toggle-button']);
    expect(drill.data.notes.join(' ')).toMatch(
      /toggle-button keeps this on its own \(saved with --only\).*undo d && .* set d background-image .* --on button\b/,
    );
    // The family keeps the button's look everywhere else.
    expect(settingsOf('d')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({on: 'button', value: GRADIENT}),
        expect.objectContaining({on: 'toggle-button', only: true}),
      ]),
    );
    const show = await themeEditShow('d', {cwd});
    const entry = (/** @type {string} */ on) =>
      show.data.settings.find(
        (/** @type {any} */ s) => s.on === on && s.thing === 'background-image',
      );
    expect(entry('button')?.reach).toEqual(
      expect.objectContaining({family: 'button-like', kept: ['toggle-button']}),
    );
    expect(entry('toggle-button')?.reach).toEqual(
      expect.objectContaining({family: 'button-like', drillIn: true}),
    );
    expect(entry('toggle-button')?.reach?.over).toMatch(/on button\b/);
    const undo = await themeEditUndo('d', {
      thing: 'background-image',
      cwd,
      on: 'toggle-button',
      only: true,
    });
    expect(undo.data.now).toMatch(/background-image = .*on button\b/);
    // (Back to the button's entry, which reaches it on its element.)
    expect(ruleOf(cssOf('d'), 'toggle-button')).not.toContain(
      'linear-gradient(red, blue)',
    );
    expect(ruleOf(cssOf('d'), 'button')).toContain(GRADIENT);
  }, 240_000);

  it("a drill-in's whole-family lines give the family the new look", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('dw', {cwd, like: 'neutral'});
    await themeEditSet('dw', 'background-image', GRADIENT, {cwd, on: 'button'});
    await themeEditSet('dw', 'background-image', 'linear-gradient(red, blue)', {
      cwd,
      on: 'toggle-button',
    });
    // (The lines the note gives, run in order.)
    await themeEditUndo('dw', {cwd});
    await themeEditSet('dw', 'background-image', 'linear-gradient(red, blue)', {
      cwd,
      on: 'button',
    });
    const looks = settingsOf('dw').filter(
      (/** @type {any} */ s) => s.thing === 'background-image',
    );
    expect(looks).toEqual([
      expect.objectContaining({
        on: 'button',
        value: 'linear-gradient(red, blue)',
      }),
    ]);
    expect(ruleOf(cssOf('dw'), 'button')).toContain(
      'linear-gradient(red, blue)',
    );
    expect(cssOf('dw')).not.toContain(GRADIENT);
  }, 240_000);

  it("a menu row's hover look reaches each list option in the state that draws the row the pointer is on", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('h', {cwd, like: 'neutral'});
    const look = 'linear-gradient(#eeeeee, #dddddd)';
    const r = await themeEditSet('h', 'background-image', look, {
      cwd,
      on: 'dropdown-menu-item',
      state: 'focus',
    });
    expect(r.data.parts).toEqual(expect.arrayContaining(['typeahead-option']));
    // (A typeahead option draws that row as highlighted, never on focus.)
    const css = cssOf('h');
    const rule = new RegExp(
      `\\.astryx-typeahead-option\\[data-highlighted[^{]*\\{[^}]*${look.replace(/[()#,]/g, '\\$&')}`,
    );
    expect(css).toMatch(rule);
  }, 240_000);

  it('a button look names every button drawn inside another component, each with the line that keeps it', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('e', {cwd, like: 'neutral'});
    // (Every part whose element the census drew as a button too.)
    const {C} = /** @type {any} */ (await context(cwd));
    const drawnAsButton = Object.entries(C.MAP)
      .filter(([, rec]) =>
        /** @type {any} */ (rec.drawnAs ?? []).includes('button'),
      )
      .map(([part]) => part);
    expect(drawnAsButton).toEqual(
      expect.arrayContaining(['calendar-nav', 'code-block-copy-button']),
    );
    const r = await themeEditSet('e', 'background-image', GRADIENT, {
      cwd,
      on: 'button',
      only: true,
    });
    const named = (r.data.embedded ?? []).map((/** @type {any} */ x) => x.part);
    expect([...named].sort()).toEqual([...drawnAsButton].sort());
    for (const x of r.data.embedded ?? [])
      expect(x.keep).toMatch(
        new RegExp(`set e background-image \\S+ --on ${x.part}( --only)?$`),
      );
    expect(r.data.notes.join(' ')).toMatch(/also reaches .*calendar-nav/);
    // Its line keeps the part as Core draws it: named no more.
    const keep = /** @type {any} */ (r.data.embedded).find(
      (/** @type {any} */ x) => x.part === 'calendar-nav',
    );
    const value = /set e background-image (\S+) --on/.exec(keep.keep)?.[1];
    await themeEditSet('e', 'background-image', String(value), {
      cwd,
      on: 'calendar-nav',
    });
    const again = await themeEditSet(
      'e',
      'background-image',
      'linear-gradient(#ffffff, #dddddd)',
      {
        cwd,
        on: 'button',
        only: true,
      },
    );
    expect(
      (again.data.embedded ?? []).map((/** @type {any} */ x) => x.part),
    ).not.toContain('calendar-nav');
  }, 240_000);

  it('a hover look reaches each member on hover and in the state it draws that moment in', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('hv', {cwd, like: 'neutral'});
    const look = 'linear-gradient(#eeeeee, #dddddd)';
    await themeEditSet('hv', 'background-image', look, {
      cwd,
      on: 'dropdown-menu-item',
      state: 'hover',
    });
    const css = cssOf('hv');
    const esc = look.replace(/[()#,]/g, '\\$&');
    expect(css).toMatch(
      new RegExp(`\\.astryx-typeahead-option:hover[^{]*\\{[^}]*${esc}`),
    );
    expect(css).toMatch(
      new RegExp(
        `\\.astryx-typeahead-option\\[data-highlighted[^{]*\\{[^}]*${esc}`,
      ),
    );
  }, 240_000);

  it('a text color set beside a fill goes only where that fill goes', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('tx', {cwd, like: 'neutral'});
    const fill = await themeEditSet('tx', 'background-color', '#0069d6', {
      cwd,
      on: 'side-nav-item',
      state: 'selected',
    });
    const text = await themeEditSet('tx', 'color', '#ffffff', {
      cwd,
      on: 'side-nav-item',
      state: 'selected',
    });
    for (const p of text.data.parts) expect(fill.data.parts).toContain(p);
  }, 240_000);

  it('a see-through color stays on the part: it is a tint over its own ground', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('tr', {cwd, like: 'neutral'});
    const r = await themeEditSet(
      'tr',
      'background-color',
      'rgba(0, 0, 0, 0.5)',
      {
        cwd,
        on: 'top-nav-item',
        state: 'selected',
      },
    );
    expect(r.data.parts).toEqual(['top-nav-item']);
  }, 240_000);

  it('a spread never makes text unreadable on a member it reaches', () => {
    // (Keys name a problem's parts and end with its mode.)
    const p = (/** @type {string} */ ...k) => ({key: k.join('|')});
    expect(
      unreadableReach(
        'side-nav-item',
        ['side-nav-item', 'top-nav-item', 'pagination-dot'],
        [
          p(
            'text',
            'top-nav-item',
            '',
            '',
            'top-nav-item',
            '',
            '',
            'Inbox',
            'light',
          ),
        ],
      ),
    ).toEqual(['top-nav-item']);
    // Even where the part named fails too, the member is kept out.
    expect(
      unreadableReach(
        'side-nav-item',
        ['side-nav-item', 'top-nav-item'],
        [
          p(
            'text',
            'side-nav-item',
            '',
            '',
            'side-nav-item',
            '',
            '',
            'Home',
            'light',
          ),
          p(
            'text',
            'top-nav-item',
            '',
            '',
            'top-nav-item',
            '',
            '',
            'Inbox',
            'light',
          ),
        ],
      ),
    ).toEqual(['top-nav-item']);
  });

  it('a member a spread would make unreadable keeps its own look, named, in one undo step', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('cg', {cwd, like: 'neutral'});
    // (The top nav's selected text stays dark on this blue: it is kept.)
    const r = await themeEditSet('cg', 'background-color', '#0069d6', {
      cwd,
      on: 'side-nav-item',
      state: 'selected',
    });
    expect(r.data.setting.keep).toContain('top-nav-item');
    expect(r.data.parts).not.toContain('top-nav-item');
    expect(r.data.notes.join(' ')).toMatch(
      /top-nav-item[^.]*would make text there unreadable/,
    );
    const show = await themeEditShow('cg', {cwd});
    expect(show.data.settings[0].reach?.kept).toContain('top-nav-item');
    expect(ruleOf(cssOf('cg'), 'top-nav-item')).not.toContain('#0069d6');
    // The same setting again keeps it out; one undo takes it all back.
    await themeEditSet('cg', 'background-color', '#0069d6', {
      cwd,
      on: 'side-nav-item',
      state: 'selected',
    });
    expect(settingsOf('cg')).toHaveLength(1);
    await themeEditUndo('cg', {cwd});
    expect(settingsOf('cg')).toEqual([]);
  }, 240_000);

  it.each([['primary'], ['secondary'], ['ghost']])(
    'a button gradient gives the %s variant the disabled treatment when disabled',
    async (variant, ctx) => {
      if (needBases(ctx)) return;
      const slug = `dg${variant}`;
      await themeEditNew(slug, {cwd, like: 'neutral'});
      await themeEditSet(slug, 'background', GRADIENT, {cwd, on: 'button'});
      const css = cssOf(slug);
      // (Each part it reaches takes the image off when disabled, so the
      // disabled fill shows; every variant, since the rule has no variant.)
      for (const part of ['button', 'toggle-button'])
        expect(css, part).toMatch(
          new RegExp(
            `\\.astryx-${part}[^{\\s]*:is\\(:disabled[^{]*\\{[^}]*background-image: none`,
          ),
        );
      // A disabled look of the theme's own wins.
      await themeEditSet(
        slug,
        'background-image',
        'linear-gradient(#eeeeee, #dddddd)',
        {
          cwd,
          on: 'button',
          state: 'disabled',
          when: `variant:${variant}`,
        },
      );
      expect(cssOf(slug)).toContain('linear-gradient(#eeeeee, #dddddd)');
    },
    240_000,
  );

  it('a member that draws the thing differently is left as Core draws it', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('k', {cwd, like: 'neutral'});
    // (A checkbox has small corners where a radio is round.)
    const r = await themeEditSet('k', 'border-radius', '2px', {
      cwd,
      on: 'checkbox-indicator',
    });
    expect(r.data.parts).toEqual(['checkbox-indicator']);
  }, 240_000);
});
