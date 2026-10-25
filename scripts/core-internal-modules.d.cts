// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file core-internal-modules.d.cts
 * @output Types for core-internal-modules.cjs, for the configs (Sandbox's
 *   Vite config, the docsite's webpack config) that import it
 */

declare const coreInternalModules: {
  /** The internal module paths Lab imports: motion, gestures, the touch resolver. */
  CORE_INTERNAL_SPECIFIER: RegExp;
  /**
   * The file an internal core specifier names (core's built file, or its
   * source with `source`), as a real path; null when the specifier is not
   * one.
   */
  resolveCoreInternal(
    specifier: string,
    options: {coreDir: string; source?: boolean},
  ): string | null;
};

export = coreInternalModules;
