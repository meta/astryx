// Copyright (c) Meta Platforms, Inc. and affiliates.

'use strict';

/**
 * @astryxdesign/build
 *
 * Unified build configuration for Astryx source builds. The complete PostCSS
 * helper resolves its bundled Autoprefixer from this package rather than from
 * the consuming project's dependency graph.
 *
 * Usage:
 *   // babel.config.js
 *   const {babel} = require('@astryxdesign/build');
 *   module.exports = babel(__dirname);
 *
 *   // postcss.config.js
 *   const {postcss} = require('@astryxdesign/build');
 *   module.exports = postcss(__dirname);
 */

const path = require('node:path');

/**
 * Resolve Astryx package aliases from a root directory.
 * Handles both npm installs (node_modules/@astryxdesign/core) and
 * monorepo layouts (packages/core).
 */
function resolveAliases(rootDir) {
  const coreDir = path.join(rootDir, 'node_modules/@astryxdesign/core');
  return {
    '@astryxdesign/core/*': [path.join(coreDir, '*')],
    '@astryxdesign/core': [coreDir],
  };
}

/**
 * Build shared StyleX babel plugin options from a root directory.
 */
function stylexOptions(rootDir, overrides = {}) {
  return {
    dev: process.env.NODE_ENV !== 'production',
    runtimeInjection: false,
    propertyValidationMode: 'throw',
    enableInlinedConditionalMerge: true,
    treeshakeCompensation: true,
    aliases: resolveAliases(rootDir),
    unstable_moduleResolution: {
      type: 'commonJS',
    },
    ...overrides,
  };
}

/**
 * Generate a complete babel.config.js for Astryx source builds.
 *
 * @param {string} rootDir — __dirname of the project root
 * @param {object} [overrides] — extra StyleX options to merge
 * @returns {object} babel config object
 */
function babel(rootDir, overrides = {}) {
  return {
    presets: [
      // Enable `allowDeclareFields` on the TypeScript preset. Next's
      // `next/babel` preset does not set this by default, so any raw `.ts`
      // that uses `declare` class fields (a TS 3.7+ construct) fails to
      // compile. Astryx source builds resolve dependencies via the `source`
      // export condition, so a `source`-shipping dependency imported from an
      // Astryx package (e.g. `lexical`/`@lexical/*`, pulled in by the lab
      // RichTextEditor) is fed its untranspiled `.ts` — including
      // `declare ['constructor']: …` fields — straight to Babel. Accepting
      // `declare` fields is correct TS semantics (they are type-only and
      // dropped from output) and is safe for all files, not just lexical.
      ['next/babel', {'preset-typescript': {allowDeclareFields: true}}],
    ],
    plugins: [
      [require.resolve('./babel.js'), stylexOptions(rootDir, overrides)],
    ],
  };
}

/**
 * Generate a complete postcss.config.js for Astryx source builds.
 *
 * @param {string} rootDir — __dirname of the project root
 * @param {object} [overrides] — extra options (appDir, extraInclude, etc.)
 * @returns {object} postcss config object
 */
function postcss(rootDir, overrides = {}) {
  const {appDir = 'src', extraInclude = [], ...rest} = overrides;
  return {
    plugins: {
      [require.resolve('./index.js')]: {
        cwd: rootDir,
        appDir,
        babelPlugins: [
          ['@stylexjs/babel-plugin', stylexOptions(rootDir, rest)],
        ],
        extraInclude,
      },
      [require.resolve('autoprefixer')]: {},
    },
  };
}

module.exports = {babel, postcss, stylexOptions, resolveAliases};
