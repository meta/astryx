// Copyright (c) Meta Platforms, Inc. and affiliates.

'use strict';

/**
 * @astryxdesign/build/babel
 *
 * Babel plugin that delegates to @stylexjs/babel-plugin with a
 * different classNamePrefix for Astryx library files vs product files.
 *
 * Library files get 'astryx' prefix (.astryx78zum5), product files get 'x' (.x78zum5).
 */

const LIBRARY_PATTERNS = [
  'packages/core/',
  'packages/themes/',
  'packages/lab/',
  'node_modules/@astryxdesign/',
];

module.exports = function astryxBabelPlugin(api, options) {
  const stylexPlugin = require('@stylexjs/babel-plugin');

  const {
    libraryPatterns = LIBRARY_PATTERNS,
    libraryPrefix = 'astryx',
    classNamePrefix = 'x',
    ...stylexOptions
  } = options;

  // StyleX's upstream default is `silent`, which turns unsupported declarations
  // into missing CSS. Astryx fails closed by default so consumer builds point at
  // the declaration and the supported replacement instead.
  const validatedStylexOptions = {
    propertyValidationMode: 'throw',
    ...stylexOptions,
  };

  // Build the two sets of options — only classNamePrefix differs
  const libraryOpts = {
    ...validatedStylexOptions,
    classNamePrefix: libraryPrefix,
  };
  const productOpts = {...validatedStylexOptions, classNamePrefix};

  // Create two plugin instances
  const libraryPlugin = stylexPlugin(api, libraryOpts);
  const productPlugin = stylexPlugin(api, productOpts);

  function getPluginAndOpts(filename) {
    const isLibrary = libraryPatterns.some(p => filename.includes(p));
    return isLibrary
      ? {plugin: libraryPlugin, opts: libraryOpts}
      : {plugin: productPlugin, opts: productOpts};
  }

  // Helper: call a visitor function with overridden state.opts
  function callVisitor(visitor, key, path, state) {
    const {plugin, opts} = getPluginAndOpts(state.filename || '');
    const v = plugin.visitor[key];
    if (!v) return;

    // Override state.opts so StyleX reads the correct classNamePrefix
    const originalOpts = state.opts;
    state.opts = opts;

    try {
      if (typeof v === 'function') {
        v.call(this, path, state);
      } else if (typeof v === 'object') {
        // enter/exit form — should not happen at top level for stylex
        // but handle it anyway
        if (visitor === 'enter' && v.enter) v.enter.call(this, path, state);
        if (visitor === 'exit' && v.exit) v.exit.call(this, path, state);
      }
    } finally {
      state.opts = originalOpts;
    }
  }

  // Get all visitor keys
  const allKeys = new Set([
    ...Object.keys(libraryPlugin.visitor || {}),
    ...Object.keys(productPlugin.visitor || {}),
  ]);

  const visitor = {};

  for (const key of allKeys) {
    const sample = libraryPlugin.visitor[key] || productPlugin.visitor[key];

    if (typeof sample === 'object' && (sample.enter || sample.exit)) {
      // enter/exit form (Program uses this)
      visitor[key] = {};
      if (sample.enter) {
        visitor[key].enter = function (path, state) {
          callVisitor.call(this, 'enter', key, path, state);
        };
      }
      if (sample.exit) {
        visitor[key].exit = function (path, state) {
          callVisitor.call(this, 'exit', key, path, state);
        };
      }
    } else {
      // Simple function visitor
      visitor[key] = function (path, state) {
        callVisitor.call(this, 'enter', key, path, state);
      };
    }
  }

  return {
    name: 'astryx-babel-plugin',
    visitor,
  };
};
