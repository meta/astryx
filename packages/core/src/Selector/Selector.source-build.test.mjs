// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Selector.source-build.test.mjs
 * @input Uses Babel, an arrow-lowering plugin, the StyleX compiler, and Selector source
 * @output Verifies raw Selector source survives a consumer's Babel pipeline
 * @position Regression test for Selector source-build compatibility
 */

import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {transformAsync} from '@babel/core';
import stylexBabelPlugin from '@stylexjs/babel-plugin';
import {describe, expect, it} from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../..');
const SELECTOR_SOURCE = path.join(__dirname, 'Selector.tsx');
// Babel looks bare preset names up from the cwd, the repo root, which does
// not declare them. Resolve them from this package, which does.
const require = createRequire(import.meta.url);

// What broke #5464: a consumer preset (there, next/babel) lowering arrows to
// function expressions, which StyleX cannot evaluate. This does only that.
const lowerArrows = () => ({
  visitor: {
    ArrowFunctionExpression(arrow) {
      arrow.arrowFunctionToExpression();
    },
  },
});

const EXPECTED_PADDING_DECLARATIONS = [
  'padding-block:calc((var(--size-element-sm) - max(min(var(--spacing-5),max(var(--size-element-sm) - 2 * var(--border-width),1.5em)),20px,1rem) - 2 * var(--border-width)) / 2)',
  'padding-block:calc((var(--size-element-md) - max(min(var(--spacing-5),max(var(--size-element-md) - 2 * var(--border-width),1.5em)),20px,1rem) - 2 * var(--border-width)) / 2)',
  'padding-block:calc((var(--size-element-lg) - max(min(var(--spacing-5),max(var(--size-element-lg) - 2 * var(--border-width),1.5em)),20px,1rem) - 2 * var(--border-width)) / 2)',
];

describe('Selector source-build compatibility (#5464)', () => {
  it('compiles after a consumer preset lowers module-scope arrows', async () => {
    const source = await fs.readFile(SELECTOR_SOURCE, 'utf8');
    const result = await transformAsync(source, {
      babelrc: false,
      configFile: false,
      filename: SELECTOR_SOURCE,
      presets: [
        [
          require.resolve('@babel/preset-typescript'),
          {isTSX: true, allExtensions: true},
        ],
        [require.resolve('@babel/preset-react'), {runtime: 'automatic'}],
      ],
      plugins: [
        [
          stylexBabelPlugin,
          {
            dev: false,
            runtimeInjection: false,
            genConditionalClasses: true,
            treeshakeCompensation: true,
            unstable_moduleResolution: {
              type: 'commonJS',
              rootDir: ROOT,
            },
          },
        ],
        lowerArrows,
      ],
    });

    const declarations = (result?.metadata?.stylex ?? [])
      .map(([, rule]) => rule.ltr.match(/^\.[^{]+\{(.+)\}$/)?.[1])
      .filter(declaration => declaration?.startsWith('padding-block:calc'));

    expect(declarations).toEqual(EXPECTED_PADDING_DECLARATIONS);
  });
});
