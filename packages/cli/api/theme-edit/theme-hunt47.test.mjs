// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The forty-seventh pass over `astryx experimental theme editor`: the
 * theme file's values are never copied into the generated settings, the
 * notes say what phones show, a [light, dark] pair is refused on a token
 * that is not a color, and a font set through `typography` is the file's.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt47-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
});

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug @param {string} extra */
const source = (slug, extra) =>
  fs.writeFileSync(
    path.join(cwd, `themes/${slug}/${slug}.theme.ts`),
    `import {defineTheme} from '@astryxdesign/core/theme';\nimport {${slug}Settings} from './${slug}.settings';\nexport const ${slug}Theme = defineTheme({extends: ${slug}Settings, name: '${slug}', ${extra}});\n`,
  );
/** @param {any} r */
const notes = r => (r.data.notes ?? []).join('\n');

describe('hunt47', () => {
  it('A: the theme file values are never copied into the generated settings', async () => {
    await themeEditNew('cp', {cwd, like: 'neutral'});
    source('cp', "tokens: {'--font-family-heading': 'Georgia, serif'}");
    const r = await themeEditShow('cp', {cwd});
    const settings = fs.readFileSync(
      path.join(cwd, 'themes/cp/cp.settings.ts'),
      'utf8',
    );
    expect(settings).not.toMatch(/Georgia/);
    expect(notes(r)).toMatch(
      /on phones \(touch screens below 1024px\), the base theme's type shows for --font-family-heading, which cp\.theme\.ts sets/,
    );
  }, 240_000);

  it('F20-N1: a [light, dark] pair on a token that is not a color is refused', async () => {
    await themeEditNew('pr', {cwd});
    source('pr', "tokens: {'--font-family-body': ['Georgia', 'Courier']}");
    const r = await refusal(() => themeEditShow('pr', {cwd}));
    expect(r.code).toBe('ERR_THEME_INVALID');
    expect(r.message).toMatch(/--font-family-body a \[light, dark\] pair/);
    const s = await refusal(() =>
      themeEditSet('pr', '--radius-page', '4px', {cwd}),
    );
    expect(s.message).toMatch(/only colors differ by mode/);
  }, 240_000);

  it('F20-N3: a font set through typography is the theme file own', async () => {
    await themeEditNew('ty', {cwd});
    source('ty', "typography: {heading: {family: 'Georgia, serif'}}");
    await themeEditShow('ty', {cwd});
    const r = await themeEditSet('ty', '--font-family-heading', 'Times', {cwd});
    expect(notes(r)).toMatch(/ty\.theme\.ts sets --font-family-heading itself/);
    expect(notes(r)).not.toMatch(/already shows/);
  }, 240_000);
});
