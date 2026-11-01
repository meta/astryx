// Copyright (c) Meta Platforms, Inc. and affiliates.

'use strict';

/**
 * @astryxdesign/build/next/postcss — for a Next.js app that builds Astryx from
 * source with `withAstryx()` under Turbopack. It replaces an `@astryx;` rule,
 * written in place of the source-built packages' prebuilt stylesheets, with
 * every rule of those packages, as their prebuilt stylesheets print them
 * (spec:AST-080 FR7). Option: `cwd`, the app root (default: process.cwd()).
 */

const fs = require('fs');
const {sourceStylesheet} = require('./source-stylesheet');

const PLUGIN_NAME = '@astryxdesign/build/next/postcss';

function astryxSourcePlugin(options = {}) {
  const {cwd = process.cwd()} = options;
  return {
    postcssPlugin: PLUGIN_NAME,
    async Once(root, {result}) {
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
      // Turbopack caches this stylesheet, persistently by default, and re-runs
      // the plugin only when a dependency changes: an upgrade, or an edit to a
      // linked package, then rebuilds it with the package's JavaScript.
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

astryxSourcePlugin.postcss = true;

module.exports = astryxSourcePlugin;
