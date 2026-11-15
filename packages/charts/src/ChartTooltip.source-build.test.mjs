// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChartTooltip.source-build.test.mjs
 * @input Uses Babel, the core and charts StyleX build configs, the Layer host
 *   source, and ChartTooltip source
 * @output Verifies the tooltip card sets padding on every side the Layer host
 *   resets, so the shipped stylesheets keep the card padding
 * @position Regression test for the published charts stylesheet
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {transformAsync} from '@babel/core';
import {describe, expect, it} from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHARTS_ROOT = path.resolve(__dirname, '..');
const CORE_ROOT = path.resolve(CHARTS_ROOT, '../core');

/** Compiles one source file with its package's shipped StyleX config. */
async function compileRules(packageRoot, configFile, sourceFile) {
  const source = await fs.readFile(sourceFile, 'utf8');
  const previousCwd = process.cwd();
  // Both configs resolve `.stylex` imports relative to the package root.
  process.chdir(packageRoot);
  try {
    const result = await transformAsync(source, {
      babelrc: false,
      configFile: path.join(packageRoot, configFile),
      filename: sourceFile,
    });
    return (result?.metadata?.stylex ?? []).map(([, rule]) => rule.ltr);
  } finally {
    process.chdir(previousCwd);
  }
}

/** Splits `.cls{padding-top:0}` into its property and value. */
function declaration(css) {
  const match = /\{([a-z-]+):([^}]+)\}$/.exec(css);
  return match ? {property: match[1], value: match[2]} : null;
}

describe('ChartTooltip card stylesheet', () => {
  it('pads the card on every side the Layer host resets', async () => {
    const [layerRules, tooltipRules] = await Promise.all([
      compileRules(
        CORE_ROOT,
        'babel.config.json',
        path.join(CORE_ROOT, 'src/Layer/useLayer.tsx'),
      ),
      compileRules(
        CHARTS_ROOT,
        'babel.config.cjs',
        path.join(__dirname, 'ChartTooltip.tsx'),
      ),
    ]);

    const resets = layerRules.flatMap(css => {
      const decl = declaration(css);
      return decl?.property.startsWith('padding') && decl.value === '0'
        ? [decl.property]
        : [];
    });
    expect(resets.length).toBeGreaterThan(0);

    // The card renders on the Layer host as its xstyle. StyleX merges styles
    // per property, so a card declaration for the same property replaces the
    // host reset class. A shorthand is a different property: both classes stay
    // on the host, and in the prebuilt CSS the reset has the higher
    // specificity, so the card has no padding on that side.
    for (const property of resets) {
      const cardPadding = tooltipRules.find(css => {
        const decl = declaration(css);
        return decl?.property === property && decl.value !== '0';
      });
      expect(
        cardPadding,
        `card sets ${property}, which the Layer host resets`,
      ).toBeDefined();
    }
  });
});
