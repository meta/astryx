// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The text form of an icon set's default look: the name of the variant
 * it draws when no look is asked for.
 *
 * @input an icon set's `default`, `{variant?: string}`, or nothing
 * @output the variant name, `outline`, or undefined when it names none
 * @position packages/cli/foundation/text — printed by `experimental icon
 *   --list` and by discover's icon set page
 */

/**
 * The text form of an icon set's default look, as every text view prints it.
 * A default that names no variant has no text, so a record leaves the field
 * out.
 * @param {unknown} look
 * @returns {string | undefined}
 */
export function defaultVariantText(look) {
  const variant = /** @type {{variant?: unknown} | null | undefined} */ (look)
    ?.variant;
  return typeof variant === 'string' && variant !== '' ? variant : undefined;
}
