// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A border color has a line to color only where the part draws a
 * border. On a part Core draws none on in the variant and state asked (a
 * tab, a primary button, a banner), a border color, one color or one per
 * side, brings the border it needs: a transparent one at rest, as wide as
 * the theme's border width, written in the same change and named in the
 * result, so one undo takes back both.
 * Where the theme itself turns the whole border off, the color is refused,
 * naming the none and its undo; a none on one side or in a list of values
 * is no conflict: the border comes before the part's own settings. Whether a part draws a border is read
 * one way for set and how: drawsLine, by the variant asked, with a side
 * cleared only on the first or last child still drawn on the others.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditHow,
  themeEditNew,
  themeEditSet,
  themeEditUndo,
} from './theme-edit.mjs';
import {context} from './_context.mjs';
import {apply, checked, howTheme} from './_how-commands.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {drawsLine} from './_check.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

const T = 240_000;
const EDGE = 'var(--border-width) solid transparent';

/** @type {string} */
let cwd;

const css = () => fs.readFileSync(path.join(cwd, 'themes/t/t.css'), 'utf8');

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-border-needs-line-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
  await themeEditNew('h', {cwd, like: 'neutral'});
  await themeEditNew('u', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a border color on a part that draws no border', () => {
  it(
    'brings the border it needs, named, a color per side too',
    async () => {
      const r = await themeEditSet(
        't',
        'border-color',
        '#eeeeee #eeeeee #dddddd',
        {cwd, on: 'tab', state: 'hover'},
      );
      expect(r.data.notes.join('\n')).toContain(
        `added a 1px border to tab so the color shows: tab drew none there; border = ${EDGE} on tab`,
      );
      // What the added width moves is measured every time (said, or why
      // it was not).
      expect(r.data.notes.join('\n')).toMatch(
        /tab (?:grows by|keeps its size)|the size change the added border makes on tab was not measured/,
      );
      expect(css()).toMatch(
        new RegExp(
          `\\.astryx-tab \\{\\s*border: ${EDGE.replace(/[()]/g, '\\$&')};`,
        ),
      );
      expect(css()).toContain('border-color: #eeeeee #eeeeee #dddddd;');
    },
    T,
  );

  it(
    "keeps a state's own colors after the border the build repeats there",
    async () => {
      await themeEditSet('t', 'border-color', '#dddddd #dddddd transparent', {
        cwd,
        on: 'tab',
        state: 'selected',
      });
      const rule = /\.astryx-tab\[data-selected="selected"\] \{([^}]*)\}/g;
      const blocks = [...css().matchAll(rule)].map(m => m[1]);
      // One rule for the selected tab: the border first, its colors after.
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toContain(`border: ${EDGE};`);
      expect(blocks[0].indexOf('border:')).toBeLessThan(
        blocks[0].indexOf('border-color: #dddddd #dddddd transparent;'),
      );
    },
    T,
  );

  it(
    'reads the variant asked: a primary button draws none, one side or all',
    async () => {
      const r = await themeEditSet(
        't',
        'border-bottom-color',
        'rgba(0, 0, 0, 0.25)',
        {cwd, on: 'button', when: 'variant:primary'},
      );
      expect(r.data.notes.join('\n')).toContain(
        'added a 1px border to button when variant:primary so the color shows',
      );
      // A part that draws one is left as it is: inputs.
      const inputs = await themeEditSet(
        't',
        'border-color',
        '#cccccc #cccccc #999999',
        {cwd, on: 'inputs'},
      );
      expect(inputs.data.notes.join('\n')).not.toContain('added a');
      expect(css()).toContain('border-color: #cccccc #cccccc #999999;');
    },
    T,
  );

  it(
    'is taken back with its border by one undo',
    async () => {
      const onPart = () =>
        JSON.parse(
          fs.readFileSync(path.join(cwd, 'themes/u/u.settings.json'), 'utf8'),
        )
          .settings.filter((/** @type {any} */ x) => x.on)
          .map((/** @type {any} */ x) => x.thing);
      await themeEditSet('u', 'border-color', '#ff0000', {cwd, on: 'banner'});
      // (Both the border it brought and the color are saved.)
      expect(onPart()).toEqual(['border', 'border-color']);
      await themeEditUndo('u', {cwd});
      expect(onPart()).toEqual([]);
    },
    T,
  );

  it(
    'is refused where the theme sets that border to none',
    async () => {
      await themeEditSet('u', 'border', 'none', {cwd, on: 'tab'});
      const r = await refusal(() =>
        themeEditSet('u', 'border-bottom-color', '#999999', {cwd, on: 'tab'}),
      );
      expect(r.code).toBe('ERR_THEME_NO_EFFECT');
      expect(r.message).toContain('u sets border none on tab');
      expect(r.run).toEqual([
        expect.stringContaining('undo u border --on tab'),
      ]);
      // (A part Core draws a border on, an input, the same.)
      await themeEditSet('u', 'border', 'none', {cwd, on: 'inputs'});
      const inputs = await refusal(() =>
        themeEditSet('u', 'border-color', '#ff0000', {cwd, on: 'inputs'}),
      );
      expect(inputs.code).toBe('ERR_THEME_NO_EFFECT');
      expect(inputs.message).toContain('u sets border none on inputs');
      await themeEditUndo('u', {cwd});
      await themeEditUndo('u', {cwd});
    },
    T,
  );
});

