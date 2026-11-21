// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A step past a dial's last rung names an exact line only where one
 * setting does it (a size the dial takes, or the control height a part
 * reads), and that line runs; and a one-mode theme reads its own mode named
 * with --mode as the same as no --mode, in set as in undo.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
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
  cwd = makeLinkedFixture('astryx-theme-past-rung-', FIXTURE_PACKAGES);
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

/** @param {any} r */
const names = r => (r.suggestions ?? []).map((/** @type {any} */ x) => x.name);

/** @param {string} line */
const follow = async line => {
  const args = splitCommand(line.slice(line.indexOf('experimental ')));
  if (!args) throw new Error(`cannot read ${line}`);
  return await cli(args);
};

describe('a step past the last rung', () => {
  it(
    'on a part, names the control height the part reads, and it runs',
    async () => {
      fs.writeFileSync(file(), fresh);
      for (let i = 0; i < 6; i++)
        await cli([...ED, 'set', 't', 'spacing', 'more', '--on', 'button']);
      const r = await cli([
        ...ED,
        'set',
        't',
        'spacing',
        'more',
        '--on',
        'button',
      ]);
      expect(r.error).toMatch(
        /already at its largest step, spacious on button/,
      );
      expect(r.error).toMatch(/An exact size goes past the rungs/);
      expect(names(r)[0]).toMatch(/ set t spacing less --on button$/);
      expect(names(r)[1]).toMatch(
        / set t --size-element-md \d+px --on button$/,
      );
      const px = Number(/(\d+)px/.exec(names(r)[1])?.[1]);
      expect(px).toBeGreaterThan(32 * 1.25);
      expect((await follow(names(r)[1])).error).toBeUndefined();
    },
    T,
  );

  it(
    'for the whole theme, claims no exact line where no one setting does it',
    async () => {
      fs.writeFileSync(file(), fresh);
      for (let i = 0; i < 6; i++)
        await cli([...ED, 'set', 't', 'spacing', 'more']);
      const r = await cli([...ED, 'set', 't', 'spacing', 'more']);
      expect(r.error).not.toMatch(/An exact size/);
      expect(names(r)).toHaveLength(1);
      expect(names(r)[0]).toMatch(/ set t spacing less$/);
    },
    T,
  );

  it(
    'for the text size, names a size the dial takes, and it runs',
    async () => {
      fs.writeFileSync(file(), fresh);
      for (let i = 0; i < 6; i++)
        await cli([...ED, 'set', 't', 'text-size', 'more']);
      const r = await cli([...ED, 'set', 't', 'text-size', 'more']);
      expect(names(r)[1]).toMatch(/ set t text-size \d+$/);
      expect((await follow(names(r)[1])).error).toBeUndefined();
    },
    T,
  );
});

describe("a one-mode theme's own mode named with --mode", () => {
  it(
    'is the same as no --mode: said, saved alike, and undone the same way',
    async () => {
      fs.writeFileSync(file(), fresh);
      await cli([...ED, 'set', 't', 'mode', 'dark-only']);
      await cli([...ED, 'set', 't', '--color-border', '#ffffff41']);
      const plain = JSON.parse(fs.readFileSync(file(), 'utf8')).settings.find(
        (/** @type {any} */ x) => x.thing === '--color-border',
      );
      await cli([...ED, 'undo', 't', '--color-border']);
      const r = await cli([
        ...ED,
        'set',
        't',
        '--color-border',
        '#ffffff41',
        '--mode',
        'dark',
      ]);
      expect(r.error).toBeUndefined();
      expect(r.data.notes.join(' ')).toMatch(
        /t is dark-only: --mode dark is its own mode, the same as no --mode/,
      );
      const named = JSON.parse(fs.readFileSync(file(), 'utf8')).settings.find(
        (/** @type {any} */ x) => x.thing === '--color-border',
      );
      expect(named).toEqual(plain);
      const back = await cli([
        ...ED,
        'undo',
        't',
        '--color-border',
        '--mode',
        'dark',
      ]);
      expect(back.error).toBeUndefined();
    },
    T,
  );

  it(
    'still refuses --mode on what has no mode in any theme',
    async () => {
      fs.writeFileSync(file(), fresh);
      await cli([...ED, 'set', 't', 'mode', 'dark-only']);
      const r = await cli([
        ...ED,
        'set',
        't',
        'text-size',
        'large',
        '--mode',
        'dark',
      ]);
      expect(r.code).toBe('ERR_THEME_NO_MODE');
    },
    T,
  );
});
