// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tsup.config.ts
 * @input Uses tsup
 * @output Bundle configuration for CJS/ESM outputs with TypeScript declarations
 * @position Build config; defines entry points and output formats for @astryxdesign/vega
 *
 * SYNC: When modified, update this header and /packages/vega/README.md
 */

import {defineConfig} from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: false,
  splitting: true,
  clean: true,
  // The Astryx packages stay external so consumers share one copy of the
  // charts palette and the theme context rather than getting a bundled fork.
  external: [
    '@astryxdesign/charts',
    '@astryxdesign/core',
    'react',
    'react-dom',
    'vega',
    'vega-lite',
  ],
});
