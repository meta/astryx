// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The run's base, readable by modules that load before the base
 * resolver. It imports nothing, so the release modules the bin reads first
 * can ask for the base and pay nothing for it.
 * @input the resolver, which registers itself when it loads
 * @output currentRunBase()
 * @position foundation/bases — no resolver loaded means no project loaded,
 *   and Core answers
 */

/** @type {(() => {ok: boolean, base: {name: string, core: boolean, version: string | null} | null}) | null} */
let resolver = null;

/**
 * Register the function that resolves the run's base.
 * @param {() => {ok: boolean, base: {name: string, core: boolean, version: string | null} | null}} resolve
 */
export function registerRunBaseResolver(resolve) {
  resolver = resolve;
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
