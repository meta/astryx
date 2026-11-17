// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A negated state word (`--state unpressed`, `not pressed`) names the
 * part at rest: the refusal offers the same line with no --state, never
 * the state the word denies, so following it saves no state.
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
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';

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
  cwd = makeLinkedFixture('astryx-theme-negated-state-', FIXTURE_PACKAGES);
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

describe('a negated state word', () => {
  for (const [part, typed] of [
    ['toggle-button', 'unpressed'],
    ['toggle-button', 'not pressed'],
    ['button', 'unpressed'],
    ['checkbox-indicator', 'unchecked'],
  ]) {
    it(
      `--state ${typed} on ${part} offers the rest look, and following it saves no state`,
      async () => {
        const e = await refusal(() =>
          themeEditSet('t', 'background-color', '#eeeeee', {
            cwd,
            on: part,
            state: typed,
          }),
        );
        expect(e.message).toContain('its rest look');
        expect(e.run).toEqual([
          expect.stringMatching(
            new RegExp(` set t background-color '#eeeeee' --on ${part}$`),
          ),
        ]);
        const r = await themeEditSet('t', 'background-color', '#eeeeee', {
          cwd,
          on: part,
        });
        expect(r.data.setting.state).toBeUndefined();
        expect(saved()).toEqual([
          {
            thing: 'background-color',
            value: '#eeeeee',
            source: 'property',
            on: part,
          },
        ]);
      },
      T,
    );
  }

  it(
    'a word the synonym table reads keeps its reading (inactive is disabled)',
    async () => {
      const e = await refusal(() =>
        themeEditSet('t', 'background-color', '#eeeeee', {
          cwd,
          on: 'button',
          state: 'inactive',
        }),
      );
      expect(e.run[0]).toMatch(/ --state disabled$/);
    },
    T,
  );
});
