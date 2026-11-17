// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Icon definition doc type (AST-084).
 *
 * An icon definition is one thing an icon can stand for, such as `close` or
 * `delete`. Astryx ships one `<name>.doc.mjs` per definition in the CLI; an icon
 * set can add its own in `<iconSetsRoot>/<set>/definitions/<name>.doc.mjs`, in
 * the same format. A set's data file `map` registers which of its icons
 * draws each definition, so a template written against definitions swaps
 * sets by lookup.
 *
 * @input metadata authored for one definition
 * @output the public IconDefinitionDoc contract
 * @position packages/cli/authoring/doctypes/icon-definition — definition vocabulary
 */

/**
 * One icon definition.
 *
 * @example
 * ```
 * /** @type {import('@astryxdesign/cli/authoring').IconDefinitionDoc} *\/
 * export default {
 *   type: 'icon-definition',
 *   name: 'delete',
 *   description: 'Delete something permanently.',
 *   words: ['trash', 'bin', 'discard'],
 * };
 * ```
 *
 * @experimental Icon definitions may change or be removed in a patch release
 * (spec:AST-017 FR27).
 */
export interface IconDefinitionDoc {
  /** Doc-kind discriminant. */
  type: 'icon-definition';
  /** camelCase identity, the key a data file's `map` uses. Must match the file name. */
  name: string;
  /** One sentence: what an icon with this definition is for. */
  description: string;
  /** Lower-case terms a person might search for; at least one. */
  words: string[];
  /**
   * Only on Astryx's own definitions: the definition is a shared icon name Core
   * renders (`IconName`), so every icon set maps it.
   */
  builtIn?: true;
  /**
   * Marks the definition as experimental (spec:AST-017 FR27): the
   * `icon-definitions` listing shows it as `[experimental]`. Every icon
   * definition already belongs to the experimental icon-set feature.
   */
  stability?: 'experimental';
}