describe('a border none read exactly', () => {
  it(
    'reads 0.5px as a width and a none for one look as that look only',
    async () => {
      await themeEditSet('u', 'border-width', '0.5px', {cwd, on: 'tab'});
      const thin = await themeEditSet('u', 'border-color', '#999999', {
        cwd,
        on: 'tab',
      });
      expect(thin.data.setting.thing).toBe('border-color');
      await themeEditUndo('u', {cwd});
      await themeEditUndo('u', {cwd});
      await themeEditSet('u', 'border', 'none', {
        cwd,
        on: 'button',
        when: 'variant:primary',
      });
      const all = await themeEditSet('u', 'border-color', '#999999', {
        cwd,
        on: 'button',
      });
      expect(all.data.setting.thing).toBe('border-color');
      await themeEditUndo('u', {cwd});
      await themeEditUndo('u', {cwd});
    },
    T,
  );
});

describe('a none that turns off only part of the border', () => {
  it(
    "is no conflict: the color is saved, with the border it needs before the part's own",
    async () => {
      for (const [thing, value] of [
        ['border-width', '0 0 1px'],
        ['border-style', 'none none solid'],
        ['border-bottom', 'none'],
        ['border-block-width', '0 1px'],
      ]) {
        await themeEditSet('u', thing, value, {cwd, on: 'tab'});
        const r = await themeEditSet('u', 'border-color', '#999999', {
          cwd,
          on: 'tab',
        });
        expect(r.data.setting.thing).toBe('border-color');
        expect(r.data.notes.join('\n')).toContain('added a');
        await themeEditUndo('u', {cwd});
        await themeEditUndo('u', {cwd});
      }
    },
    T,
  );
});

describe('a one-mode color on a part that draws no border', () => {
  it(
    'brings the border in its own mode, so the other mode keeps its line',
    async () => {
      const light = await themeEditSet('u', 'border-color', '#eeeeee', {
        cwd,
        on: 'button',
        when: 'variant:secondary',
        mode: 'light',
      });
      expect(light.data.notes.join('\n')).toContain('added a');
      const saved = JSON.parse(
        fs.readFileSync(path.join(cwd, 'themes/u/u.settings.json'), 'utf8'),
      );
      expect(
        saved.settings.find(
          (/** @type {any} */ x) => x.thing === 'border' && x.on === 'button',
        )?.mode,
      ).toBe('light');
      // (Built in the light page only: the dark page keeps its own line.)
      const built = fs.readFileSync(path.join(cwd, 'themes/u/u.css'), 'utf8');
      expect(built).toMatch(
        /scheme="light"\] \*\) \{\s*border: var\(--border-width\) solid transparent;/,
      );
      expect(built).not.toMatch(
        /scheme="dark"\] \*\) \{\s*border: var\(--border-width\) solid transparent;/,
      );
      await themeEditUndo('u', {cwd});
    },
    T,
  );
});

describe('a side width the theme sets, with no style', () => {
  it(
    'draws no line, so the color still brings its border',
    async () => {
      await themeEditSet('u', 'border-top-width', '2px', {cwd, on: 'tab'});
      const r = await themeEditSet('u', 'border-color', '#999999', {
        cwd,
        on: 'tab',
      });
      expect(r.data.notes.join('\n')).toContain('added a');
      await themeEditUndo('u', {cwd});
      await themeEditUndo('u', {cwd});
    },
    T,
  );
});

