// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A state named by its ARIA attribute (toggle-button's `aria-pressed`,
 * in any case or with an underscore) is the part's own state, typed or
 * saved: set saves isPressed, and a saved `aria-pressed` loads and is
 * saved as isPressed by the next change.
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
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
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

const PRESSED = {
  thing: 'background-color',
  value: '#000080',
  source: 'property',
  on: 'toggle-button',
  state: 'isPressed',
};

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-aria-state-', FIXTURE_PACKAGES);
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

describe('a state named by its ARIA attribute', () => {
  for (const typed of ['aria-pressed', 'ARIA-PRESSED', 'aria_pressed'])
    it(
      `--state ${typed} on toggle-button saves isPressed`,
      async () => {
        const r = await themeEditSet('t', 'background-color', '#000080', {
          cwd,
          on: 'toggle-button',
          state: typed,
        });
        expect(r.data.setting).toMatchObject({state: 'isPressed'});
        expect(saved()).toEqual([PRESSED]);
      },
      T,
    );

  it(
    'saved as aria-pressed, it loads, and the next change saves isPressed',
    async () => {
      fs.writeFileSync(
        file(),
        JSON.stringify(
          {
            ...JSON.parse(fresh),
            settings: [{...PRESSED, state: 'aria-pressed'}],
          },
          null,
          2,
        ),
      );
      await themeEditSet('t', 'accent', 'teal', {cwd});
      expect(saved()).toEqual([
        PRESSED,
        {thing: 'accent', value: 'teal', source: 'dial'},
      ]);
    },
    T,
  );
});
