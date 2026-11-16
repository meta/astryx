// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Names saved in a spelling `set` reads typed are read as `set`
 * reads them, with a note naming the saved spelling: a part's own state in
 * other letters, with a space, an underscore or a colon (toggle-button's
 * `IsPressed`, `is pressed`, `is_pressed`, `:isPressed`), and a CSS property
 * in other letters (`Background-Color`). The theme loads and builds them,
 * and the next change saves the editor's spelling. A state's prop name
 * typed in one case (`ispressed`, `ISPRESSED`, `isselected`) is its state.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
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
/** @type {string} */
let fresh;

const file = () => path.join(cwd, 'themes/t/t.settings.json');
const saved = () => JSON.parse(fs.readFileSync(file(), 'utf8')).settings;

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-saved-name-spellings-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
  fresh = fs.readFileSync(file(), 'utf8');
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

beforeEach(() => {
  fs.writeFileSync(file(), fresh);
  fs.rmSync(path.join(cwd, 'themes/t/t.history.json'), {force: true});
});

const PRESSED = {
  thing: 'background-color',
  value: '#000080',
  source: 'property',
  on: 'toggle-button',
  state: 'isPressed',
};

describe("a part's own state saved in another spelling", () => {
  for (const state of [
    'IsPressed',
    'is pressed',
    'Is Pressed',
    'is_pressed',
    ':isPressed',
  ]) {
    it(
      `"${state}" is read as isPressed, built, and saved that way by the next change`,
      async () => {
        fs.writeFileSync(
          file(),
          JSON.stringify(
            {...JSON.parse(fresh), settings: [{...PRESSED, state}]},
            null,
            2,
          ),
        );
        const shown = await themeEditShow('t', {cwd});
        expect(shown.data.settings).toContainEqual(
          expect.objectContaining({state: 'isPressed'}),
        );
        const r = await themeEditSet('t', 'accent', 'teal', {cwd});
        expect(r.data.notes.join('\n')).toContain(
          `was saved with state "${state}", read as isPressed`,
        );
        expect(saved()).toEqual([
          PRESSED,
          {thing: 'accent', value: 'teal', source: 'dial'},
        ]);
        expect(
          fs.readFileSync(path.join(cwd, 'themes/t/t.css'), 'utf8'),
        ).toContain('background-color: #000080');
      },
      T,
    );
  }
});

describe('a CSS property saved in other letters', () => {
  it(
    '"Background-Color" is read as background-color, built, and saved so by the next change',
    async () => {
      const entry = {
        thing: 'Background-Color',
        value: '#000080',
        source: 'property',
        on: 'card',
      };
      fs.writeFileSync(
        file(),
        JSON.stringify({...JSON.parse(fresh), settings: [entry]}, null, 2),
      );
      const r = await themeEditSet('t', 'accent', 'teal', {cwd});
      expect(r.data.notes.join('\n')).toContain(
        'Background-Color was saved as "Background-Color", read as background-color',
      );
      expect(saved()).toEqual([
        {...entry, thing: 'background-color'},
        {thing: 'accent', value: 'teal', source: 'dial'},
      ]);
      expect(
        fs.readFileSync(path.join(cwd, 'themes/t/t.css'), 'utf8'),
      ).toContain('background-color: #000080');
    },
    T,
  );
});

describe("a state's prop name in one case", () => {
  for (const [part, typed, meant] of [
    ['button', 'ispressed', 'pressed'],
    ['button', 'ISPRESSED', 'pressed'],
    ['tab', 'isselected', 'selected'],
  ]) {
    it(
      `--state ${typed} on ${part} is ${meant}`,
      async () => {
        const r = await themeEditSet('t', 'background-color', '#000080', {
          cwd,
          on: part,
          state: typed,
        });
        expect(r.data.setting).toMatchObject({on: part, state: meant});
      },
      T,
    );
  }

  it(
    'saved as "ispressed" on button, it is read as pressed',
    async () => {
      fs.writeFileSync(
        file(),
        JSON.stringify(
          {
            ...JSON.parse(fresh),
            settings: [
              {
                thing: 'background-color',
                value: '#000080',
                source: 'property',
                on: 'button',
                state: 'ispressed',
              },
            ],
          },
          null,
          2,
        ),
      );
      const shown = await themeEditShow('t', {cwd});
      expect(shown.data.settings).toContainEqual(
        expect.objectContaining({on: 'button', state: 'pressed'}),
      );
    },
    T,
  );
});
