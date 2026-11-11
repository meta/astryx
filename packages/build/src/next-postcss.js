// Copyright (c) Meta Platforms, Inc. and affiliates.

'use strict';

/**
 * @astryxdesign/build/next/postcss: for a Next.js app that builds Astryx from
 * source with `withAstryx()` under Turbopack. It replaces an `@astryx;` rule
 * with every rule of the source-built packages, as their prebuilt stylesheets
 * print them. It fails on a source-built package's prebuilt stylesheet, since
 * its rules would load twice, the second copy outside the source build.
 */

const fs = require('fs');
const path = require('path');
const {
  PREBUILT_STYLESHEETS,
  prebuiltStylesheet,
  sourcePackages,
  sourceStylesheet,
} = require('./source-stylesheet');

const PLUGIN_NAME = '@astryxdesign/build/next/postcss';

const PREBUILT_NAMES = new Set(
  Object.values(PREBUILT_STYLESHEETS).map(file => path.basename(file)),
);

/**
 * Fail when `from` is the prebuilt stylesheet of a package the app builds from
 * source. Its rules would load twice. The second copy would sit outside the
 * source build.
 */
function refusePrebuilt(from, cwd) {
  if (!from || !PREBUILT_NAMES.has(path.basename(from))) return;
  const file = fs.realpathSync.native(from);
  for (const pkg of sourcePackages(cwd)) {
    const prebuilt = prebuiltStylesheet(pkg);
    if (
      prebuilt != null &&
      fs.existsSync(prebuilt) &&
      fs.realpathSync.native(prebuilt) === file
    ) {
      throw new Error(
        `[${PLUGIN_NAME}] ${pkg.name} is built from source, so its prebuilt ` +
          `stylesheet ${pkg.name}/${path.basename(prebuilt)} must not load: ` +
          'remove its import. `@astryx;` emits its rules (see "Next.js ' +
          'Setup (Turbopack)" in the @astryxdesign/build README).',
      );
    }
  }
}

/**
 * The PostCSS plugin. List it in the app's PostCSS config, and put one
 * `@astryx;` rule in the app's global stylesheet.
 *
 * @param {{cwd?: string}} [options] `cwd` is the app root (default:
 *   `process.cwd()`).
 */
function astryxSourcePlugin(options = {}) {
  const {cwd = process.cwd()} = options;
  return {
    postcssPlugin: PLUGIN_NAME,
    async Once(root, {result}) {
      refusePrebuilt(result.opts.from, cwd);
      const markers = [];
      root.walkAtRules('astryx', rule => {
        if (!rule.params) markers.push(rule);
      });
      if (markers.length === 0) {
        return;
      }
      if (markers.length > 1) {
        throw markers[1].error(
          'Only one @astryx rule is allowed per stylesheet.',
        );
      }
      const {css, packages} = await sourceStylesheet({cwd});
      if (packages.length === 0) {
        throw markers[0].error(
          'No Astryx package with `source` entries is installed, so there is ' +
            'nothing to compile. Install @astryxdesign/core, or import ' +
            "'@astryxdesign/core/astryx.css' instead of using @astryx.",
        );
      }
      // The host PostCSS parses the replacement, so this plugin needs no copy
      // of PostCSS of its own.
      if (css) markers[0].replaceWith(css);
      else markers[0].remove();
      // Turbopack caches this stylesheet, persistently by default. The plugin
      // reports each package's source directory as a dependency, so a change
      // there runs it again.
      for (const {srcDir} of packages) {
        result.messages.push({
          type: 'dir-dependency',
          plugin: PLUGIN_NAME,
          parent: result.opts.from,
          dir: fs.realpathSync.native(srcDir),
          glob: '**/*.{ts,tsx}',
        });
      }
    },
  };
}

module.exports = Object.assign(astryxSourcePlugin, {postcss: true});
