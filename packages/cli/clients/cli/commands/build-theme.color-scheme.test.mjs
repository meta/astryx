// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Regression test for the `color-scheme` declaration `astryx theme build`
 * emits alongside `light-dark()` token output (see #3658).
 *
 * `astryx theme build` injects a `color-scheme` declaration into
 * `@layer astryx-theme` whenever the generated CSS contains `light-dark()`,
 * so LightningCSS/browsers can resolve it. That declaration must mirror
 * reset.css's own `html[data-theme]` -> `color-scheme` mapping (a bare
 * `:root { color-scheme: light dark; }` alone permanently pins the page to
 * "light dark", defeating `<Theme mode="light|dark">` forcing regardless of
 * `@layer astryx-theme` being declared after `@layer reset` in layer order):
 *
 *   :root { color-scheme: light dark; }
 *   html[data-theme="light"] { color-scheme: light; }
 *   html[data-theme="dark"] { color-scheme: dark; }
 *
 * Themes that never use `light-dark()` have no `color-scheme` ambiguity to
 * resolve, so none of the three rules should be emitted for them. Canonical data
 * defaults come from StyleX rather than theme output, so this decision continues
 * to read only the theme's authored values.
 *
 * Building `astryx theme build` requires a compiled @astryxdesign/core (there is no in-CLI
 * fallback generator), so this suite builds core once in beforeAll via the
 * shared ensureCoreBuilt() helper — which serializes concurrent Vitest workers
 * behind a lock — to stay self-sufficient regardless of CI job ordering.
 */

import {describe, it, expect, beforeAll, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {ensureCoreBuilt} from './ensure-core-built.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';

const COLOR_SCHEME_ROOT_DECL = ':root { color-scheme: light dark; }';
const COLOR_SCHEME_LIGHT_DECL =
  'html[data-theme="light"] { color-scheme: light; }';
const COLOR_SCHEME_DARK_DECL =
  'html[data-theme="dark"] { color-scheme: dark; }';

function writeTheme(dir, name, tokens) {
  fs.mkdirSync(dir, {recursive: true});
  // The CLI writes <basename>.css next to the source file, so use the
  // theme name as the filename for unambiguous fixtures.
  const file = path.join(dir, `${name}.mjs`);
  fs.writeFileSync(
    file,
    `export default { name: ${JSON.stringify(name)}, tokens: ${JSON.stringify(tokens)} };\n`,
  );
  return file;
}

// `astryx theme build` imports the compiled @astryxdesign/core/theme entry. Build core
// once if it isn't already present so the suite works in any CI job.
beforeAll(() => {
  ensureCoreBuilt();
}, 200_000);

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'astryx-build-theme-color-scheme-'),
  );
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('theme build color-scheme output', () => {
  it('emits the mode-aware color-scheme rules in @layer astryx-theme for a light-dark() theme', async () => {
    const project = path.join(tmpDir, 'project');
    const themesDir = path.join(project, 'themes');
    // A raw light-dark() token value is what triggers the color-scheme
    // injection in theme.mjs. `defineTheme.test.ts` already covers the
    // separate [light, dark] tuple -> light-dark() conversion; this fixture
    // writes the string directly so this test stays focused on the CLI's own
    // color-scheme decision, not on that conversion.
    const themeFile = writeTheme(themesDir, 'with-light-dark', {
      '--color-accent': 'light-dark(#0077B6, #48CAE4)',
    });

    const result = await runCli(
      ['theme', 'build', path.relative(project, themeFile)],
      project,
    );

    expect(result.code).toBe(0);

    const cssPath = path.join(themesDir, 'with-light-dark.css');
    expect(fs.existsSync(cssPath)).toBe(true);
    const css = fs.readFileSync(cssPath, 'utf-8');

    expect(css).toContain('light-dark(#0077B6, #48CAE4)');

    // All 3 rules must be present...
    expect(css).toContain(COLOR_SCHEME_ROOT_DECL);
    expect(css).toContain(COLOR_SCHEME_LIGHT_DECL);
    expect(css).toContain(COLOR_SCHEME_DARK_DECL);

    // ...and specifically inside @layer astryx-theme, not @layer reset (the
    // declaration must sit alongside the light-dark() token/component output
    // it resolves, not the zero-specificity prose defaults).
    const themeLayerStart = css.indexOf('@layer astryx-theme');
    expect(themeLayerStart).toBeGreaterThanOrEqual(0);
    const themeLayerBody = css.slice(themeLayerStart);
    expect(themeLayerBody).toContain(COLOR_SCHEME_ROOT_DECL);
    expect(themeLayerBody).toContain(COLOR_SCHEME_LIGHT_DECL);
    expect(themeLayerBody).toContain(COLOR_SCHEME_DARK_DECL);
  });

  it('omits all color-scheme rules for a theme with no light-dark() tokens', async () => {
    const project = path.join(tmpDir, 'project');
    const themesDir = path.join(project, 'themes');
    const themeFile = writeTheme(themesDir, 'no-light-dark', {
      '--color-accent': '#0077B6',
    });

    const result = await runCli(
      ['theme', 'build', path.relative(project, themeFile)],
      project,
    );

    expect(result.code).toBe(0);

    const cssPath = path.join(themesDir, 'no-light-dark.css');
    expect(fs.existsSync(cssPath)).toBe(true);
    const css = fs.readFileSync(cssPath, 'utf-8');

    expect(css).toContain('--color-accent: #0077B6');
    expect(css).not.toContain(COLOR_SCHEME_ROOT_DECL);
    expect(css).not.toContain(COLOR_SCHEME_LIGHT_DECL);
    expect(css).not.toContain(COLOR_SCHEME_DARK_DECL);
  });
});
