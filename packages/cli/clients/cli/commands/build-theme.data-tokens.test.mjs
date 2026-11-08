// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Verifies `astryx theme build` emits sparse data overrides and no
 * canonical root defaults while preserving explicit cascade-layer order.
 * @input Temporary standalone theme modules compiled through the public CLI
 * @output Structural assertions for AST-066 data-token ownership
 * @position Regression suite for theme-build CSS ownership
 */

import {describe, it, expect, beforeAll, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {ensureCoreBuilt} from './ensure-core-built.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';

function writeTheme(dir, name, theme) {
  fs.mkdirSync(dir, {recursive: true});
  const file = path.join(dir, `${name}.mjs`);
  fs.writeFileSync(
    file,
    `export default ${JSON.stringify({name, ...theme})};\n`,
  );
  return file;
}

async function buildTheme(tmpDir, name, theme) {
  const project = path.join(tmpDir, 'project');
  const themesDir = path.join(project, 'themes');
  const themeFile = writeTheme(themesDir, name, theme);

  const result = await runCli(
    ['theme', 'build', path.relative(project, themeFile)],
    project,
  );
  expect(result.code).toBe(0);

  return fs.readFileSync(path.join(themesDir, `${name}.css`), 'utf-8');
}

beforeAll(() => {
  ensureCoreBuilt();
}, 200_000);

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-build-theme-data-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('theme build data token output', () => {
  it('emits no canonical data defaults or raw root data block', async () => {
    const css = await buildTheme(tmpDir, 'charts-untouched', {
      tokens: {'--color-accent': '#0077B6'},
    });

    expect(css).not.toContain('--color-data-');
    expect(css).not.toMatch(/:root\s*\{[^}]*--color-data-/s);
    expect(css).not.toContain('@layer astryx-base {\n:root {');
  });

  it('registers layer order before every emitted layer block', async () => {
    const css = await buildTheme(tmpDir, 'charts-order', {
      tokens: {'--color-accent': '#0077B6'},
    });

    const order = css.indexOf('@layer reset, astryx-base, astryx-theme;');
    const reset = css.indexOf('@layer reset {');
    const theme = css.indexOf('@layer astryx-theme {');

    expect(order).toBeGreaterThanOrEqual(0);
    expect(reset).toBeGreaterThan(order);
    expect(theme).toBeGreaterThan(order);
  });

  it("puts only the theme's authored data token in its donut", async () => {
    const css = await buildTheme(tmpDir, 'charts-override', {
      tokens: {'--color-data-categorical-blue': '#00A3FF'},
    });

    expect(css).toContain(
      '@scope ([data-astryx-theme="charts-override"]) to ([data-astryx-theme])',
    );
    expect(css).toContain('--color-data-categorical-blue: #00A3FF;');
    expect(css.match(/--color-data-/g)).toHaveLength(1);
    expect(css).not.toContain('--color-data-categorical-orange');
    expect(css).not.toContain('--color-data-gray-1');
  });
});
