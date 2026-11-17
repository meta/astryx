// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Box shorthands take one value per side, as CSS does: a border color
 * of 2 to 4 colors (`#ddd #ddd transparent`) is set, built as typed and
 * measured side by side, so a faint side is named with a fix that keeps
 * the other sides. The other box shorthands (border-width, border-style,
 * border-radius, padding, margin) take their multi-value forms too.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew} from './theme-edit.mjs';
import {colorSides} from './_color.mjs';
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
    await importOriginal(),
  ),
);

const T = 240_000;
const ED = ['experimental', 'theme', 'editor'];

/** @type {string} */
let cwd;
/** @type {string} */
let fresh;

const file = () => path.join(cwd, 'themes/t/t.settings.json');
const css = () => fs.readFileSync(path.join(cwd, 'themes/t/t.css'), 'utf8');

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-box-sides-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
  fresh = fs.readFileSync(file(), 'utf8');
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string[]} args */
const cli = async args =>
  JSON.parse((await runCli([...args, '--json'], cwd)).stdout);

describe('the side reader', () => {
  it('names the sides each count of colors colors', () => {
    expect(colorSides('border-color', '#ddd')).toBeNull();
    expect(
      colorSides('border-color', '#a #b')?.colors.map(x => x.sides),
    ).toEqual([
      ['top', 'bottom'],
      ['right', 'left'],
    ]);
    expect(
      colorSides('border-color', '#a #b #c')?.colors.map(x => x.sides),
    ).toEqual([['top'], ['right', 'left'], ['bottom']]);
    expect(
      colorSides('border-color', 'rgba(0, 0, 0, .1) #b #c #d')?.colors.map(
        x => x.color,
      ),
    ).toEqual(['rgba(0, 0, 0, .1)', '#b', '#c', '#d']);
    expect(
      colorSides('border-inline-color', '#a #b')?.colors.map(x => x.sides),
    ).toEqual([['start'], ['end']]);
    expect(colorSides('color', '#a #b')).toBeNull();
  });
});

describe('a border color for each side', () => {
  for (const value of [
    'rgba(0,0,0,.1) rgba(0,0,0,.1) rgba(0,0,0,.25)',
    '#ddd #ddd transparent',
    '#ddd #eee',
    '#111 #222 #333 #444',
  ])
    it(
      `is set and built as typed: ${value}`,
      async () => {
        fs.writeFileSync(file(), fresh);
        const r = await cli([
          ...ED,
          'set',
          't',
          'border-color',
          value,
          '--on',
          'card',
        ]);
        expect(r.error).toBeUndefined();
        expect(css()).toContain(`border-color: ${value};`);
      },
      T,
    );

  it(
    'is built as typed for one mode',
    async () => {
      fs.writeFileSync(file(), fresh);
      const r = await cli([
        ...ED,
        'set',
        't',
        'border-color',
        '#ddd #ddd #000',
        '--on',
        'card',
        '--mode',
        'dark',
      ]);
      expect(r.error).toBeUndefined();
      expect(css()).toContain('border-color: #ddd #ddd #000;');
    },
    T,
  );

  for (const [prop, value, words] of [
    [
      'border-color',
      'red green blue yellow pink',
      /takes 1 to 4 colors, one per side; .* has 5/,
    ],
    [
      'border-color',
      '#ddd 4px',
      /takes a color for each side; "4px" in "#ddd 4px" is not one/,
    ],
    [
      'border-inline-color',
      '#000 #fff #eee',
      /takes 1 to 2 colors, one per side; .* has 3/,
    ],
  ])
    it(
      `refuses ${prop} ${value}, naming why`,
      async () => {
        fs.writeFileSync(file(), fresh);
        const r = await cli([...ED, 'set', 't', prop, value, '--on', 'card']);
        expect(r.error).toMatch(words);
      },
      T,
    );

  it(
    'names a faint side, and its fix keeps the other sides',
    async () => {
      fs.writeFileSync(file(), fresh);
      const r = await cli([
        ...ED,
        'set',
        't',
        'border-color',
        '#000 #000 #f4f4f4',
        '--on',
        'text-input',
      ]);
      const light = r.data.newProblems.find((/** @type {any} */ x) =>
        / in light;/.test(x.problem),
      );
      expect(light.problem).toMatch(
        /^the bottom border on text-input \(#f4f4f4\) is /,
      );
      expect(light.fix).toMatch(
        / border-color '#000 #000 #[0-9a-f]{6}' --on text-input --mode light$/,
      );
      const dark = r.data.newProblems.find((/** @type {any} */ x) =>
        / in dark;/.test(x.problem),
      );
      expect(dark.problem).toMatch(
        /^the top, right and left borders on text-input \(#000\) are /,
      );
      expect(dark.fix).toMatch(
        /'#[0-9a-f]{6} #[0-9a-f]{6} #f4f4f4' --on text-input --mode dark$/,
      );
      const args = splitCommand(
        light.fix.slice(light.fix.indexOf('experimental ')),
      );
      expect((await cli(/** @type {string[]} */ (args))).error).toBeUndefined();
    },
    T,
  );

  it(
    'leaves a transparent side out of the measure',
    async () => {
      fs.writeFileSync(file(), fresh);
      const r = await cli([
        ...ED,
        'set',
        't',
        'border-color',
        '#555 #555 transparent',
        '--on',
        'text-input',
      ]);
      expect(
        (r.data.newProblems ?? []).filter((/** @type {any} */ x) =>
          / in light;/.test(x.problem),
        ),
      ).toEqual([]);
    },
    T,
  );
});

describe('the other box shorthands', () => {
  for (const [prop, value] of [
    ['border-width', '1px 0 2px'],
    ['border-style', 'solid none dashed'],
    ['border-radius', '4px 8px / 2px'],
    ['padding', '4px 8px 12px'],
    ['margin', '0 auto'],
  ])
    it(
      `take ${prop} ${value}`,
      async () => {
        fs.writeFileSync(file(), fresh);
        const r = await cli([...ED, 'set', 't', prop, value, '--on', 'card']);
        expect(r.error).toBeUndefined();
      },
      T,
    );
});
