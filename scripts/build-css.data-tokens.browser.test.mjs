// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file build-css.data-tokens.browser.test.mjs
 * @input Built Core CSS, compiled dataVars, and a standalone CLI-built theme;
 *   run with ASTRYX_PREBUILT_DATA_BROWSER=1 after installing Chromium
 * @output Real-browser defaults, sparse overrides, nesting, and load-order proof
 * @position Prebuilt-CSS cascade guard for spec:AST-066 FR3/FR8/FR11/FR12
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {chromium} from 'playwright';
import {ensureCoreBuilt} from '../packages/cli/clients/cli/commands/ensure-core-built.mjs';
import {runCli} from '../packages/cli/test-utils/run-cli.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
let browser;
let dir;
let coreCSS;
let themeCSS;
let dataVars;

beforeAll(async () => {
  ensureCoreBuilt();
  coreCSS = await fs.readFile(
    path.join(ROOT, 'packages/core/dist/astryx.css'),
    'utf8',
  );
  ({dataVars} =
    await import('../packages/core/dist/theme/dataTokens.stylex.js'));
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'astryx-prebuilt-data-'));
  await fs.writeFile(
    path.join(dir, 'override.mjs'),
    `export default ${JSON.stringify({
      name: 'data-override',
      tokens: {'--color-data-categorical-blue': 'light-dark(#010203, #040506)'},
    })};`,
  );
  const result = await runCli(
    ['theme', 'build', 'override.mjs', '-o', 'override.css'],
    dir,
  );
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
  themeCSS = await fs.readFile(path.join(dir, 'override.css'), 'utf8');
  expect(themeCSS.match(/--color-data-[\w-]+:/g)).toHaveLength(1);
  expect(themeCSS).not.toMatch(/:root\s*\{[^}]*--color-data-/s);
  browser = await chromium.launch({args: ['--no-sandbox']});
}, 200_000);

afterAll(async () => {
  await browser?.close();
  if (dir) await fs.rm(dir, {recursive: true, force: true});
});

async function colors(styles, mode, rootTheme = false) {
  const page = await browser.newPage();
  try {
    await page.setContent(`<html style="color-scheme:${mode}" ${rootTheme ? 'data-astryx-theme="data-override"' : ''}><head>${styles.map(css => `<style>${css}</style>`).join('')}</head><body>
      <div id="raw" style="background-color:var(--color-data-categorical-blue)"></div>
      <div id="compiled" style="background-color:${dataVars['--color-data-categorical-blue']}"></div>
      <div id="neutral" style="background-color:${dataVars['--color-data-neutral']}"></div>
      <div data-astryx-theme="data-override"><div id="override" style="background-color:${dataVars['--color-data-categorical-blue']}"></div>
        <div data-astryx-theme="child"><div id="nested" style="background-color:${dataVars['--color-data-categorical-blue']}"></div></div>
      </div>
    </body></html>`);
    return await page.evaluate(() =>
      Object.fromEntries(
        ['raw', 'compiled', 'neutral', 'override', 'nested'].map(id => [
          id,
          getComputedStyle(document.getElementById(id)).backgroundColor,
        ]),
      ),
    );
  } finally {
    await page.close();
  }
}

describe.runIf(process.env.ASTRYX_PREBUILT_DATA_BROWSER === '1')(
  'prebuilt data variables paint without a consumer StyleX compile step',
  () => {
    for (const mode of ['light', 'dark']) {
      it(`paints defaults and authored overrides in both load orders (${mode})`, async () => {
        const expected = {
          raw: 'rgb(1, 113, 227)',
          compiled: 'rgb(1, 113, 227)',
          neutral:
            mode === 'light' ? 'rgb(132, 148, 163)' : 'rgb(140, 147, 155)',
          override: mode === 'light' ? 'rgb(1, 2, 3)' : 'rgb(4, 5, 6)',
          nested: mode === 'light' ? 'rgb(1, 2, 3)' : 'rgb(4, 5, 6)',
        };
        expect(await colors([coreCSS, themeCSS], mode)).toEqual(expected);
        expect(await colors([themeCSS, coreCSS], mode)).toEqual(expected);
        // On the document root the two declarations compete directly, not just
        // through inheritance. This catches unlayered defaults/layer inversions.
        const rootExpected = {
          ...expected,
          raw: expected.override,
          compiled: expected.override,
        };
        expect(await colors([coreCSS, themeCSS], mode, true)).toEqual(
          rootExpected,
        );
        expect(await colors([themeCSS, coreCSS], mode, true)).toEqual(
          rootExpected,
        );
      });
      it(`rejects unlayered defaults at a themed document root (${mode})`, async () => {
        const block = coreCSS.match(
          /:root,\s*\.\w+\{[^}]*--color-data-categorical-blue:[^}]+\}/,
        )[0];
        const unlayered = await colors([themeCSS, block], mode, true);
        expect(unlayered.raw).toBe('rgb(1, 113, 227)');
        expect(unlayered.compiled).toBe('rgb(1, 113, 227)');
        expect(unlayered.raw).not.toBe(
          mode === 'light' ? 'rgb(1, 2, 3)' : 'rgb(4, 5, 6)',
        );
      });
      it(`reproduces transparent raw and compiled swatches without definitions (${mode})`, async () => {
        const missing = await colors([themeCSS], mode);
        expect(missing.raw).toBe('rgba(0, 0, 0, 0)');
        expect(missing.compiled).toBe('rgba(0, 0, 0, 0)');
        expect(missing.neutral).toBe('rgba(0, 0, 0, 0)');
      });
    }
  },
);
