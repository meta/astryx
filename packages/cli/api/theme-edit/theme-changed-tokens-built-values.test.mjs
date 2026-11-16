// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A change lists every custom property whose built value moved,
 * read from the built stylesheet before and after: changedTokens holds the
 * theme's own tokens (the page included) and changedPartTokens the tokens
 * it sets on parts, for a dial that moves many (vibrancy) and one that
 * moves a few (font), in the JSON and the text.
 */

import {isLookToken} from './_palette.mjs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import postcss from 'postcss';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew} from './theme-edit.mjs';
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

const css = () => fs.readFileSync(path.join(cwd, 'themes/t/t.css'), 'utf8');

/**
 * Every custom property the stylesheet sets, by rule.
 * @param {string} text
 */
const declared = text => {
  /** @type {Map<string, string>} */
  const out = new Map();
  postcss.parse(text).walkDecls(d => {
    if (d.prop.startsWith('--'))
      out.set(`${/** @type {any} */ (d.parent).selector}|${d.prop}`, d.value);
  });
  return out;
};

/** The properties whose built value moved between two stylesheets. */
const moved = (/** @type {string} */ a, /** @type {string} */ b) => {
  const [x, y] = [declared(a), declared(b)];
  return [
    ...new Set(
      [...new Set([...x.keys(), ...y.keys()])]
        .filter(k => x.get(k) !== y.get(k))
        .map(k => k.split('|')[1]),
    ),
  ];
};

/** @param {string[]} args */
const cli = async args =>
  JSON.parse((await runCli([...args, '--json'], cwd)).stdout);

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-changed-built-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
  // A tinted neutral and an accent, so vibrancy moves the page and the
  // accent alike.
  await cli([...ED, 'set', 't', 'neutral', '#7c6a9a']);
  await cli([...ED, 'set', 't', 'accent', '#2244cc']);
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('changedTokens', () => {
  for (const [dial, value] of [
    ['vibrancy', '90'],
    ['font', 'serif'],
  ])
    it(
      `after ${dial} lists every custom property whose built value moved`,
      async () => {
        const before = css();
        const r = await cli([...ED, 'set', 't', dial, value]);
        const changed = /** @type {string[]} */ ([
          ...r.data.changedTokens,
          ...(r.data.changedPartTokens ?? []),
        ]);
        // The theme's own tokens keep their line shape; the category and
        // chart colors that move with the look are counted in one line each.
        const look =
          /^(?:category colors \(badges, tokens and card tints\)|chart colors): \d+ values moved with the look$/;
        for (const line of r.data.changedTokens)
          if (!look.test(line))
            expect(line).toMatch(
              /^--[\w-]+(?: \((?:light|dark)\))?: .* -> .*$/s,
            );
        const all = moved(before, css());
        expect(all.length).toBeGreaterThan(0);
        for (const prop of all)
          expect(
            changed.some(
              x => x.startsWith(`${prop} `) || x.startsWith(`${prop}:`),
            ) ||
              (isLookToken(prop) &&
                changed.some(x =>
                  x.startsWith(
                    prop.startsWith('--color-data-')
                      ? 'chart colors:'
                      : 'category colors',
                  ),
                )),
            prop,
          ).toBe(true);
        if (dial === 'vibrancy') {
          expect(all).toContain('--color-background-body');
          expect(changed.join('\n')).toMatch(
            /^--color-background-body \(light\)/m,
          );
        }
      },
      T,
    );

  it(
    'names a token a part sets by its rule, in each mode that moved',
    async () => {
      // (A gray neutral at the default vibrancy, then a vivid one: the
      // readable text color the stylesheet sets on selected rows moves.)
      await cli([...ED, 'undo', 't', 'neutral']);
      await cli([...ED, 'undo', 't', 'vibrancy']);
      const r = await cli([...ED, 'set', 't', 'vibrancy', '90']);
      const parts = /** @type {string[]} */ (r.data.changedPartTokens);
      expect(parts.length).toBeGreaterThan(0);
      expect(parts[0]).toMatch(
        /^--[a-z0-9-]+ on [a-z-]+\S* \((?:light|dark)\): \S+ -> \S+$/,
      );
    },
    T,
  );

  it(
    'prints the same lines in the text',
    async () => {
      const r = await runCli([...ED, 'set', 't', 'vibrancy', '70'], cwd);
      const j = await cli([...ED, 'set', 't', 'vibrancy', '40']);
      expect(r.stdout).toMatch(/changedTokens:/);
      // Every JSON line has its text line on the way back.
      const back = await runCli([...ED, 'set', 't', 'vibrancy', '70'], cwd);
      for (const line of [
        ...j.data.changedTokens,
        ...(j.data.changedPartTokens ?? []),
      ])
        expect(back.stdout).toContain(String(line).split(': ')[0]);
      if ((j.data.changedPartTokens ?? []).length)
        expect(back.stdout).toMatch(/changedPartTokens:/);
    },
    T,
  );
});
