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
 * fits. Two slots of the same kind go to the one whose own name and
 * description share more of the request's words, then to the first. An
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
 * The name of the slot a block goes in, or null.
 * @param {readonly string[] | undefined} fits the block's kinds, best first
 * @param {readonly TemplateSlotInfo[] | undefined} slots the page's slots, in
 *   reading order
 * @param {Set<string>} [requestWords] the request's content words
 *   ({@link wordsIn}), which pick between slots of the same kind
 * @returns {string | null}
 */
export function slotFor(fits, slots, requestWords = new Set()) {
  if (!fits?.length || !slots?.length) return null;
  /** @type {{name: string, rank: number, shared: number, at: number} | null} */
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
    const own = wordsIn(`${slot.name.replace(/-/g, ' ')} ${slot.description ?? ''}`);
    let shared = 0;
    for (const word of requestWords) if (own.has(word)) shared += 1;
    if (
      best == null ||
      rank < best.rank ||
      (rank === best.rank && shared > best.shared)
    ) {
      best = {name: slot.name, rank, shared, at};
    }
  });
  return best ? /** @type {{name: string}} */ (best).name : null;
}
