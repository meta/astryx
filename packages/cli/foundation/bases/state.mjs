// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The run's base, readable by modules that load before the base
 * resolver: the package `--base` names, and the resolver's answer once it
 * loads. It imports nothing, so the bin can record `--base`, and the modules
 * it reads first can ask for the base, and pay nothing for it.
 * @input `--base`, and the resolver, which registers itself when it loads
 * @output requestedBase(), loadedRunBase() and currentNonCoreBase()
 * @position foundation/bases — no resolver loaded means no project loaded,
 *   and Core answers
 */

/** @type {string | null} */
let requested = null;

/**
 * Set the package `--base` names for this run; null when it names none.
 * @param {string | null | undefined} name
 */
export function setRequestedBase(name) {
  requested = typeof name === 'string' && name.length > 0 ? name : null;
}

/** @returns {string | null} */
export function requestedBase() {
  return requested;
}

/** @typedef {import('./resolve.mjs').BaseResolution} BaseResolution */

/** @type {(() => BaseResolution) | null} */
let resolver = null;

/**
 * Register the function that resolves the run's base.
 * @param {() => BaseResolution} resolve
 */
export function registerRunBaseResolver(resolve) {
  resolver = resolve;
}

/**
 * The resolver's answer for the run, or null when no resolver has loaded.
 * @returns {BaseResolution | null}
 */
export function loadedRunBase() {
  return resolver == null ? null : resolver();
}

/** True while the resolver runs, so a lookup it makes reads no base. */
let resolving = false;

/**
 * The run's base when it resolves to a base other than Core; null when the
 * run reads Core or its base does not resolve.
 * @returns {{name: string, version: string | null} | null}
 */

export function currentNonCoreBase() {
  if (resolver == null || resolving) return null;
  resolving = true;
  try {
    const run = resolver();
    return run.ok && run.base && !run.base.core
      ? {name: run.base.name, version: run.base.version}
      : null;
  } catch {
    return null;
  } finally {
    resolving = false;
  }
}
