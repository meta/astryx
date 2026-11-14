// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file build.kit leaf — the page template to start from, and the kit around it.
 *
 * Every kit names a page template to START from, else the app shell. The page
 * ranker (rank.mjs) orders the page templates; for a whole page the word
 * weights (weights.mjs) decide page or shell and the page-pick model chooses
 * the page from that list (start.mjs). Search's own matches never choose the
 * start, so one noisy signal — search matching "site" to a gallery's "side" —
 * cannot choose the page. A
 * template carries the page frame, the spacing, and the section rhythm; a page
 * composed from components carries none of that, so the kit never recommends
 * composing from scratch while a template exists. Next to the start it names
 * the ranker's next two templates, then groups the unified search into the
 * blocks that cover parts and the domain components to fill gaps, plus the
 * always-on frame + foundation names. `pages` and `directMatch` keep search's
 * own view for callers that read them.
 *
 * signals.mjs computes what the kit is built from and answer.mjs shapes the
 * response; buildKit is the two with build's own blocks.
 *
 * The kit carries RAW `SearchResultEntry` objects and static name arrays only —
 * never pre-formatted command strings. All CLI prefixing (formatCliCommand /
 * getCliInvocation) and the section prose live in the command renderer, so the
 * JSON shape stays package-manager-agnostic and stable across environments.
 *
 * Two commands are the kit's own: `start.command`, the scaffold (`astryx
 * template <id> --type page <path>`, with `<path>` a placeholder), and the `--skeleton`
 * a page entry carries when it is not a direct match, so a loose page reads
 * as a layout preview rather than the thing to build. Neither is prefixing —
 * the invocation stays the renderer's job.
 */

import {kitAnswer} from './answer.mjs';
import {kitSignals} from './signals.mjs';

/**
 * The page template to start from, and the kit around it, with the blocks
 * build names itself.
 *
 * @param {string} query what you're building (e.g. "analytics dashboard")
 * @param {{cwd?: string, type?: import('../../search/search.type.mjs').SearchDomain, limit?: number}} [options]
 * @returns {Promise<import('../build.type.mjs').BuildKitResponse>}
 */
export async function buildKit(query, options = {}) {
  return kitAnswer(await kitSignals(query, options));
}
