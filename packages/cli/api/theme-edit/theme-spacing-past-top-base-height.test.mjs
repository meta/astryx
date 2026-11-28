// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A spacing step past the last rung on a part names the control
 * height it reads one step past what that rung draws, measured from the
 * base theme's own height: a base with taller controls (40px, or matcha)
 * steps from its own, never from Core's default. The line runs.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew} from './theme-edit.mjs';
import {SPACING} from './_tables.mjs';
import {splitCommand} from './_vet.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

const T = 600_000;
const ED = ['experimental', 'theme', 'editor'];
const TOP = /** @type {number} */ (SPACING[SPACING.length - 1][1]);

/** @param {string} cwd @param {string[]} args */
const cli = async (cwd, args) =>
  JSON.parse((await runCli([...args, '--json'], cwd)).stdout);

/** @param {any} r */
const names = r => (r.suggestions ?? []).map((/** @type {any} */ x) => x.name);

/**
 * The control height a step past the top rung on a button offers.
 * @param {string} cwd
 * @param {string} slug
 */
const pastTop = async (cwd, slug) => {
  for (let i = 0; i < 6; i++)
    await cli(cwd, [...ED, 'set', slug, 'spacing', 'more', '--on', 'button']);
  const r = await cli(cwd, [
    ...ED,
    'set',
    slug,
    'spacing',
    'more',
    '--on',
    'button',
  ]);
  const line = names(r).find((/** @type {string} */ n) =>
    / --size-element-md \d+px --on button$/.test(n),
  );
  expect(line).toBeTruthy();
  const args = splitCommand(
    String(line).slice(String(line).indexOf('experimental ')),
  );
  expect(
    (await cli(cwd, /** @type {string[]} */ (args))).error,
  ).toBeUndefined();
  return Number(/(\d+)px --on button$/.exec(String(line))?.[1]);
};

describe('past the top spacing rung on a part', () => {
  /** @type {string} */
  let tall;
  beforeAll(() => {
    tall = makeLinkedFixture('astryx-theme-past-top-tall-', FIXTURE_PACKAGES);
    writeFixtureBaseTheme(tall, 'neutral');
    // A base whose controls are 40px tall.
    const built = path.join(
      path.dirname(tall),
      'node_modules/@astryxdesign/theme-neutral/built.js',
    );
    fs.writeFileSync(
      built,
      fs
        .readFileSync(built, 'utf8')
        .replace(
          '"tokens": {',
          '"tokens": {\n    "--size-element-md": "40px",',
        ),
    );
  }, T);
  afterAll(() => {
    if (tall) removeLinkedFixture(tall);
  });

  it(
    'on a 40px base, steps from 40px as the top rung draws it',
    async () => {
      await themeEditNew('t', {cwd: tall, like: 'neutral'});
      expect(await pastTop(tall, 't')).toBe(Math.round(40 * TOP * 1.15));
    },
    T,
  );

  it(
    'on matcha, steps past what its top rung draws',
    async ctx => {
      const cwd = makeLinkedFixture(
        'astryx-theme-past-top-matcha-',
        FIXTURE_PACKAGES,
      );
      try {
        const unbuilt = await installRealBaseThemes(cwd, ['matcha']);
        if (unbuilt) return ctx.skip();
        await themeEditNew('m', {cwd, like: 'matcha'});
        const mod = await import(
          pathToFileURL(
            createRequire(path.join(cwd, 'package.json')).resolve(
              '@astryxdesign/theme-matcha/built',
            ),
          ).href
        );
        const theme = /** @type {any} */ (Object.values(mod)[0]);
        const own = theme?.tokens?.['--size-element-md'];
        const base = Number.parseFloat(
          String(Array.isArray(own) ? own[0] : (own ?? '32px')),
        );
        expect(await pastTop(cwd, 'm')).toBeGreaterThan(Math.round(base * TOP));
      } finally {
        removeLinkedFixture(cwd);
      }
    },
    T,
  );
});
