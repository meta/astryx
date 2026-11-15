// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The forty-ninth pass over `astryx experimental theme editor`: every
 * Unicode space in a font family is one space and zero-width characters go,
 * a dial's value pasted with its property name is the value, and a
 * declaration pasted as one argument is the token and its value.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {familySpaces} from './_check.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt49-', FIXTURE_PACKAGES);
  await themeEditNew('b', {cwd});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

const css = () => fs.readFileSync(path.join(cwd, 'themes/b/b.css'), 'utf8');
const saved = (/** @type {string} */ thing) =>
  JSON.parse(
    fs.readFileSync(path.join(cwd, 'themes/b/b.settings.json'), 'utf8'),
  ).settings.find((/** @type {any} */ x) => x.thing === thing && !x.on)?.value;

describe('N51: Unicode spaces in a font family', () => {
  it.each([
    ['Open\u00A0Sans', 'Open Sans'],
    ['Inter\u200B', 'Inter'],
    ['Open\u2009\u2009Sans', 'Open Sans'],
    ['\uFEFFInter', 'Inter'],
  ])('%j reads as %j', (typed, want) => {
    expect(familySpaces(typed).trim()).toBe(want);
  });

  it('builds Open Sans from a no-break space', async () => {
    await themeEditSet('b', 'font', 'Open\u00A0Sans', {cwd});
    expect(css()).not.toMatch(/\u00A0|\u200B/);
    expect(css()).toMatch(/Open Sans/);
  }, 240_000);
});

describe('N49: a dial value pasted with its property name', () => {
  it.each([
    ['corners', 'border-radius: pill', 'pill'],
    ['spacing', 'gap: roomy', 'roomy'],
  ])(
    '%s %j saves %s',
    async (thing, value, want) => {
      await themeEditSet('b', thing, value, {cwd});
      expect(String(saved(thing))).toBe(want);
    },
    240_000,
  );
});

describe('N49: text-size pasted with its property name', () => {
  it('suggests the size given, never 16', async () => {
    let err;
    try {
      await themeEditSet('b', 'text-size', 'font-size: 18px;', {cwd});
    } catch (e) {
      err = /** @type {any} */ (e);
    }
    expect(
      err.suggestions.map((/** @type {any} */ x) => x.name).join('\n'),
    ).toMatch(/ set b text-size 18$/m);
  });
});

describe('N50: a declaration pasted as one argument', () => {
  it.each(['--color-accent: #e11d48', '--color-accent:#e11d48'])(
    'set b %j sets the token',
    async arg => {
      const r = await runCli(
        ['--json', 'experimental', 'theme', 'editor', 'set', 'b', arg],
        cwd,
      );
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(saved('--color-accent')).toBe('#e11d48');
    },
    240_000,
  );
});
