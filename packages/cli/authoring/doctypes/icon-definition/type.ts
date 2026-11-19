// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Icon meaning doc type (AST-084).
 *
 * An icon meaning is one thing an icon can stand for, such as `close` or
 * `delete`. Astryx ships one `<name>.doc.mjs` per meaning in the CLI; an icon
 * set can add its own in `<iconSetsRoot>/<set>/definitions/<name>.doc.mjs`, in
 * the same format. A set's data file `map` registers which of its icons
 * draws each meaning, so a template written against meanings swaps
 * sets by lookup.
 *
 * @input metadata authored for one meaning
 * @output the public IconDefinitionDoc contract
 * @position packages/cli/authoring/doctypes/icon-definition — meaning vocabulary
 */

/**
 * One icon meaning.
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
 * @experimental Icon meanings may change or be removed in a patch release
 * (spec:AST-017 FR27).
 */
export interface IconDefinitionDoc {
  /** Doc-kind discriminant. */
  type: 'icon-definition';
  /** camelCase identity, the key a data file's `map` uses. Must match the file name. */
  name: string;
  /** One sentence: what an icon with this meaning is for. */
  description: string;
  /** Lower-case terms a person might search for; at least one. */
  words: string[];
  /**
   * Only on Astryx's own meanings: the meaning is a shared icon name Core
   * renders (`IconName`), so every icon set maps it.
   */
  builtIn?: true;
  /**
   * camelCase name of the family the meaning belongs to, such as
   * `notifications` for `notification`, `notificationActive`, and
   * `notificationOff`. Meanings that share a group are related meanings:
   * the icon finder and the meaning's docs page name the other members, so
   * a reader picks the one that fits. A set's own meaning may join an
   * Astryx group or name its own. Information only: it never changes ranking.
   */
  group?: string;
  /**
   * The name of an older meaning this one takes the place of. The old name
   * keeps answering: a set's `map` key, a template's `icons` value, and a
   * search for it all resolve to this meaning, and `integration check`
   * names each `map` key to rename. A replaced meaning's file may stay, so
   * the old names it carries keep answering. Replacements stay within one
   * folder: a set's own meaning never replaces an Astryx meaning.
   */
  replaces?: string;
  /**
   * Marks the meaning as experimental (spec:AST-017 FR27): the
   * `icon-definitions` listing shows it as `[experimental]`. Every icon
   * meaning already belongs to the experimental icon-set feature.
   */
  stability?: 'experimental';
}
