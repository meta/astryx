// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A part's own state saved in a spelling `set` reads typed
 * (toggle-button's `is-pressed`, `ispressed`) is read as that state: the
 * theme loads, builds it, and the next change saves the part's spelling.
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
    'astryx-theme-part-state-saved-spelling-',
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
  for (const state of ['is-pressed', 'ispressed']) {
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
        // show reads the theme (the entry stays as saved until a change).
        expect(shown.data.settings).toHaveLength(1);
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
