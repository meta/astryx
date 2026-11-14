// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The page template a kit starts from: for a whole page, the page the
 * word weights and the page-pick model choose from the ranker's list; for a
 * part or an edit, where the ranker's placement rules put it; else the app
 * shell.
 */

import {loadWeights} from '../_adapter.mjs';
import {asksForNewPage} from './kind.mjs';
import {pickAlternatives, pickStart} from './rank.mjs';
import {hasEditPhrase, shellCallScore} from './shellcall.mjs';
import {blendOrder, blendSummary, weighStart} from './weights.mjs';

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
 * Fixed coefficients of a logistic decision over build's own numbers: bias,
 * whole page, edit, blend margin over the shell, the shell's blend score, the
 * gap to the blend's second template, the idea's comma count, the text score
 * (shellcall.mjs) and its edit-word flag. Fixed constants; nothing is trained
 * at run time. An edit phrase keeps the shell before the decision runs, so the
 * two edit inputs are 0 whenever it runs; they stay because the constants were
 * fit with them.
 */
const LIFT = [
  -0.7707, 0.6706, -0.2642, 0.2815, -0.1621, 0.1759, 0.1713, 0.2891, -0.3491,
];

/** The decision replaces the shell with a page when p >= 0.30. */
const LIFT_AT = 0.3;

/**
 * The page template that replaces an app-shell start, or null to keep the
 * shell. The blend's best template takes the start when the decision's
 * whole-page probability is at least 0.30.
 * @param {import('./rank.mjs').RankedPage[]} ranked
 * @param {import('./rank.mjs').IdeaKind} kind
 * @param {PageTemplate[]} catalog
 * @param {string} idea
 * @returns {PageTemplate | null}
 */
function liftFromShell(ranked, kind, catalog, idea) {
  const b = blendSummary(
    idea,
    ranked,
    pickStart(ranked, 'page'),
    catalog,
    loadWeights(),
  );
  if (!b || !b.best) return null;
  // A change to a page or app the builder already has keeps its shell.
  if (hasEditPhrase(idea)) return null;
  const text = shellCallScore(idea, kind, ranked);
  const x = [
    1,
    kind === 'page' ? 1 : 0,
    kind === 'edit' ? 1 : 0,
    b.bestScore - b.shell,
    b.shell,
    b.bestScore - b.secondScore,
    (String(idea).match(/,/g) ?? []).length,
    text?.score ?? 0,
    text?.edit ? 1 : 0,
  ];
  const logit = x.reduce((s, v, i) => s + v * LIFT[i], 0);
  if (1 / (1 + Math.exp(-logit)) < LIFT_AT) return null;
  return catalog.find(t => t.name === b.best) ?? null;
}

/**
 * The template to start from: for a whole page, the ready page the word
 * weights and the page-pick model choose (weighStart); for a part or an edit,
 * the ranker's placement; else the first fallback shell the project can
 * scaffold. Null only when the project has no page template to offer at all.
 *
 * `direct` means two independent signals agree: the start is also search's
 * direct match. The ranker sees only ready templates, so a template
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
  // scores, decide the start of a whole page, so it can differ from the
  // ranker's own pick, its head-noun family included. A part or an edit starts
  // where the ranker's placement rules put it (spec:AST-048/FR3).
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
  // An idea that would start on the app shell starts from the blend's best page
  // when the decision's whole-page probability is at least 0.30. A direct match,
  // ready or not, keeps the start and reason it already has.
  const lifted =
    !direct && (!pick || pick.family === 'Shell')
      ? liftFromShell(ranked, kind, catalog, idea)
      : null;
  const closest = lifted ?? (pick && catalog.find(t => t.name === pick.name));
  if (closest) {
    const agrees = closest.name === direct;
    const place =
      lifted || !pick ? null : placement(kind, pick.base && pick.familyNamed);
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

/**
 * The next best page templates beside the start (spec:AST-048/FR7), in the
 * order the start itself is chosen from. The candidates are the ranker's (a
 * template with matched words and half a start's score); a whole page orders
 * them by the word weights' blend, the same ranking that picks its start, so
 * the templates build names are the blend's best. The blend knows only the
 * templates its tables list: one it does not list (a shell, an integration's
 * template, or one added since the tables were fit) keeps the place the ranker
 * gives it, so a new template is never pushed out by tables that have not seen
 * it. A part or an edit, or a project without weights, keeps the ranker's
 * order.
 * @param {import('./rank.mjs').RankedPage[]} ranked
 * @param {import('./rank.mjs').IdeaKind} kind
 * @param {string} startName
 * @param {PageTemplate[]} catalog
 * @param {string} idea
 * @returns {import('./rank.mjs').RankedPage[]}
 */
export function pickStartAlternatives(ranked, kind, startName, catalog, idea) {
  const eligible = pickAlternatives(ranked, startName, ranked.length);
  const byRanker = eligible.slice(0, 2);
  if (kind !== 'page') return byRanker;
  const weights = loadWeights();
  const order = blendOrder(
    idea,
    ranked,
    pickStart(ranked, kind),
    catalog,
    weights,
  );
  if (!weights || !order) return byRanker;
  const listed = new Set(weights.candidates);
  const at = new Map(order.map((name, i) => [name, i]));
  // Unlisted templates keep their ranker slot; the rest follow the blend.
  /** @type {(import('./rank.mjs').RankedPage | null)[]} */
  const slots = byRanker.map(r => (listed.has(r.name) ? null : r));
  const rest = eligible
    .filter(r => listed.has(r.name) && at.has(r.name))
    .sort(
      (a, b) =>
        /** @type {number} */ (at.get(a.name)) -
        /** @type {number} */ (at.get(b.name)),
    );
  const out = slots.map(slot => slot ?? rest.shift() ?? null);
  return /** @type {import('./rank.mjs').RankedPage[]} */ (out.filter(Boolean));
}
