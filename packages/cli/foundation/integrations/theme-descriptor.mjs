// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The source text of a typed integration theme descriptor.
 *
 * @input A theme's descriptor fields.
 * @output The `.doc.mjs` source that declares them under their ThemeDoc type.
 * @position Shared by `integration add theme`, which scaffolds a descriptor,
 *   and the codemod that turns a 0.6 theme catalog into descriptors, so both
 *   write the same bytes.
 */

/**
 * A single-quoted JavaScript string literal for any text.
 * @param {string} value
 */
function quote(value) {
  const escaped = value
    .replace(/\\/gu, '\\\\')
    .replace(/'/gu, "\\'")
    .replace(/\n/gu, '\\n')
    .replace(/\r/gu, '\\r')
    .replace(/\u2028/gu, '\\u2028')
    .replace(/\u2029/gu, '\\u2029');
  return `'${escaped}'`;
}

/**
 * @param {import('../../authoring/doctypes/theme/type.js').ThemeDoc} doc
 * @returns {string}
 */
export function themeDescriptorSource(doc) {
  return [
    "/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */",
    'export default {',
    "  type: 'theme',",
    `  name: ${quote(doc.name)},`,
    `  displayName: ${quote(doc.displayName)},`,
    `  description: ${quote(doc.description)},`,
    `  maintained: ${doc.maintained},`,
    '};',
    '',
  ].join('\n');
}
