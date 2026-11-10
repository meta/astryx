// Copyright (c) Meta Platforms, Inc. and affiliates.

// The same assertions as build-theme.prose.test.mjs, run against the experimental copy of the command
// (`astryx experimental theme`, where `theme build` is called `compile`).

/**
 * @file Regression test for prose output of `astryx experimental theme compile`.
 *
 * `astryx experimental theme compile` has a single CSS-generation path — @astryxdesign/core's generator,
 * the same one the <Theme> runtime uses (generateThemeCSS). It always emits
 * prose element defaults (h1–h6, p, small, code, hr) so unstyled HTML inherits
 * the theme's typography, exactly like the runtime. There is intentionally no
 * way to omit them (the old `--no-prose` flag was removed: it let the build
 * emit something the runtime never would, breaking the build⇄runtime parity).
 *
 * Covers:
 *   - prose defaults ship in `@layer reset` (zero-specificity :where()), NOT
 *     `@layer astryx-theme`, so component/Markdown StyleX always wins;
 *   - no raw element margins are emitted (reset.css zeroes them and the
 *     components own block spacing — see the docsite Markdown regression);
 *   - paragraphs use the body font, not the heading font.
 *
 * Building `astryx experimental theme compile` requires a compiled @astryxdesign/core (there is no in-CLI
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

function writeTheme(dir, name) {
  fs.mkdirSync(dir, {recursive: true});
  // The CLI writes <basename>.css next to the source file, so use the
  // theme name as the filename for unambiguous fixtures.
  const file = path.join(dir, `${name}.mjs`);
  fs.writeFileSync(
    file,
    `export default { name: ${JSON.stringify(name)}, tokens: { '--color-bg': '#fff' } };\n`,
  );
  return file;
}

// `astryx experimental theme compile` imports the compiled @astryxdesign/core/theme entry. Build core
// once if it isn't already present so the suite works in any CI job.
beforeAll(() => {
  ensureCoreBuilt();
}, 200_000);

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-build-theme-prose-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('experimental theme compile prose output', () => {
  it('always emits prose mappings in @layer reset', async () => {
    const project = path.join(tmpDir, 'project');
    const themesDir = path.join(project, 'themes');
    const themeFile = writeTheme(themesDir, 'with-prose');

    const result = await runCli(
      ['experimental', 'theme', 'compile', path.relative(project, themeFile)],
      project,
    );

    expect(result.code).toBe(0);

    const cssPath = path.join(themesDir, 'with-prose.css');
    expect(fs.existsSync(cssPath)).toBe(true);
    const css = fs.readFileSync(cssPath, 'utf-8');

    // Prose defaults are zero-specificity :where() rules in @layer reset,
    // NOT @layer astryx-theme, so Markdown/component StyleX always wins.
    expect(css).toMatch(/@layer reset/);
    expect(css).toMatch(/:where\(h1, h2, h3, h4, h5, h6\)/);
    // Paragraphs use the body font (regression: they used the heading font).
    expect(css).toMatch(
      /:where\(p\)[^}]*font-family: var\(--font-family-body\)/,
    );
    // No raw element margins — reset.css + component StyleX own spacing.
    const proseBlock = css.slice(
      css.indexOf('@layer reset'),
      css.indexOf('@layer astryx-theme'),
    );
    expect(proseBlock).not.toMatch(/margin/);

    // Layer placement: prose (reset) must come before component overrides
    // (astryx-theme) so the cascade resolves correctly.
    const resetIndex = css.indexOf('@layer reset');
    const themeIndex = css.indexOf('@layer astryx-theme');
    expect(resetIndex).toBeGreaterThanOrEqual(0);
    expect(themeIndex).toBeGreaterThan(resetIndex);
    expect(css.indexOf(':where(p)')).toBeLessThan(themeIndex);
  });

  it('has no --no-prose flag (prose is non-optional)', async () => {
    const result = await runCli(
      ['experimental', 'theme', 'compile', '--help'],
      process.cwd(),
    );
    // The flag was removed; build always emits prose to match the runtime.
    expect(result.stdout + result.stderr).not.toContain('--no-prose');
  });
});
