// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file a11y-spec-files.d.mts
 * @output Types for a11y-spec-files.mjs, for playwright.config.ts, which
 *   imports it
 */

export declare const A11Y_SPEC_GLOBS: readonly string[];
export declare const WEBKIT_A11Y_SPEC_GLOBS: readonly string[];
export declare function globToRegExp(glob: string): RegExp;
export declare function isA11ySpecFile(file: string): boolean;
