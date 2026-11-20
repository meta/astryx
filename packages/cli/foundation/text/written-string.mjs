// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The string a syntax node writes as it is: a quoted string, or a
 *   template literal with nothing put in it (`` `../shared.ts` ``).
 * @input A Babel syntax node.
 * @output Its string, or null when it writes none as it is.
 * @position Read by the module readers that take an import's specifier
 *   (foundation/discovery/template-needs.mjs,
 *   foundation/render/embedded-imports.mjs), by doctor's button-action reader
 *   (foundation/discovery/button-actions.mjs) and by the export's prop-value
 *   reader (foundation/discovery/written-prop-values.mjs), so all read one
 *   rule.
 */

/**
 * @param {any} node
 * @returns {string | null}
 */
export function writtenString(node) {
  if (node?.type === 'StringLiteral') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0)
    return node.quasis[0]?.value?.cooked ?? null;
  return null;
}
