// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A theme saved by an earlier editor always opens: a saved setting
 * today's rules refuse (a color on a part an element inside it paints, a
 * line-height its items set themselves) is kept and built as before, and
 * named in a note with the lines that clear it. show, set and compile each
 * work, and following the note's lines clears it.
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
import {themeEditNew} from './theme-edit.mjs';
import {splitCommand} from './_vet.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const T = 240_000;
const ED = ['experimental', 'theme', 'editor'];

/** @type {string} */
let cwd;
/** @type {string} */
let fresh;

const file = () => path.join(cwd, 'themes/t/t.settings.json');
const saved = () => JSON.parse(fs.readFileSync(file(), 'utf8')).settings;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-older-editor-', FIXTURE_PACKAGES);
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

const ACCENT = {thing: 'accent', value: '#1e6fd9', source: 'dial'};

// Entries earlier editors saved, which today's rules refuse.
const OLDER = [
  {
    thing: 'color',
    value: '#ffffff',
    source: 'property',
    on: 'typeahead-item',
    state: 'hover',
  },
  {
    thing: 'background-color',
    value: '#2e3035',
    source: 'property',
    on: 'dropdown-menu-divider',
  },
  {
    thing: 'line-height',
    value: '20px',
    source: 'property',
    on: 'dropdown-menu-item',
  },
];

/** @param {string[]} args */
const cli = async args => {
  const r = await runCli([...args, '--json'], cwd);
  return {status: r.status, json: JSON.parse(r.stdout)};
};

describe('a setting an earlier editor saved, which today refuses', () => {
  for (const entry of OLDER)
    it(
      `${entry.thing} on ${entry.on}: show, set and compile work, the entry is kept, and the note's lines clear it`,
      async () => {
        const d = JSON.parse(fresh);
        d.settings = [ACCENT, entry];
        fs.writeFileSync(file(), JSON.stringify(d, null, 2));
        const shown = await cli([...ED, 'show', 't']);
        expect(shown.status).toBe(0);
        const note = JSON.stringify(shown.json.data.notes).match(
          /kept and built as an earlier editor built it[^"]*/,
        )?.[0];
        expect(note).toBeTruthy();
        const set = await cli([...ED, 'set', 't', 'corners', 'pill']);
        expect(set.status).toBe(0);
        expect(saved()).toContainEqual(entry);
        const compiled = await runCli(
          ['experimental', 'theme', 'compile', 'themes/t/t.theme.ts'],
          cwd,
        );
        expect(compiled.status).toBe(0);
        // Each line the note names, followed in order, clears it.
        const lines = [
          ...String(note).matchAll(/astryx experimental theme editor [^,]+/g),
        ].map(m => m[0].replace(/\\'/g, "'"));
        expect(lines.length).toBeGreaterThan(0);
        for (const line of lines) {
          const args = splitCommand(line.slice(line.indexOf('experimental ')));
          expect(
            (await runCli(/** @type {string[]} */ (args), cwd)).status,
          ).toBe(0);
        }
        expect(saved()).not.toContainEqual(entry);
        const again = await cli([...ED, 'show', 't']);
        expect(JSON.stringify(again.json.data.notes)).not.toContain(
          'built as an earlier editor built',
        );
      },
      T,
    );
});

describe('a whole theme an earlier editor saved', () => {
  it(
    'opens, builds every setting as before, and keeps the one today refuses',
    async () => {
      // A trimmed copy of a theme an earlier editor wrote: its dials, a few
      // part settings, and the one entry today's rules refuse (a color on
      // a selected radio row, which the row's label paints over).
      const never = {
        thing: 'color',
        value: '#1f2328',
        source: 'property',
        on: 'radio-list-item',
        state: 'selected',
      };
      const settings = [
        {thing: 'accent', value: '#0969da', source: 'dial'},
        {thing: 'neutral', value: '#59636e', source: 'dial'},
        {thing: 'success', value: '#1a7f37', source: 'dial'},
        {thing: 'danger', value: '#d1242f', source: 'dial'},
        {thing: 'warning', value: '#9a6700', source: 'dial'},
        {thing: 'corners', value: '6px', source: 'dial'},
        {thing: 'spacing', value: 'compact', source: 'dial'},
        {thing: 'font', value: 'system', source: 'dial'},
        {
          thing: 'background-color',
          value: '#1f883d',
          source: 'property',
          on: 'button',
          when: 'variant:primary',
        },
        {
          thing: 'color',
          value: '#ffffff',
          source: 'property',
          on: 'button',
          when: 'variant:primary',
        },
        {
          thing: 'border-color',
          value: '#1a7f37',
          source: 'property',
          on: 'button',
          when: 'variant:primary',
        },
        never,
      ];
      fs.writeFileSync(
        file(),
        JSON.stringify(
          {name: 't', like: 'neutral', mode: 'light-only', settings},
          null,
          2,
        ),
      );
      const shown = await cli([...ED, 'show', 't']);
      expect(shown.status).toBe(0);
      expect(JSON.stringify(shown.json.data.notes)).toContain(
        'color = #1f2328 on radio-list-item :selected',
      );
      const css = fs.readFileSync(path.join(cwd, 'themes/t/t.css'), 'utf8');
      expect(css).toContain('#1f883d');
      expect(saved()).toEqual(settings);
    },
    T,
  );
});
