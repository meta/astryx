// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file parseDoc as every reader outside the themes root has always seen it.
 *
 * @input Any authored doc value and a label for messages.
 * @output The parsed doc, or the parser's error.
 * @position The public `parseDoc` also accepts theme descriptors. Component,
 *   hook, self-doc, and topic readers never did: to them a theme descriptor is
 *   an unsupported type, with the message they have always printed.
 */

import {parseDoc} from '../../authoring/doctypes/parse.mjs';

/**
 * @param {unknown} input
 * @param {string} [label]
 * @returns {any}
 */
export function parseReadableDoc(input, label = 'doc') {
  const type =
    input && typeof input === 'object' && 'type' in input
      ? /** @type {{type?: unknown}} */ (input).type
      : undefined;
  if (type === 'theme') {
    throw new Error(`${label} has unsupported type ${JSON.stringify(type)}.`);
  }
  return parseDoc(input, label);
}
