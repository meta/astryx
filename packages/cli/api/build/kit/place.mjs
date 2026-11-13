// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Where each block a kit names goes in the template it starts from: the
 * start's slot whose kind the block fits.
 * @input The start template's declared slots, each listed block's declared
 *   fits, and the request.
 * @output For each listed block, the name of the start's slot it goes in, or
 *   none.
 * @position api/build/kit, beside answer.mjs, which attaches the slot and the
 *   fits to each listed block. Pure: no file, network, or environment access.
 *
 * A block names the kinds of place it goes in, best first (`fits`); a page
 * names its places, each with one kind (`slots`). A block goes in the slot
 * whose kind is its best fit that the page has; the page body (`main`) takes
 * any block that goes in a page when the page has no slot of a kind the block
 * fits. Between two slots of the same kind, a block goes to the one whose
 * name shares more of the block's own words, then whose name and description
 * share more of them, then more of the request's words, then to the first. An
 * overlay or an inline piece goes in no slot: it opens from a trigger, or
 * sits inside another piece. A block that declares no fits, or an empty list
 * (a reference), goes in no slot.
 */

import {slotTakes} from '../../../authoring/doctypes/template/slot-kinds.mjs';
import {STOPWORDS} from '../../search/_query.mjs';

/**
 * @typedef {import('../../../foundation/discovery/template-adapter.mjs').TemplateSlotInfo} TemplateSlotInfo
 */

/**
 * A text's content words, lowercase, with a plural "s" removed from words
 * over three letters, so "charts" meets "chart".
 * @param {string} text
 * @returns {Set<string>}
 */
export function wordsIn(text) {
  return new Set(
    (String(text).toLowerCase().match(/[a-z0-9]+/g) ?? [])
      .filter(w => w.length > 1 && !STOPWORDS.has(w))
      .map(w => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)),
  );
}

/**
 * A block's own words: its id and display name split at each capital, and its
 * description.
 * @param {{name?: string, displayName?: string, description?: string}} block
 * @returns {Set<string>}
 */
export function blockWords(block) {
  const split = (/** @type {string | undefined} */ text) =>
    String(text ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return wordsIn(`${split(block.name)} ${split(block.displayName)} ${block.description ?? ''}`);
}

/**
 * How many of these words the set holds.
 * @param {Set<string>} words
 * @param {Set<string>} set
 */
const shared = (words, set) => {
  let n = 0;
  for (const word of words) if (set.has(word)) n += 1;
  return n;
};

/**
 * The name of the slot a block goes in, or null.
 * @param {readonly string[] | undefined} fits the block's kinds, best first
 * @param {readonly TemplateSlotInfo[] | undefined} slots the page's slots, in
 *   reading order
 * @param {Set<string>} [requestWords] the request's content words
 *   ({@link wordsIn})
 * @param {Set<string>} [ownWords] the block's own words ({@link blockWords});
 *   with the request's words, they pick between slots of the same kind
 * @returns {string | null}
 */
export function slotFor(fits, slots, requestWords = new Set(), ownWords = new Set()) {
  if (!fits?.length || !slots?.length) return null;
  /** @type {{name: string, score: number[]} | null} */
  let best = null;
  slots.forEach((slot, at) => {
    // The block's best fit this slot holds as its own kind, else the body's
    // place for it, after every exact kind.
    let rank = fits.findIndex(kind => kind === slot.kind && slotTakes(slot.kind, kind));
    if (rank < 0) {
      const body = fits.findIndex(kind => slotTakes(slot.kind, kind));
      if (body < 0) return;
      rank = fits.length + body;
    }
    const name = wordsIn(slot.name.replace(/-/g, ' '));
    const all = wordsIn(`${slot.name.replace(/-/g, ' ')} ${slot.description ?? ''}`);
    // Lower is better, compared in order.
    const score = [
      rank,
      -shared(ownWords, name),
      -shared(ownWords, all),
      -shared(requestWords, all),
      at,
    ];
    const current = /** @type {{name: string, score: number[]} | null} */ (best);
    if (current == null || isLower(score, current.score)) best = {name: slot.name, score};
  });
  return best ? /** @type {{name: string}} */ (best).name : null;
}

/**
 * Whether the first score comes before the second, comparing each place in
 * turn.
 * @param {number[]} a
 * @param {number[]} b
 */
function isLower(a, b) {
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}
