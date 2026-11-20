// Copyright (c) Meta Platforms, Inc. and affiliates.

'use strict';

/**
 * @astryxdesign/build: a webpack pre-loader that `withAstryx()` installs for
 * the app's own modules. It makes each module depend on every swizzle marker
 * path that decides how the module compiles, so webpack rebuilds the module,
 * and its cached class names, when a marker appears or disappears. It does
 * not change the source.
 */

const fs = require('node:fs');
const {markerPaths} = require('./swizzle-marker');

module.exports = function astryxSwizzleMarkerLoader(source, map, meta) {
  for (const marker of markerPaths(this.resourcePath, this.rootContext)) {
    if (fs.existsSync(marker)) {
      this.addDependency(marker);
      break;
    }
    this.addMissingDependency(marker);
  }
  this.callback(null, source, map, meta);
};
