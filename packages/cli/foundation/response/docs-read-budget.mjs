// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The most one docs read may return, and how a read's size is measured.
 *
 * @input A docs payload (an index, a whole topic, or one section).
 * @output Its size in bytes as `--json` prints it.
 * @position Read by `astryx docs` to choose between a whole topic and its
 *   section list, and by Doctor's docs checks and the self-doc audits
 *   (through foundation/discovery/docs-output-budget.mjs), which hold each
 *   section index and each section to it.
 */

/** The most one section index or one section may hold, in bytes. */
export const DOC_OUTPUT_BUDGET_BYTES = 32 * 1024;

/**
 * A payload's size as `--json` prints it: the envelope data, two-space
 * indented, in UTF-8 bytes.
 * @param {unknown} payload
 * @returns {number}
 */
export function docPayloadBytes(payload) {
  return Buffer.byteLength(JSON.stringify(payload, null, 2), 'utf8');
}
