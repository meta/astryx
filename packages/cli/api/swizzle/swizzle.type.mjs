// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated types for the `swizzle` command — source of truth for the
 * `swizzle.list` and `swizzle.copy` JSON responses. Re-exported by
 * types/swizzle.d.ts.
 */

/**
 * astryx --json swizzle [--list]
 *
 * @typedef {object} SwizzleListResponse
 * @property {'swizzle.list'} type
 * @property {string} package `@astryxdesign/core`, the package the listed components come from.
 * @property {string[]} data
 */

/**
 * Maintainer feedback note emitted after a successful swizzle.
 *
 * @typedef {object} SwizzleFeedback
 * @property {string} issuesUrl Where to report the gap that led to swizzling.
 * @property {string} [ghCommand] Ready-to-run `gh issue create` command, when `gh` is available.
 */

/**
 * astryx --json swizzle <component>
 *
 * @typedef {object} SwizzleCopyResponse
 * @property {'swizzle.copy'} type
 * @property {string} package Owner package the component source was copied from (as `data.package`).
 * @property {object} data
 * @property {string} data.component
 * @property {string} data.package Owner package the component source was copied from.
 * @property {string} data.outputDir
 * @property {number} data.filesCopied
 * @property {string[]} data.files
 * @property {boolean} data.usesStyleX Whether any copied file uses StyleX (requires build-time setup).
 * @property {SwizzleFeedback} [data.feedback]
 */

/**
 * Options for `swizzle()`.
 * @typedef {object} SwizzleOptions
 * @property {string} [cwd]
 * @property {string} [output] Output directory (must resolve inside cwd). Defaults to ./components/astryx.
 * @property {string} [package] Scope to a specific owning package when a name is ambiguous.
 * @property {boolean} [list] Force the list response even with a component argument.
 * @property {boolean} [overwrite] Overwrite existing files instead of erroring.
 */

export {};
