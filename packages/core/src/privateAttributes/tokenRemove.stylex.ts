// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/tokenRemove.stylex.ts
 * @input Nothing
 * @output tokenRemoveProps, which marks a Token's remove button, and
 *   removeControlOf, which finds that button from an event target
 * @position Owner module of the private token-remove attribute: the only
 *   file that writes its name. Token marks its remove button; Tokenizer
 *   reads the mark. No package entry exports it.
 */

const TOKEN_REMOVE = 'data-astryx-token-remove';

/** Spread on a Token's remove button: marks it for a field holding tokens. */
export const tokenRemoveProps: Readonly<Record<string, string>> = {
  [TOKEN_REMOVE]: '',
};

/** The token remove button at or around `target`, or null. */
export function removeControlOf(target: EventTarget | null): Element | null {
  // A node type check, not `instanceof`: a field in another document passes.
  const node = target as Node | null;
  return node != null && node.nodeType === 1
    ? (node as Element).closest(`[${TOKEN_REMOVE}]`)
    : null;
}
