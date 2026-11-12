// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The page-wide tokens of a theme's own source: given inline, by a
 * const, through a spread, or `as const`/`satisfies`, read from the
 * defineTheme the build loads (never a sibling theme in the same file).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {ownSourceTokenValues, ownSourceTokens} from './_settings.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-own-tokens-', FIXTURE_PACKAGES);
  await themeEditNew('d', {cwd});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} body */
const source = body =>
  fs.writeFileSync(
    path.join(cwd, 'themes/d/d.theme.ts'),
    `import {defineTheme} from '@astryxdesign/core/theme';\nimport {dSettings} from './d.settings';\n${body}\n`,
  );

describe('own-source page-wide tokens', () => {
  it.each([
    [
      'a const',
      "const mine = {'--radius-container': 'var(--radius-page)'};\nexport const dTheme = defineTheme({extends: dSettings, name: 'd', tokens: mine});",
    ],
    [
      'a spread',
      "const mine = {'--radius-container': 'var(--radius-page)'};\nexport const dTheme = defineTheme({extends: dSettings, name: 'd', tokens: {...mine}});",
    ],
    [
      'as const',
      "const mine = {'--radius-container': 'var(--radius-page)'} as const;\nexport const dTheme = defineTheme({extends: dSettings, name: 'd', tokens: mine});",
    ],
    [
      'satisfies',
      "const mine = {'--radius-container': 'var(--radius-page)'} satisfies Record<string, string>;\nexport const dTheme = defineTheme({extends: dSettings, name: 'd', tokens: mine});",
    ],
  ])('reads tokens given through %s, and refuses the loop', async (_, body) => {
    source(body);
    expect(ownSourceTokenValues(cwd, 'd')).toEqual({
      '--radius-container': 'var(--radius-page)',
    });
    const r = await refusal(() =>
      themeEditSet('d', '--radius-page', 'var(--radius-container)', {cwd}),
    );
    expect(r.message).toMatch(/would read itself/);
  });

  it('a later key or spread wins, in order', () => {
    source(
      "const a = {'--radius-page': '1px'};\nexport const dTheme = defineTheme({extends: dSettings, name: 'd', tokens: {'--radius-page': '0px', ...a, '--radius-element': '2px'}});",
    );
    expect(ownSourceTokenValues(cwd, 'd')).toEqual({
      '--radius-page': '1px',
      '--radius-element': '2px',
    });
  });

  it('reads the theme the build loads, never a sibling defineTheme', () => {
    source(
      "export const dTheme = defineTheme({extends: dSettings, name: 'd'});\nexport const dKiosk = defineTheme({extends: dTheme, name: 'd-kiosk', tokens: {'--color-accent': '#000000'}});",
    );
    expect(ownSourceTokens(cwd, 'd')).toEqual([]);
  });
});
