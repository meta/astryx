// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A whole-theme color said once covers both modes: a border ("1px
 * #ccc borders") at its twin as far off the dark page, a link color the
 * dark page leaves under 4.5:1 at its twin that reads there. A border also
 * reaches the surfaces, fields and controls Core draws with none, never a
 * small box nor the layout frame.
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

/** @type {string} */
let cwd;
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-border-once-', FIXTURE_PACKAGES);
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

/** The first answer's commands, bare. @param {string} q @param {string} [theme] */
const commands = async (q, theme = 'bo') => {
  const {data} = await themeEditHow(q, {cwd, theme});
  return /** @type {string[]} */ (data.results?.[0]?.commands ?? []).map(c =>
    c.replace(/^.*? theme editor /, ''),
  );
};

describe('a whole-theme border said once', () => {
  it('covers both modes, the dark one off the dark page', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('bo', {cwd, like: 'neutral'});
    const cmds = (await commands('borders 1px #ccc')).join('\n');
    expect(cmds).not.toMatch(/--color-border(?:-emphasized)? \S+ --mode light/);
    // (Neutral's dark page is #1b1b1b; #ccc stands 1.6:1 off white, so the
    // dark border is the first gray that stands as far off #1b1b1b.)
    expect(cmds).toMatch(
      /set bo --color-border 'light-dark\(#ccc, #(?!1b1b1b)[0-9a-f]{6}\)'/,
    );
    // A color off the grays takes its twin too.
    expect((await commands('border color #ffd6e0')).join('\n')).toMatch(
      /--color-border 'light-dark\(#ffd6e0, #[0-9a-f]{6}\)'/,
    );
  }, 240_000);

  it('reaches the surfaces, fields and controls drawn with none', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('br', {cwd, like: 'neutral'});
    const cmds = await commands('1px #ccc borders', 'br');
    /** @param {string} part */
    const bordered = part =>
      cmds.some(c =>
        new RegExp(`^set br border '1px solid .* --on ${part}$`).test(c),
      );
    for (const part of ['button', 'table', 'popover', 'dropdown-menu'])
      expect(bordered(part), part).toBe(true);
    for (const part of ['badge', 'layout-header', 'avatar', 'collapsible'])
      expect(bordered(part), part).toBe(false);
    // A muted card (a neutral look Core draws borderless) takes it; a hue's
    // look keeps its own.
    // (A muted card draws its selection in its border too, with no color
    // of its own at rest, so it is left; a muted clickable card is not.)
    expect(
      cmds.some(x => / --on clickable-card --when variant:muted$/.test(x)),
    ).toBe(true);
    expect(cmds.some(x => /--on card --when variant:blue/.test(x))).toBe(false);
    // Flat surfaces said with it: the cards keep a border too.
    expect(
      (
        await themeEditHow(
          'Surface: flat, subtle shadow only on overlays. Edges: 6px corners, 1px #d0d7de borders.',
          {cwd, theme: 'br'},
        )
      ).data.results
        .flatMap((/** @type {{commands: string[]}} */ r) => r.commands)
        .some((/** @type {string} */ x) =>
          /border-width 1px --on card$/.test(x),
        ),
    ).toBe(true);
    // A selectable card draws its box only when selected, in the accent:
    // it keeps that.
    expect(
      (
        await themeEditHow(
          'Surface: flat. Edges: 6px corners, 1px #d0d7de borders.',
          {cwd, theme: 'br'},
        )
      ).data.results
        .flatMap((/** @type {{commands: string[]}} */ r) => r.commands)
        .some((/** @type {string} */ x) => / --on selectable-card$/.test(x)),
    ).toBe(false);
    // A card draws its selection in its border: it takes the width and
    // style alone, so the accent stays when selected.
    const flat = (
      await themeEditHow(
        'Surface: flat. Edges: 6px corners, 1px #d0d7de borders.',
        {cwd, theme: 'br'},
      )
    ).data.results.flatMap(
      (/** @type {{commands: string[]}} */ r) => r.commands,
    );
    expect(
      flat.some((/** @type {string} */ x) =>
        /border-width 1px --on card$/.test(x),
      ),
    ).toBe(true);
    expect(
      flat.some((/** @type {string} */ x) =>
        /set br border '.*--on card$/.test(x),
      ),
    ).toBe(false);
    // "On everything" reaches at least what a plain border does.
    const all = await commands('1px #ccc borders on everything', 'br');
    for (const part of ['table', 'button', 'popover'])
      expect(
        all.some(x => new RegExp(` --on ${part}$`).test(x)),
        part,
      ).toBe(true);
    // A role word leading the ask narrows it: overlays get no button border.
    const overlays = await commands('overlays: a 1px #4d4d4d border', 'br');
    expect(overlays.some(x => / --on popover$/.test(x))).toBe(true);
    expect(overlays.some(x => / --on button$/.test(x))).toBe(false);
    // (Narrowed, it touches that role's parts only: no theme-wide border
    // tokens.)
    expect(
      /** @type {string[]} */ (overlays).filter(
        (/** @type {string} */ x) =>
          /--(?:border-width|color-border(?:-emphasized)?) /.test(x) &&
          !/ --on /.test(x),
      ),
    ).toEqual([]);
    // The ask's leading role word before "with" narrows it too, and is
    // what the border took: never "not used". One mid-ask stays unused.
    for (const q of [
      'overlays with a 1px #4d4d4d border',
      'the overlays with a 1px #4d4d4d border',
      'controls with 2px #999999 borders',
    ]) {
      const {data} = await themeEditHow(q, {cwd, theme: 'br'});
      const cmds = data.results.flatMap(
        (/** @type {{commands: string[]}} */ r) => r.commands,
      );
      const said = data.results
        .map((/** @type {any} */ r) => r.text)
        .join('\n');
      expect(said, q).not.toMatch(/not used/);
      const on = (/** @type {string} */ part) =>
        cmds.some((/** @type {string} */ x) => x.endsWith(` --on ${part}`));
      expect(
        /** @type {string[]} */ (cmds).filter(
          (/** @type {string} */ x) =>
            /--(?:border-width|color-border(?:-emphasized)?) /.test(x) &&
            !/ --on /.test(x),
        ),
        q,
      ).toEqual([]);
      if (/controls/.test(q)) {
        expect(on('button'), q).toBe(true);
        expect(on('dialog'), q).toBe(false);
        expect(
          cmds.some((/** @type {string} */ x) =>
            /--color-border-emphasized .* --on inputs\b/.test(x),
          ),
          q,
        ).toBe(true);
      } else {
        expect(on('dialog'), q).toBe(true);
        expect(on('button'), q).toBe(false);
      }
    }
    // Mid-ask too: the role word leads its own clause, so the border goes
    // to the controls alone and the corners to the whole theme.
    {
      const q = '8px corners, controls with 2px #999999 borders';
      const {data} = await themeEditHow(q, {cwd, theme: 'br'});
      const cmds = data.results.flatMap(
        (/** @type {{commands: string[]}} */ r) => r.commands,
      );
      const on = (/** @type {string} */ part) =>
        cmds.some((/** @type {string} */ x) => x.endsWith(` --on ${part}`));
      expect(on('button'), q).toBe(true);
      expect(on('dialog'), q).toBe(false);
      expect(
        /** @type {string[]} */ (cmds).filter(
          (/** @type {string} */ x) =>
            /--(?:border-width|color-border(?:-emphasized)?) /.test(x) &&
            !/ --on /.test(x),
        ),
        q,
      ).toEqual([]);
      expect(cmds.join('\n'), q).toMatch(/corners|radius/);
      expect(
        data.results.map((/** @type {any} */ r) => r.text).join('\n'),
        q,
      ).not.toMatch(/not used/);
    }
    // A role word with a border named in words ("black") narrows it too;
    // one the border does not read ("overlays with a soft shadow, 1px …
    // borders") keeps main's reading and is named as not used.
    {
      const {data} = await themeEditHow('controls with 2px black borders', {
        cwd,
        theme: 'br',
      });
      const cmds = data.results.flatMap(
        (/** @type {{commands: string[]}} */ r) => r.commands,
      );
      expect(
        cmds.some((/** @type {string} */ x) => x.endsWith(' --on dialog')),
      ).toBe(false);
      expect(
        data.results.map((/** @type {any} */ r) => r.text).join('\n'),
      ).not.toMatch(/not used/);
    }
    {
      const {data} = await themeEditHow(
        'overlays with a soft shadow, 1px #cccccc borders',
        {cwd, theme: 'br'},
      );
      expect(
        data.results.map((/** @type {any} */ r) => r.text).join('\n'),
      ).toMatch(/not used: [^\n]*"overlays"/);
    }
    // A narrowed wider border sets the parts' own edge: the dividers inside
    // keep their width (no border-width token anywhere).
    for (const q of [
      'surfaces with 2px #cccccc borders',
      'controls with 2px #999999 borders',
    ]) {
      const {data} = await themeEditHow(q, {cwd, theme: 'br'});
      const cmds = data.results.flatMap(
        (/** @type {{commands: string[]}} */ r) => r.commands,
      );
      expect(
        cmds.filter((/** @type {string} */ x) => / --border-width /.test(x)),
        q,
      ).toEqual([]);
      expect(
        data.results.map((/** @type {any} */ r) => r.text).join('\n'),
        q,
      ).toMatch(/dividers inside these parts keep their width/);
    }
    // A word that names no part takes the whole-theme border, named unused.
    {
      const q = '8px corners, wobbles with 2px #999999 borders';
      const {data} = await themeEditHow(q, {cwd, theme: 'br'});
      const cmds = data.results.flatMap(
        (/** @type {{commands: string[]}} */ r) => r.commands,
      );
      expect(
        cmds.some((/** @type {string} */ x) => x.endsWith(' --on dialog')),
        q,
      ).toBe(true);
      expect(
        data.results.map((/** @type {any} */ r) => r.text).join('\n'),
        q,
      ).toMatch(/not used: [^\n]*"wobbles"/);
    }
  }, 240_000);
});

