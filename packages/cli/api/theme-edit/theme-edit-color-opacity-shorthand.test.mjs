// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A color with an opacity after its slash, as Tailwind writes it
 * (`ring-black/5`, `bg-blue-500/20`, `#000/12`, `white/[.08]`), is that
 * color at that opacity, rgb(r g b / a), wherever a value is read: how
 * writes it so, and set refuses the shorthand, which is no CSS, offering
 * the color written out. The opacity is never dropped.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew} from './theme-edit.mjs';
import {colorOpacitiesIn} from './_color.mjs';
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

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-color-opacity-', FIXTURE_PACKAGES);
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

/** @param {string} ask */
const how = async ask => {
  const r = await cli([...ED, 'how', ask, '--theme', 't']);
  /** @type {Array<{text: string, commands?: string[]}>} */
  const results = r.data?.results ?? [];
  return {
    texts: results.map(x => x.text).join('\n'),
    commands: results
      .flatMap(x => x.commands ?? [])
      .map(c => c.replace(/^.*? editor /, '')),
  };
};

describe('the reader', () => {
  it('reads each color with an opacity after its slash, and nothing else', () => {
    const read = (/** @type {string} */ v) =>
      colorOpacitiesIn(v).map(x => [x.typed, x.color]);
    expect(read('0 0 0 1px black/5')).toEqual([
      ['black/5', 'rgb(0 0 0 / 0.05)'],
    ]);
    expect(read('#000/10')).toEqual([['#000/10', 'rgb(0 0 0 / 0.1)']]);
    expect(read('white/[.08] white/[8%]')).toEqual([
      ['white/[.08]', 'rgb(255 255 255 / 0.08)'],
      ['white/[8%]', 'rgb(255 255 255 / 0.08)'],
    ]);
    // A half-clear color at 50% is a quarter.
    expect(read('#00000080/50')).toEqual([
      ['#00000080/50', 'rgb(0 0 0 / 0.251)'],
    ]);
    // Tailwind's own stops are named, never read as another color.
    expect(read('blue-500/20')).toEqual([['blue-500/20', null]]);
    for (const v of [
      '16/9',
      '12px/1.5 Inter',
      '4px / 2px',
      'rgb(0 0 0 / 5%)',
      'black/500',
    ])
      expect(read(v)).toEqual([]);
  });
});

describe('how', () => {
  for (const [ask, color] of [
    ['cards: rounded-lg, shadow and ring-1 ring-black/5', 'rgb(0 0 0 / 0.05)'],
    ['cards: ring-1 ring-gray-900/10', '/ 0.1)'],
    ['buttons: bg-blue-500/20', '/ 0.2)'],
    ['cards: border #000/12', 'rgb(0 0 0 / 0.12)'],
    ['cards: border-black/[.12]', 'rgb(0 0 0 / 0.12)'],
  ])
    it(
      `writes "${ask}" at its opacity`,
      async () => {
        fs.writeFileSync(file(), fresh);
        const a = await how(ask);
        expect(a.commands.some(c => c.includes(color))).toBe(true);
        expect(a.commands.join('\n')).not.toMatch(/'#000000|#000'|1px #000\b/);
        expect(a.texts).not.toMatch(/^not used:|but not "#/m);
      },
      T,
    );
});

describe('set', () => {
  it(
    'refuses the shorthand and offers the color written out, which works',
    async () => {
      fs.writeFileSync(file(), fresh);
      const r = await cli([
        ...ED,
        'set',
        't',
        'box-shadow',
        '0 0 0 1px black/5',
        '--on',
        'card',
      ]);
      expect(r.error).toMatch(
        /"black\/5" is a color with an opacity after the slash, as Tailwind writes it; CSS writes it as rgb\(0 0 0 \/ 0\.05\)/,
      );
      const line = r.suggestions[0].name;
      expect(line).toMatch(
        / set t box-shadow '0 0 0 1px rgb\(0 0 0 \/ 0\.05\)' --on card$/,
      );
      const args = /** @type {string[]} */ (
        splitCommand(line.slice(line.indexOf('experimental ')))
      );
      expect((await cli(args)).error).toBeUndefined();
    },
    T,
  );

  it(
    "names a Tailwind stop it cannot read, keeping the opacity's place",
    async () => {
      fs.writeFileSync(file(), fresh);
      const r = await cli([...ED, 'set', 't', '--color-border', 'blue-500/20']);
      expect(r.error).toMatch(
        /"blue-500\/20" is a color with an opacity after the slash, as Tailwind writes it; CSS writes a color at an opacity as rgb\(r g b \/ alpha\)/,
      );
    },
    T,
  );
});
