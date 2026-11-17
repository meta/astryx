// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every line a refusal of `set` offers keeps the scope typed: a
 * `--state` or `--when` on the same part, and a `--mode`, go into the line
 * whenever set takes it with them, so following the line never writes wider
 * than what was asked. A hovered link's color is offered as the hovered
 * link's token, never every link's. A line set refuses with a flag (a
 * `--mode` on what is not a color) is offered as the one that works.
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
const saved = () => JSON.parse(fs.readFileSync(file(), 'utf8')).settings;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-refusal-scope-', FIXTURE_PACKAGES);
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
const lines = r =>
  (r.suggestions ?? []).map((/** @type {any} */ x) =>
    x.name.replace(/^.*? editor /, ''),
  );

/** Follow an offered line. @param {string} line */
const follow = async line =>
  cli([...ED, .../** @type {string[]} */ (splitCommand(line))]);

describe("a hovered link's color", () => {
  it(
    "is offered as the hovered link's token, and following it writes the hover only",
    async () => {
      fs.writeFileSync(file(), fresh);
      const r = await cli([
        ...ED,
        'set',
        't',
        'color',
        '#00438a',
        '--on',
        'link',
        '--state',
        'hover',
      ]);
      expect(r.error).toMatch(/link takes its color from the color prop/);
      expect(lines(r)).toEqual([
        "set t --color-text-accent '#00438a' --on link --state hover",
      ]);
      expect((await follow(lines(r)[0])).error).toBeUndefined();
      const written = saved().filter(
        (/** @type {any} */ x) => x.thing === '--color-text-accent',
      );
      expect(written).toHaveLength(1);
      expect(written[0]).toMatchObject({on: 'link', state: 'hover'});
    },
    T,
  );

  it(
    'keeps the mode typed beside the state',
    async () => {
      fs.writeFileSync(file(), fresh);
      const r = await cli([
        ...ED,
        'set',
        't',
        'color',
        '#00438a',
        '--on',
        'link',
        '--state',
        'hover',
        '--mode',
        'dark',
      ]);
      expect(lines(r)).toEqual([
        "set t --color-text-accent '#00438a' --on link --state hover --mode dark",
      ]);
    },
    T,
  );
});

describe('a flag set does not take on the line', () => {
  it(
    'is left out, as the refusal says, and every other flag kept',
    async () => {
      fs.writeFileSync(file(), fresh);
      const r = await cli([
        ...ED,
        'set',
        't',
        'border-width',
        '2px',
        '--on',
        'button',
        '--state',
        'hover',
        '--mode',
        'dark',
      ]);
      expect(r.error).toMatch(/--mode works on plain colors/);
      expect(lines(r)).toEqual([
        'set t border-width 2px --on button --state hover',
      ]);
    },
    T,
  );
});