describe('a whole-theme link color said once', () => {
  it('takes a twin in dark mode where the dark page leaves it under 4.5:1', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('lk', {cwd, like: 'neutral'});
    const {data} = await themeEditHow(
      'Color: green #1f883d primary buttons, blue #0969da links, neutral grays.',
      {cwd, theme: 'lk'},
    );
    const cmds = (data.results ?? []).flatMap(
      (/** @type {{commands: string[]}} */ r) => r.commands,
    );
    const m = cmds
      .map(c =>
        /--color-text-accent 'light-dark\(#0969da, (#[0-9a-f]{6})\)'$/.exec(c),
      )
      .find(Boolean);
    expect(m, cmds.join('\n')).toBeTruthy();
    // (The twin reads at 4.5:1 on the dark page, #1b1b1b on neutral.)
    const lum = (/** @type {string} */ h) => {
      const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
      const [r, g, b] = c.map(x =>
        x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4,
      );
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    expect(
      (lum(/** @type {RegExpExecArray} */ (m)[1]) + 0.05) /
        (lum('#1b1b1b') + 0.05),
    ).toBeGreaterThanOrEqual(4.5);
    // (In light mode, on the muted accent fill an applied preset draws, it
    // reads under 4.5:1: named, the color kept as asked.)
    expect(data.results[0].text).toMatch(
      /on the muted accent fill .* in light mode/,
    );
    // (One kept to dark mode is never named for the light fill, and a
    // twinned border gets no light-only note.)
    const darkOnly = (await themeEditHow('links #93c5fd', {cwd, theme: 'lk'}))
      .data.results[0].text;
    expect(darkOnly).not.toMatch(/muted accent fill/);
    const border = (await themeEditHow('borders 1px #ccc', {cwd, theme: 'lk'}))
      .data.results[0].text;
    expect(border).not.toMatch(/in light mode only/);
  }, 240_000);
});
