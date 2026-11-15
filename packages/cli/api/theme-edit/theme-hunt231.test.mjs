// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A part's own state written as its census names it (toggle-button's
 * isPressed) is saved and read back as that state, so the theme keeps
 * loading; a saved state the part does not have is refused with its undo
 * and a line that sets it in its place.
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
import {splitCommand} from './_vet.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

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
  cwd = makeLinkedFixture('astryx-theme-hunt231-', FIXTURE_PACKAGES);
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

describe("a part's own state in its census spelling", () => {
  it(
    '--state isPressed is saved as that state, built, and every later command works',
    async () => {
      await themeEditSet('t', 'background-color', '#000080', {
        cwd,
        on: 'toggle-button',
        state: 'isPressed',
      });
      expect(saved()).toEqual([PRESSED]);
      expect(
        fs.readFileSync(path.join(cwd, 'themes/t/t.css'), 'utf8'),
      ).toContain('background-color: #000080');
      const r = await themeEditSet('t', 'accent', 'teal', {cwd});
      expect(r.data.setting).toMatchObject({thing: 'accent', value: 'teal'});
      expect(saved()).toEqual([
        PRESSED,
        {thing: 'accent', value: 'teal', source: 'dial'},
      ]);
      expect((await themeEditShow('t', {cwd})).data.settings).toContainEqual(
        expect.objectContaining({state: 'isPressed'}),
      );
    },
    T,
  );

  it(
    'a typed --state pressed is offered the census state',
    async () => {
      const e = await refusal(() =>
        themeEditSet('t', 'color', 'white', {
          cwd,
          on: 'toggle-button',
          state: 'pressed',
        }),
      );
      expect(e.run).toContainEqual(
        expect.stringMatching(
          / set t color white --on toggle-button --state isPressed$/,
        ),
      );
      expect(saved()).toEqual([]);
    },
    T,
  );
});

describe('a saved state the part does not have', () => {
  it(
    'is refused with its undo and the line that sets it in its place; following that line, the theme loads',
    async () => {
      fs.writeFileSync(
        file(),
        JSON.stringify(
          {...JSON.parse(fresh), settings: [{...PRESSED, state: 'is-pressed'}]},
          null,
          2,
        ),
      );
      const r = JSON.parse(
        (
          await runCli(
            [
              'experimental',
              'theme',
              'editor',
              'set',
              't',
              'accent',
              'teal',
              '--json',
            ],
            cwd,
          )
        ).stdout,
      );
      expect(r.error).toContain('"is-pressed" is not a state of toggle-button');
      const lines = r.suggestions.map((/** @type {any} */ x) => x.name);
      expect(lines[0]).toMatch(
        / undo t background-color --on toggle-button --state is-pressed$/,
      );
      const set = r.suggestions.find((/** @type {any} */ x) =>
        x.name.includes(' editor set t '),
      );
      expect(set.reason).toBe('or set the value it holds, as set reads it');
      const args = splitCommand(
        set.name.slice(set.name.indexOf('experimental ')),
      );
      expect((await runCli(/** @type {string[]} */ (args), cwd)).status).toBe(
        0,
      );
      expect(saved()).toEqual([PRESSED]);
      expect(
        (await themeEditSet('t', 'accent', 'teal', {cwd})).data.setting,
      ).toMatchObject({
        thing: 'accent',
      });
    },
    T,
  );
});