describe("how's check", () => {
  it(
    'writes a color the theme saves already after the border it brings',
    async () => {
      // (A color saved with no border, as the editor saved it before.)
      await themeEditNew('hs', {cwd, like: 'neutral'});
      const file = path.join(cwd, 'themes/hs/hs.settings.json');
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      saved.settings.push({
        thing: 'border-color',
        value: '#eeeeee',
        source: 'property',
        on: 'tab',
      });
      fs.writeFileSync(file, JSON.stringify(saved, null, 2));
      const ctx = await context(cwd);
      const d = JSON.parse(fs.readFileSync(file, 'utf8'));
      apply(/** @type {any} */ (ctx), 'hs', d, {
        verb: 'set',
        thing: 'border-color',
        value: '#dddddd',
        on: 'tab',
      });
      // (The border first, then the color: the shorthand never resets it.)
      expect(
        d.settings
          .filter((/** @type {any} */ x) => x.on === 'tab')
          .map((/** @type {any} */ x) => `${x.thing} ${x.value}`),
      ).toEqual([
        'border var(--border-width) solid transparent',
        'border-color #dddddd',
      ]);
    },
    T,
  );

  it(
    'writes the border a border color brings, as set does',
    async () => {
      const env = await howTheme(await context(cwd), cwd, 'h');
      const after = env.valueAfter(
        [
          {
            verb: 'set',
            thing: 'border-color',
            value: '#eeeeee #eeeeee #dddddd',
            on: 'tab',
          },
        ],
        'tab',
        'border',
      );
      expect(after?.light).toContain('solid transparent');
      const {refused} = checked(env, [
        [
          {
            verb: 'set',
            thing: 'border-color',
            value: '#dddddd #dddddd transparent',
            on: 'tab',
            state: 'selected',
          },
        ],
      ]);
      expect(refused).toEqual([]);
    },
    T,
  );

  it(
    "offers one side's color on a part that draws no border, as set takes it",
    async () => {
      const {data} = await themeEditHow('banner with a lighter left border', {
        cwd,
        theme: 'h',
      });
      const lines = (data.results ?? []).flatMap(
        (/** @type {any} */ r) => r.commands,
      );
      expect(lines).toContainEqual(
        expect.stringMatching(/ set h border-left-color '.+' --on banner$/),
      );
    },
    T,
  );
});

describe('whether a part draws a border', () => {
  it(
    'reads the variant asked; a side cleared on the first or last child counts',
    async () => {
      const {C} = /** @type {any} */ (await context(cwd));
      expect(drawsLine(C, ['text-input'], 'border')).toBe(true);
      expect(drawsLine(C, ['tab'], 'border')).toBe(false);
      // A side cleared only on the first or last child is drawn on the
      // others: a list row's divider, a secondary button's join.
      expect(drawsLine(C, ['list-item'], 'border')).toBe(true);
      expect(
        drawsLine(C, ['button'], 'border', null, 'variant:secondary'),
      ).toBe(true);
      expect(drawsLine(C, ['button'], 'border', null, 'variant:primary')).toBe(
        false,
      );
      expect(drawsLine(C, ['selector'], 'border', null, 'variant:input')).toBe(
        true,
      );
      expect(drawsLine(C, ['selector'], 'border', null, 'variant:ghost')).toBe(
        false,
      );
    },
    T,
  );
});

describe('a part whose side is cleared only on its last child', () => {
  it(
    'keeps its own border: a list row takes the color, no border is added',
    async () => {
      const r = await themeEditSet('t', 'border-bottom-color', '#dddddd', {
        cwd,
        on: 'list-item',
      });
      expect(r.data.notes.join('\n')).not.toContain('added a');
      expect(css()).not.toMatch(
        /\.astryx-list-item \{\s*border: var\(--border-width\) solid transparent;/,
      );
    },
    T,
  );
});

describe('a border color for every look of a part only some looks draw a border for', () => {
  it(
    'brings the border, so every look shows the color',
    async () => {
      const r = await themeEditSet('t', 'border-color', '#dddddd', {
        cwd,
        on: 'button',
      });
      expect(r.data.notes.join('\n')).toContain('added a');
      expect(css()).toMatch(
        /\.astryx-button \{\s*border: var\(--border-width\) solid transparent;/,
      );
      await themeEditUndo('t', {cwd});
    },
    T,
  );
});
