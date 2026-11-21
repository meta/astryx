// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every line a refusal of `set` offers keeps the scope typed: a
 * `--state` or `--when` on the same part, and a `--mode`, go into the line
 * whenever set takes it with them, so following the line never writes wider
 * than what was asked. A hovered link's color is written as the hovered
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
  /** The compiled rules that set --color-text-accent. */
  const accentRules = () =>
    [
      ...fs
        .readFileSync(path.join(cwd, 'themes/t/t.css'), 'utf8')
        .matchAll(/([^{}]*)\{([^{}]*)\}/g),
    ]
      .filter(m => /--color-text-accent:\s*#00438a/.test(m[2]))
      .map(m => m[1].trim());

  it(
    "is taken as the hovered link's token, written for the hover only",
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
      expect(r.error).toBeUndefined();
      expect(JSON.stringify(r)).toMatch(
        /the color goes into --color-text-accent on link/,
      );
      const rules = accentRules();
      expect(rules.length).toBeGreaterThan(0);
      for (const rule of rules) {
        expect(rule).toMatch(/astryx-link/);
        expect(rule).toMatch(/:hover/);
      }
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
      expect(r.error).toBeUndefined();
      const rules = accentRules();
      expect(rules.length).toBeGreaterThan(0);
      for (const rule of rules) {
        expect(rule).toMatch(/:hover/);
        expect(rule).not.toMatch(/:scope\[data-theme="light"\]/);
      }
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
