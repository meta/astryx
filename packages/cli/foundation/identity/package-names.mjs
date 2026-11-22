// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The npm package names of Astryx's built-in providers, as plain
 * strings. It imports nothing, so a module that needs only a name loads no
 * identity code.
 * @input Stable npm package names owned by Astryx.
 * @output CORE_PACKAGE_NAME and CLI_PACKAGE_NAME.
 * @position foundation/identity — the one definition of these names: read by
 *   ./providers.mjs, which brands them, by the bases, which name Core by its
 *   package, and by the release facts (foundation/release/project.mjs), which
 *   pass them on.
 */

/** Core's package name. */
export const CORE_PACKAGE_NAME = '@astryxdesign/core';

/** The CLI's package name. */
export const CLI_PACKAGE_NAME = '@astryxdesign/cli';
