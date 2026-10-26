// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file core-internal-modules.cjs
 * @input A module specifier and the directory of the workspace's core package
 * @output The file an internal core module path names: a Lab import of
 *   `@astryxdesign/core/motion/animator`, `@astryxdesign/core/gestures` or
 *   `@astryxdesign/core/utils/touchPresentation`, which core's `exports` do
 *   not list
 * @position Shared by the workspace apps that bundle Lab's build (Sandbox's
 *   Vite config, the docsite's webpack config). Motion and gestures are
 *   internal to core, and Lab reaches them through internal workspace
 *   imports; a bundler that follows core's `exports` refuses those paths.
 *   Each resolves to core's built file (its source with `source`), the same
 *   file core's own components import, so a page keeps one gesture host and
 *   one animator per element.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** The internal module paths Lab imports: motion, gestures, the touch resolver. */
const CORE_INTERNAL_SPECIFIER =
  /^@astryxdesign\/core\/((?:motion|gestures)(?:\/[\w.-]+)*|utils\/touchPresentation)$/;

/**
 * The file an internal core specifier names, or null when the specifier is
 * not one (or the file does not exist). `coreDir` is the core package's
 * directory; the result is a real path, so a bundler sees the same module
 * id as core's own relative imports.
 *
 * @param {string} specifier
 * @param {{coreDir: string, source?: boolean}} options
 * @returns {string | null}
 */
function resolveCoreInternal(specifier, {coreDir, source = false}) {
  const match = CORE_INTERNAL_SPECIFIER.exec(specifier);
  if (match == null) {
    return null;
  }
  const base = path.join(coreDir, source ? 'src' : 'dist', match[1]);
  const candidates = source
    ? [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]
    : [`${base}.js`, path.join(base, 'index.js')];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return fs.realpathSync(file);
    }
  }
  return null;
}

module.exports = {CORE_INTERNAL_SPECIFIER, resolveCoreInternal};
