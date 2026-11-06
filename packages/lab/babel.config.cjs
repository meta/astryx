// Copyright (c) Meta Platforms, Inc. and affiliates.

'use strict';

/* global module, require */

// StyleX resolves this package's imports of workspace `.stylex` files (core's
// tokens, markers) to their source files, as the workspace's other StyleX
// configs do: see scripts/stylex-module-resolution.cjs.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const resolution = require('../../scripts/stylex-module-resolution.cjs');

module.exports = {
  presets: [
    ['@babel/preset-react', {runtime: 'automatic', development: false}],
    ['@babel/preset-typescript', {isTSX: true, allExtensions: true}],
  ],
  plugins: [
    './babel-plugin-add-extensions.cjs',
    [
      '@stylexjs/babel-plugin',
      {
        dev: false,
        runtimeInjection: false,
        genConditionalClasses: true,
        treeshakeCompensation: true,
        unstable_moduleResolution: resolution.stylexModuleResolution,
      },
    ],
  ],
};
