// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Several states joined by + with spaces around it (`selected +
 * hover`) are read piece by piece, typed or saved: a saved one is read
 * as the part's states with a note, and the theme keeps loading.
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
import {stateSpelling} from './_normal.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-state-pieces-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
  fresh = fs.readFileSync(file(), 'utf8');
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

beforeEach(() => {
  fs.writeFileSync(file(), fresh);
});

describe('states joined by + with spaces', () => {
  it('are spelled piece by piece', () => {
    expect(stateSpelling('selected + hover')).toBe('selected+hover');
    expect(stateSpelling(' :Selected +Hover ')).toBe('selected+hover');
    expect(stateSpelling('focus visible')).toBe('focus-visible');
  });

  it(
    'saved as "selected + hover" on tab, are read as selected+hover, and the theme keeps loading',
    async () => {
      const entry = {
        thing: 'background-color',
        value: '#000080',
        source: 'property',
        on: 'tab',
        state: 'selected + hover',
      };
      fs.writeFileSync(
        file(),
        JSON.stringify({...JSON.parse(fresh), settings: [entry]}, null, 2),
      );
      const shown = await themeEditShow('t', {cwd});
      // show reads the theme (the entry stays as saved until a change).
      expect(shown.data.settings).toHaveLength(1);
      const r = await themeEditSet('t', 'accent', 'teal', {cwd});
      expect(r.data.notes.join('\n')).toContain(
        'was saved with state "selected + hover", read as selected+hover',
      );
      expect(saved()).toEqual([
        {...entry, state: 'selected+hover'},
        {thing: 'accent', value: 'teal', source: 'dial'},
      ]);
    },
    T,
  );
});
