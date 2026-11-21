// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A theme's own color tokens are measured for text contrast as the
 * editor's check measures a setting, however the theme was written. The
 * rows are two first-try themes written by hand, whose dark segmented
 * control kept a light track with near-white labels.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {plainFix, themeTokenContrast} from './_theme-contrast.mjs';
import {themeBuild} from '../theme/build/build.mjs';
import {themeAdd} from '../theme/add/add.mjs';
import {checkAppThemes} from '../doctor/theme-checks.mjs';
import {logger} from '../logger.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

/** @type {string} */
let cwd;
/** @type {any} */
let neutral;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-token-contrast-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  const built = createRequire(path.join(cwd, 'package.json')).resolve(
    '@astryxdesign/theme-neutral/built',
  );
  neutral = (await import(pathToFileURL(built).href)).neutralTheme;
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} name @param {Record<string, unknown>} tokens */
const handTheme = (name, tokens) => ({
  ...neutral,
  name,
  tokens: {...neutral.tokens, ...tokens},
});

const LUX = {
  '--color-neutral': 'rgb(238 238 238)',
  '--color-text-secondary': 'rgb(90 90 90)',
};
const CLASSIC = {
  '--color-neutral': ['rgb(85% 85% 85%)', 'rgb(85% 85% 85%)'],
};

describe("a theme's own color tokens", () => {
  it('give the text contrast problems the editor gives for them', async () => {
    const lux = await themeTokenContrast(cwd, handTheme('lux', LUX));
    expect(lux.map(p => p.text)).toContain(
      'text in segmented-control-item ("Week") is 1.47:1 in dark (#c6c6c6 on segmented-control\'s rgb(238 238 238)); text needs 4.5:1',
    );
    const classic = await themeTokenContrast(
      cwd,
      handTheme('classic', CLASSIC),
    );
    expect(
      classic.find(p => /^text in segmented-control-item /.test(p.text))?.text,
    ).toMatch(/ is 1\.21:1 in dark /);
    // (A fix is plain words: no command of an experimental surface.)
    for (const p of [...lux, ...classic])
      expect(p.fix ?? '').not.toMatch(/experimental|astryx/);
    expect(await themeTokenContrast(cwd, handTheme('same', {}))).toEqual([]);
  }, 300_000);

  it('turn an editor fix line into plain words', () => {
    expect(
      plainFix(
        "astryx experimental theme editor set t --color-text-secondary '#6b6b6b' --on segmented-control --mode dark",
      ),
    ).toBe(
      "set --color-text-secondary to #6b6b6b in components['segmented-control'] for dark mode",
    );
    expect(
      plainFix("astryx experimental theme editor set t --color-x '#000000'"),
    ).toBe('set --color-x to #000000 in tokens');
    expect(plainFix(null)).toBeNull();
  });

  it('are warned about by theme build, which still succeeds', async () => {
    const file = path.join(cwd, 'lux.theme.mjs');
    fs.writeFileSync(
      file,
      `import {defineTheme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';
export const luxTheme = defineTheme({extends: neutralTheme, name: 'lux', tokens: ${JSON.stringify(LUX)}});
`,
    );
    /** @type {string[]} */
    const warned = [];
    const warn = vi
      .spyOn(logger, 'warn')
      .mockImplementation(m => void warned.push(String(m)));
    /** @type {any} */
    let r;
    try {
      r = await themeBuild('lux.theme.mjs', {}, {cwd});
    } finally {
      warn.mockRestore();
    }
    expect(r?.type).toBe('theme.build');
    const line =
      /^text in segmented-control-item \("Week"\) is 1\.47:1 in dark .*; fix: set --color-text-secondary to #[0-9a-f]{6} /;
    // (In the receipt, for --json, and printed in every report.)
    expect(
      r.data.contrast.some((/** @type {string} */ w) => line.test(w)),
    ).toBe(true);
    expect(warned.some(w => line.test(w.replace(/^Warning: /, '')))).toBe(true);
    // (One line per fix: the texts it reads again are counted on it.)
    const fixes = r.data.contrast
      .filter((/** @type {string} */ w) => /; fix: /.test(w))
      .map((/** @type {string} */ w) => w.slice(w.indexOf('; fix: ')));
    expect(new Set(fixes).size).toBe(fixes.length);
  }, 300_000);

  it('are a doctor warning for an added local theme', async () => {
    const dir = path.join(cwd, 'src/themes/lux');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(
      path.join(dir, 'luxTheme.mjs'),
      `import {defineTheme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';
export const luxTheme = defineTheme({extends: neutralTheme, name: 'lux', tokens: ${JSON.stringify(LUX)}});
`,
    );
    fs.writeFileSync(
      path.join(dir, 'luxTheme.doc.mjs'),
      "/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: 'lux', displayName: 'Lux', description: 'Flat and monochrome.', maintained: false};\n",
    );
    await themeBuild(path.join(dir, 'luxTheme.mjs'), {}, {cwd});
    await themeAdd('lux', {cwd, import: true});
    const row = (await checkAppThemes(cwd)).find(
      c => c.id === 'theme-contrast',
    );
    expect(row).toMatchObject({status: 'warn'});
    expect(row?.message).toContain(
      'lux: text in segmented-control-item ("Week") is 1.47:1 in dark',
    );
    expect(row?.fix).toMatch(/^lux: set --color-text-secondary to #/);
  }, 300_000);
});
