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
   * camelCase name of the family the definition belongs to, such as
   * `notifications` for `notification`, `notificationActive`, and
   * `notificationOff`. Definitions that share a group are related meanings:
   * the icon finder and the definition's docs page name the other members, so
   * a reader picks the one that fits. A set's own definition may join an
   * Astryx group or name its own. Information only: it never changes ranking.
   */
  group?: string;
  /**
   * The name of an older definition this one takes the place of. The old name
   * keeps answering: a set's `map` key, a template's `icons` value, and a
   * search for it all resolve to this definition, and `integration check`
   * names each `map` key to rename. A replaced definition's file may stay, so
   * the old names it carries keep answering. Replacements stay within one
   * folder: a set's own definition never replaces an Astryx definition.
   */
  replaces?: string;
  /**
   * Marks the definition as experimental (spec:AST-017 FR27): the
   * `icon-definitions` listing shows it as `[experimental]`. Every icon
   * definition already belongs to the experimental icon-set feature.
   */
  stability?: 'experimental';
}
