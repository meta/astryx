// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Theme contribution descriptor type.
 *
 * A theme descriptor is a strongly typed `.doc.mjs` beside its same-stem theme
 * source. The shared stem identifies the source entry and required named runtime
 * export. The lower-kebab parent directory and `name` identify the CLI theme.
 *
 * @input metadata authored beside one source theme
 * @output the public ThemeDoc contract
 * @position packages/cli/authoring/doctypes/theme — theme descriptor vocabulary
 */

/**
 * The descriptor for one source theme contributed by an integration or bundled
 * with the CLI.
 *
 * @example
 * ```
 * /** @type {import('@astryxdesign/cli/authoring').ThemeDoc} *\/
 * export default {
 *   type: 'theme',
 *   name: 'ocean',
 *   displayName: 'Ocean',
 *   description: 'Cool blue surfaces with crisp contrast.',
 *   maintained: true,
 * };
 * ```
 */
export interface ThemeDoc {
  /** Doc-kind discriminant. */
  type: 'theme';
  /** Stable CLI identity. Must be lower-kebab and match the parent directory. */
  name: string;
  /** Human-readable name shown by theme listings. */
  displayName: string;
  /** One-line summary shown by theme listings. */
  description: string;
  /** Whether the owning package actively maintains this theme. */
  maintained: boolean;
}
