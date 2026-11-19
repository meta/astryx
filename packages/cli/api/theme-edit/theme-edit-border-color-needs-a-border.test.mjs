// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A border color has a line to color only where the part draws a
 * border. On a part Core draws none on in the variant and state asked (a
 * tab, a primary button, a banner), a border color, one color or one per
 * side, brings the border it needs: a transparent one at rest, as wide as
 * the theme's border width, written in the same change and named in the
 * result, so one undo takes back both. A border the theme itself sets to
 * none there is refused instead. Whether a part draws a border is read
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
    'is saved with a note where the theme sets that border to none',
    async () => {
      await themeEditSet('u', 'border', 'none', {cwd, on: 'tab'});
      const r = await themeEditSet('u', 'border-bottom-color', '#999999', {
        cwd,
        on: 'tab',
      });
      const note = r.data.notes.join('\n');
      expect(note).toContain(
        'border-bottom-color on tab does not show: u sets border none on tab',
      );
      expect(note).toContain('undo u border --on tab');
      expect(note).toContain('undo u border-bottom-color --on tab');
      expect(note).not.toContain('added a');
      // (A part Core draws a border on, an input, the same: saved, and
      // said not to show.)
      await themeEditSet('u', 'border', 'none', {cwd, on: 'inputs'});
      const inputs = await themeEditSet('u', 'border-color', '#ff0000', {
        cwd,
        on: 'inputs',
      });
      expect(inputs.data.notes.join('\n')).toContain(
        'border-color on inputs does not show: u sets border none on inputs',
      );
      for (let k = 0; k < 4; k++) await themeEditUndo('u', {cwd});
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
