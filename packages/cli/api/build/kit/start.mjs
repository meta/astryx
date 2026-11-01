// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The page template a kit starts from: the page ranker's pick when it has
 * the evidence to lead, the template a part lives in, else the app shell.
 */

import {loadWeights} from '../_adapter.mjs';
import {asksForNewPage} from './kind.mjs';
import {pickStart} from './rank.mjs';
import {weighStart} from './weights.mjs';

/**
 * @typedef {import('../../search/search.type.mjs').SearchResultEntry} SearchResultEntry
 * @typedef {import('../build.type.mjs').BuildStart} BuildStart
 * @typedef {import('../_adapter.mjs').PageTemplate} PageTemplate
 */

/**
 * Where a page starts when no page template matched: the first of these the
 * project can scaffold. A top nav over empty, full-width content is the least
 * opinionated frame that still has navigation; `blank` is the floor, with no
 * chrome at all. Either one still hands the reader a page frame and its
 * padding, which composing from components does not.
 */
const FALLBACK_STARTS = ['shell-top-nav', 'blank'];

/**
 * A page template as the kit names it: the command that selects exactly that
 * template, scaffolding into `<path>`, a placeholder for the file or folder to
 * write it to.
 * @param {PageTemplate} t
 */
export const asTemplate = t => ({
  name: t.name,
  package: t.package,
  displayName: t.displayName,
  description: t.description,
  command: `${t.command} <path>`,
});

/**
 * Why a part of a page, or a change to a page the builder already has, starts
 * where it does (spec:AST-048/FR3, FR9): the rest of the start's reason, or
 * null for a whole page.
 * @param {import('./rank.mjs').IdeaKind} kind
 * @param {boolean} inPage whether the start is the page the idea names
 * @returns {string | null}
 */
function placement(kind, inPage) {
  if (kind === 'edit')
    return 'the idea changes a page you already have, so keep it and add blocks to it; a new page starts from the app shell.';
  if (kind === 'part')
    return inPage
      ? 'the idea is a part of a page, so it starts from the page it names.'
      : 'the idea is a part of a page and names no page, so it starts from the app shell.';
  return null;
}

/**
 * The template to start from: the ready page the ranker puts first when it
 * has the evidence to lead, else the first fallback shell the project can
 * scaffold. Null only when the project has no page template to offer at all.
 *
 * `direct` means two independent signals agree: the ranker's pick is also
 * search's direct match. The ranker sees only ready templates, so a template
 * still marked not ready is never the start; when search matched one directly
 * the reason names it, so the reader knows why the kit starts elsewhere.
 *
 * @param {import('./rank.mjs').RankedPage[]} ranked
 * @param {import('./rank.mjs').IdeaKind} kind
 * @param {SearchResultEntry[]} pages
 * @param {boolean} directMatch
 * @param {PageTemplate[]} catalog
 * @param {string} idea
 * @returns {Omit<BuildStart, 'alternatives'> | null}
 */
export function chooseStart(ranked, kind, pages, directMatch, catalog, idea) {
  const direct = directMatch ? pages[0].name : null;
  const unready =
    direct && !catalog.some(t => t.name === direct) ? direct : null;
  // The reason never denies a match the same response reports: a direct
  // match the ranker outweighed is named, and so are the loose page matches
  // search listed when the kit falls back to the shell.
  const loose = pages.map(p => `\`${p.name}\``).join(', ');
  /**
   * A part's or an edit's reason, naming a direct match that is not the start.
   * @param {string} place
   * @param {string} startName
   */
  const placed = (place, startName) =>
    direct && direct !== startName
      ? `Search matched \`${direct}\` by name, but ${place}`
      : place[0].toUpperCase() + place.slice(1);
  const proposed = pickStart(ranked, kind);
  // The checked-in word weights (weights.mjs), blended with the ranker's
  // scores, decide the start of a whole page. A part or an edit starts where
  // the ranker's placement rules put it (spec:AST-048/FR3).
  const weighed =
    kind === 'page'
      ? weighStart(idea, ranked, proposed, catalog, {
          weights: loadWeights(),
          newPage: asksForNewPage(idea, catalog),
        })
      : undefined;
  // A shell start keeps the shell the ranker named, if any, and never replaces
  // the template the ranker chose for a page search matched directly.
  const pick =
    weighed === undefined
      ? proposed
      : weighed === null
        ? proposed?.family === 'Shell' || (proposed && direct && !unready)
          ? proposed
          : null
        : (ranked.find(r => r.name === weighed) ?? proposed);
  const closest = pick && catalog.find(t => t.name === pick.name);
  if (pick && closest) {
    const agrees = closest.name === direct;
    const place = placement(kind, pick.base && pick.familyNamed);
    return {
      ...asTemplate(closest),
      basis: agrees ? 'direct' : 'closest',
      reason: unready
        ? `\`${unready}\` matches but is not ready yet; this is the closest ready template.`
        : place
          ? placed(place, closest.name)
          : agrees
            ? 'Matches the idea.'
            : direct
              ? `Search matched \`${direct}\` by name, but this template fits more of the idea.`
              : 'The closest template; none is exactly this page.',
    };
  }
  for (const id of FALLBACK_STARTS) {
    const shell = catalog.find(t => t.name === id);
    if (shell) {
      // The shell can also be the ranker's best guess without the evidence to
      // lead ("horizontal site navigation"); say so rather than "no match".
      const nearest =
        (ranked[0]?.name === shell.name && ranked[0].hits > 0) ||
        (weighed === null && !!proposed && proposed.family !== 'Shell');
      const place = placement(kind, false);
      return {
        ...asTemplate(shell),
        basis: 'fallback',
        reason: unready
          ? `\`${unready}\` matches but is not ready yet, so start from the app shell.`
          : place
            ? placed(place, shell.name)
            : direct
              ? weighed === null
                ? `Search matched \`${direct}\` by name, but the app shell is the closer start.`
                : `Search matched \`${direct}\` by name, but too little of the idea fits it, so start from the app shell.`
              : nearest
                ? 'No template is a clear match; the app shell is the closest.'
                : loose
                  ? `Search matched ${loose} only loosely, so start from the app shell.`
                  : 'No template matched, so start from the app shell.',
      };
    }
  }
  return null;
}
