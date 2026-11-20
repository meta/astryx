// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The shape of a custom property name that StyleX generates.
 * @input  nothing
 * @output STYLEX_GENERATED_VARIABLE, a regular expression source
 * @position scripts/lib — read by scripts/build-css.mjs (undefined generated
 *           variables) and scripts/api-report/generate.mjs (custom properties
 *           left out of the report)
 *
 * SYNC: packages/build/src/undefinedVariables.ts uses the same hash bound for
 * an app's production build.
 */

/**
 * StyleX names a variable it generates `--x<hash>`: the package builds' class
 * name prefix `x`, then a 32-bit hash in base 36. Only four to seven hash
 * characters count. A hash is shorter than four characters about once in a
 * hundred thousand, and authored short names such as `--xl` keep that form.
 * A dash after the prefix (`--x-<property>`, a dynamic-style variable StyleX
 * sets inline) is not a generated name.
 */
export const STYLEX_GENERATED_VARIABLE = '--x[a-z0-9]{4,7}';
