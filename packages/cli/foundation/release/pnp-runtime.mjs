// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The Yarn Plug'n'Play runtime a copy needs to see a project's packages.
 *
 * A Plug'n'Play project keeps no node_modules. Only its runtime, the
 * `.pnp.cjs` file Yarn writes at the project root (with `.pnp.loader.mjs`
 * beside it for ES modules), knows where the project's packages are, and Yarn
 * preloads that runtime into every command it runs. A copy that a person or
 * an agent starts directly, such as the copy installed for the computer, runs
 * without it, so it sees neither the project's own CLI nor its Core. The
 * hand-off starts such a copy again with the runtime preloaded, as Yarn starts
 * a command, and that run then makes the release choice (spec AST-081 FR9).
 *
 * Plain files only, as in project.mjs: the bin reads this before it loads
 * anything else.
 *
 * @input a folder
 * @output the project's runtime, and the environment that preloads it
 * @position foundation/release — read by the hand-off before the release
 *   choice.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import {readReleaseFacts, REPOSITORY_MARKERS} from './project.mjs';

/**
 * A Plug'n'Play runtime: Yarn's `.pnp.cjs`, and the ES module loader Yarn
 * writes beside it when the project needs one.
 * @typedef {object} PnpRuntime
 * @property {string} file the `.pnp.cjs` file
 * @property {string | null} loader the `.pnp.loader.mjs` file, or null
 */

/**
 * The runtime of the Plug'n'Play project that `dir` is in: the nearest
 * `.pnp.cjs` in `dir` or in a folder above it, within the limits of the
 * project search (project.mjs): the search ends at a repository's root, and
 * reads the home folder only when it starts there.
 * @param {string} dir
 * @returns {PnpRuntime | null} null when no folder holds one
 */
export function findPnpRuntime(dir) {
  const home = path.resolve(os.homedir());
  const start = path.resolve(dir);
  let current = start;
  for (;;) {
    const file = path.join(current, '.pnp.cjs');
    if ((current !== home || current === start) && fs.existsSync(file)) {
      const loader = path.join(current, '.pnp.loader.mjs');
      return {file, loader: fs.existsSync(loader) ? loader : null};
    }
    if (REPOSITORY_MARKERS.some(m => fs.existsSync(path.join(current, m)))) {
      return null;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * A path as `NODE_OPTIONS` takes it: quoted when it holds white space, as
 * Yarn quotes it.
 * @param {string} value
 * @returns {string}
 */
function nodeOptionValue(value) {
  return /\s/u.test(value) ? JSON.stringify(value) : value;
}

/**
 * Do the Node options `nodeOptions` preload `runtime` already, as Yarn writes
 * them or as {@link withPnpRuntime} does? Quoting doubles each backslash of a
 * Windows path, so both spellings are read.
 * @param {string | undefined} nodeOptions
 * @param {PnpRuntime} runtime
 * @returns {boolean}
 */
export function preloads(nodeOptions, runtime) {
  const text = String(nodeOptions ?? '');
  return (
    text.includes(runtime.file) || text.includes(nodeOptionValue(runtime.file))
  );
}

/**
 * The runtime that a run in `cwd` must preload to see its project, or null
 * when the run needs none. A run needs one only when all of these are true:
 * it runs outside a Plug'n'Play runtime; a `.pnp.cjs` is in the folder or a
 * folder above it; a package.json under that runtime's folder declares
 * Astryx for the folder; and the run sees no installed Astryx CLI or Core
 * without the runtime. A run whose Node options preload that runtime already
 * needs none either, so a runtime that does not start never makes a run start
 * again.
 * @param {string} cwd
 * @param {string | undefined} nodeOptions the run's `NODE_OPTIONS`
 * @returns {PnpRuntime | null}
 */
export function runtimeToPreload(cwd, nodeOptions) {
  if (process.versions.pnp) return null;
  const runtime = findPnpRuntime(cwd);
  if (!runtime || preloads(nodeOptions, runtime)) return null;
  const facts = readReleaseFacts(cwd);
  if (!facts.declaringDir || facts.cli || facts.core) return null;
  const relative = path.relative(
    path.dirname(runtime.file),
    facts.declaringDir,
  );
  return relative.startsWith('..') || path.isAbsolute(relative)
    ? null
    : runtime;
}

/**
 * `env` with `runtime` preloaded the way Yarn preloads it into the commands it
 * runs: `NODE_OPTIONS` gains `--require` with the runtime and, when the
 * project has one, `--experimental-loader` with its ES module loader. A path
 * that holds white space is quoted, as Yarn quotes it.
 * @param {NodeJS.ProcessEnv} env
 * @param {PnpRuntime} runtime
 * @returns {NodeJS.ProcessEnv}
 */
export function withPnpRuntime(env, runtime) {
  const options = [`--require ${nodeOptionValue(runtime.file)}`];
  if (runtime.loader) {
    options.push(
      `--experimental-loader ${nodeOptionValue(pathToFileURL(runtime.loader).href)}`,
    );
  }
  const existing = env.NODE_OPTIONS?.trim();
  return {
    ...env,
    NODE_OPTIONS: [existing, ...options].filter(Boolean).join(' '),
  };
}
