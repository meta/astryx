// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file spoken.ts
 * @input None (pure functions)
 * @output `spokenWords` and `saysInOrder` — how this package compares a label a
 *   person can read against the name a browser computes.
 * @position Shared by every pattern that encodes WCAG 2.5.3, and by the
 *   bindings that check their own state inventory against the page. One rule,
 *   one implementation: two copies of "does the name contain the label" would
 *   be free to drift, and the day they disagreed neither would be wrong on its
 *   own terms.
 */

/**
 * The words of a label, as a speech-input user would say them.
 *
 * WCAG 2.5.3 is about words: its Understanding text asks that "the words which
 * visually label a component are also the words associated with the component
 * programmatically", and notes that "differences in capitalization and
 * punctuation are not relevant". So case and punctuation are dropped, and what
 * is left is what somebody would actually say.
 */
export function spokenWords(value: string): readonly string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter(word => word !== '');
}

/**
 * Whether `whole` says `part`'s words, in order and unbroken.
 *
 * A substring test would be wrong here: "Sync" is a substring of "Syncing
 * photos", but a speech-input user saying "Sync" is not saying that label.
 */
export function saysInOrder(
  whole: readonly string[],
  part: readonly string[],
): boolean {
  if (part.length === 0) {
    return true;
  }
  return whole.some((_, index) =>
    part.every((word, offset) => whole[index + offset] === word),
  );
}
