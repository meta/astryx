// Copyright (c) Meta Platforms, Inc. and affiliates.

/* global module, require, process, __dirname */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('node:path');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  stylexModuleResolution,
} = require('../../scripts/stylex-module-resolution.cjs');

const dev = process.env.NODE_ENV !== 'production';

module.exports = {
  presets: ['next/babel'],
  plugins: [
    [
      '@stylexjs/babel-plugin',
      {
        dev,
        runtimeInjection: false,
        enableInlinedConditionalMerge: true,
        treeshakeCompensation: true,
        aliases: {
          '@/*': [path.join(__dirname, '*')],
        },
        classNamePrefix: 'p',
        unstable_moduleResolution: stylexModuleResolution,
      },
    ],
  ],
};
