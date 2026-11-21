// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A state a part shows from the element it rides, which Core's theme
 * takes no style key for there (a list item's Item marks it selected), is
 * written as the attribute Core marks, inside the part's plain rule: the
 * build takes it with no warning, and a saved one builds the same with no
 * rewrite of the file. Another word for exactly one of a part's states
 * (pressed, where the part's press is active) is written as that state,
 * and the result says so.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditHow,
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
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
    /** @type {any} */ (await importOriginal()),
  ),
);

const T = 240_000;

/** @type {string} */
let cwd;

const file = () => path.join(cwd, 'themes/n/n.settings.json');
const saved = () => JSON.parse(fs.readFileSync(file(), 'utf8')).settings;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-state-marked-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('n', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** The build's warnings for the theme. */
const buildWarnings = async () => {
  const {themeBuild} = await import('../theme/build/build.mjs');
  const r = /** @type {any} */ (
    await themeBuild('themes/n/n.theme.ts', {}, {cwd})
  );
  return JSON.stringify(r?.data?.warnings ?? []);
};

describe('a state the part shows from the element it rides', () => {
  it(
    'set writes selected on a list item as the attribute Core marks, and the build takes it',
    async () => {
      await themeEditSet('n', 'background-color', '#e7f1ff', {
        cwd,
        on: 'list-item',
        state: 'selected',
      });
      expect(saved()).toEqual([
        expect.objectContaining({on: 'list-item', state: 'selected'}),
      ]);
      const ts = fs.readFileSync(
        path.join(cwd, 'themes/n/n.settings.ts'),
        'utf8',
      );
      expect(ts).toContain('[data-selected=\\"selected\\"]');
      expect(ts).not.toMatch(/"selected": \{/);
      expect(await buildWarnings()).not.toMatch(/Unknown prop "selected"/);
      await themeEditUndo('n', {
        cwd,
        thing: 'background-color',
        on: 'list-item',
        state: 'selected',
      });
      expect(saved()).toEqual([]);
    },
    T,
  );

  it(
    'a saved selected on a list item builds the same, with no warning and the file as saved',
    async () => {
      const data = JSON.parse(fs.readFileSync(file(), 'utf8'));
      data.settings = [
        {
          thing: 'background-color',
          value: '#e7f1ff',
          source: 'property',
          on: 'list-item',
          state: 'selected',
        },
      ];
      fs.writeFileSync(file(), `${JSON.stringify(data, null, 2)}\n`);
      const before = fs.readFileSync(file(), 'utf8');
      await themeEditShow('n', {cwd});
      expect(fs.readFileSync(file(), 'utf8')).toBe(before);
      expect(
        fs.readFileSync(path.join(cwd, 'themes/n/n.settings.ts'), 'utf8'),
      ).toContain('[data-selected=\\"selected\\"]');
      expect(await buildWarnings()).not.toMatch(/Unknown prop "selected"/);
      fs.writeFileSync(
        file(),
        before.replace(/"settings": \[[\s\S]*\]/, '"settings": []'),
      );
    },
    T,
  );

  it(
    "how list-item names Core's selected look as --state selected",
    async () => {
      const {data} = /** @type {any} */ (
        await themeEditHow('list-item', {cwd, theme: 'n'})
      );
      expect(JSON.stringify(data)).toContain('--state selected');
    },
    T,
  );

  it(
    'another word for one state the part has is written as that state, and said',
    async () => {
      const r = /** @type {any} */ (
        await themeEditSet('n', 'background-color', '#0a58ca', {
          cwd,
          on: 'list-item',
          state: 'pressed',
        })
      );
      expect(r.data.setting.state).toBe('active');
      expect(r.data.notes.join('\n')).toMatch(/read as --state active/);
      // (Said in the notes, never a field of the setting.)
      expect(r.data.setting.stateNote).toBeUndefined();
      await themeEditUndo('n', {
        cwd,
        thing: 'background-color',
        on: 'list-item',
        state: 'active',
      });
    },
    T,
  );

  it(
    'the note that a state word was written as the state stands beside another note',
    async () => {
      // (On a one-mode theme, its own mode named with --mode is noted too.)
      await themeEditSet('n', 'mode', 'light-only', {cwd});
      const r = /** @type {any} */ (
        await themeEditSet('n', 'background-color', '#0a58ca', {
          cwd,
          on: 'list-item',
          state: 'pressed',
          mode: 'light',
        })
      );
      expect(r.data.setting.state).toBe('active');
      const said = r.data.notes.join('\n');
      expect(said).toMatch(/--mode light is its own mode/);
      expect(said).toMatch(/read as --state active/);
      await themeEditUndo('n', {
        cwd,
        thing: 'background-color',
        on: 'list-item',
        state: 'active',
      });
      await themeEditUndo('n', {cwd, thing: 'mode'});
    },
    T,
  );

  it(
    'the same state word set twice is no change the second time',
    async () => {
      await themeEditSet('n', 'background-color', '#0a58ca', {
        cwd,
        on: 'list-item',
        state: 'pressed',
      });
      await themeEditSet('n', 'corners', 'round', {cwd});
      const file = fs.readFileSync(path.join(cwd, 'themes/n/n.settings.json'));
      const r = /** @type {any} */ (
        await themeEditSet('n', 'background-color', '#0a58ca', {
          cwd,
          on: 'list-item',
          state: 'pressed',
        })
      );
      expect(r.data.unchanged ?? r.data.notes.join('\n')).toBeTruthy();
      expect(
        fs
          .readFileSync(path.join(cwd, 'themes/n/n.settings.json'))
          .equals(file),
      ).toBe(true);
      await themeEditUndo('n', {cwd, thing: 'corners'});
      await themeEditUndo('n', {
        cwd,
        thing: 'background-color',
        on: 'list-item',
        state: 'active',
      });
    },
    T,
  );

  it(
    'a selected list item keeps its look over a hover set for one mode',
    async () => {
      await themeEditSet('n', 'background-color', '#0d6efd', {
        cwd,
        on: 'list-item',
        state: 'selected',
      });
      await themeEditSet('n', 'background-color', '#e9ecef', {
        cwd,
        on: 'list-item',
        state: 'hover',
        mode: 'dark',
      });
      const css = fs.readFileSync(path.join(cwd, 'themes/n/n.css'), 'utf8');
      // (In dark, the selected rule comes after the dark hover rule.)
      const darkHover = css.search(
        /data-theme="dark"\] \*\)[^{]*:hover[^{]*\{/,
      );
      expect(darkHover).toBeGreaterThan(-1);
      expect(
        css.slice(darkHover).search(/\[data-selected="selected"\][^{]*\{/),
      ).toBeGreaterThan(-1);
      await themeEditUndo('n', {cwd});
      await themeEditUndo('n', {cwd});
    },
    T,
  );

  it(
    "a selected list item keeps its all-modes look beside a mode's own selected and hover",
    async () => {
      const on = 'list-item';
      await themeEditSet('n', 'background-color', '#0d6efd', {
        cwd,
        on,
        state: 'selected',
      });
      await themeEditSet('n', 'border-color', '#ffffff', {
        cwd,
        on,
        state: 'selected',
      });
      await themeEditSet('n', 'background-color', '#1f6feb', {
        cwd,
        on,
        state: 'selected',
        mode: 'dark',
      });
      await themeEditSet('n', 'border-color', '#ff0000', {
        cwd,
        on,
        state: 'hover',
        mode: 'dark',
      });
      const ts = fs.readFileSync(
        path.join(cwd, 'themes/n/n.settings.ts'),
        'utf8',
      );
      // (The dark block's selected rule carries the all-modes border color,
      // after the dark hover rule.)
      const dark = ts.slice(ts.indexOf('"@dark"'));
      const sel = dark.indexOf('[data-selected=\\"selected\\"]');
      expect(sel).toBeGreaterThan(dark.indexOf('":hover"'));
      expect(dark.slice(sel, dark.indexOf('}', sel))).toMatch(
        /"borderColor": "#ffffff"/,
      );
      for (let i = 0; i < 4; i++) await themeEditUndo('n', {cwd});
    },
    T,
  );

  for (const mode of [undefined, 'light'])
    for (const order of [
      ['selected', 'hover'],
      ['hover', 'selected'],
    ])
      it(
        `a selected list item keeps its look over the hover look (${order.join(' then ')}${mode ? `, --mode ${mode}` : ''})`,
        async () => {
          const values = {selected: '#0d6efd', hover: '#e9ecef'};
          for (const state of order)
            await themeEditSet(
              'n',
              'background-color',
              values[/** @type {'selected' | 'hover'} */ (state)],
              {cwd, on: 'list-item', state, ...(mode ? {mode} : {})},
            );
          const ts = fs.readFileSync(
            path.join(cwd, 'themes/n/n.settings.ts'),
            'utf8',
          );
          // (The attribute's rule after the hover's, at the same weight.)
          const at = (/** @type {string} */ k) => ts.indexOf(k);
          expect(at(`":hover"`)).toBeGreaterThan(-1);
          expect(at('[data-selected=\\"selected\\"]')).toBeGreaterThan(
            at(`":hover"`),
          );
          for (let i = 0; i < order.length; i++)
            await themeEditUndo('n', {cwd});
        },
        T,
      );

  it(
    'a state word written as the state keeps the typo note a value gets',
    async () => {
      const r = /** @type {any} */ (
        await themeEditSet(
          'n',
          'background-color',
          'var(--color-acent, #0a58ca)',
          {cwd, on: 'list-item', state: 'pressed'},
        )
      );
      expect(r.data.setting.state).toBe('active');
      const said = r.data.notes.join('\n');
      expect(said).toMatch(/--color-accent/);
      expect(said).toMatch(/read as --state active/);
      await themeEditUndo('n', {
        cwd,
        thing: 'background-color',
        on: 'list-item',
        state: 'active',
      });
      expect(
        JSON.parse(fs.readFileSync(file(), 'utf8')).settings.some(
          (/** @type {any} */ x) => x.on === 'list-item',
        ),
      ).toBe(false);
    },
    T,
  );

  it(
    'current on a calendar day is not read as its selected state',
    async () => {
      /** @type {any} */
      let e = null;
      try {
        await themeEditSet('n', 'background-color', '#ffe08a', {
          cwd,
          on: 'calendar-day',
          state: 'current',
        });
      } catch (x) {
        e = x;
      }
      expect(e?.code).toBe('ERR_THEME_UNKNOWN_STATE');
      expect(
        JSON.parse(fs.readFileSync(file(), 'utf8')).settings.some(
          (/** @type {any} */ x) => x.on === 'calendar-day',
        ),
      ).toBe(false);
    },
    T,
  );
});
