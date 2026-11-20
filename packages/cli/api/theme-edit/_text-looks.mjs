// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How a question says a text's looks: its weight, a run of looks
 * said together for a part's text or the top bar's links, and links said
 * with the top bar.
 * @input the question's clauses, a draft's steps, and the hue words
 * @output weights, the top bar's links read as its nav items, and the
 * text color and link size a run of looks asks for
 * @position api/theme-edit — read by _how-question.mjs; reads only the
 * weight table
 */

import {HEADING_WEIGHTS} from './_tables.mjs';

/**
 * A font weight written in a clause: a number from 100 to 900, or a weight
 * word ("semibold").
 * @param {{text: string}} c
 */
export function weightIn(c) {
  const n = /\b([1-9]00)\b(?!\s*(px|ms|%))/.exec(c.text)?.[1];
  if (n) return n;
  // "weight 450": any weight from 1 to 1000 written beside the word.
  const typed =
    /\bweight\s*:?\s*(\d{1,4})\b(?!\s*(?:px|ms|%|rem|em))/.exec(c.text)?.[1] ??
    /\b(\d{1,4})\s+(?:font\s+)?weight\b/.exec(c.text)?.[1];
  if (typed && Number(typed) >= 1 && Number(typed) <= 1000) return typed;
  const w = /\b(semi-?bold|medium|regular|normal)\b/.exec(c.text)?.[1];
  return w
    ? HEADING_WEIGHTS[
        /** @type {keyof typeof HEADING_WEIGHTS} */ (
          w === 'normal' ? 'regular' : w.replace('-', '')
        )
      ]
    : null;
}

/** @type {Map<string, RegExp>} */
const lookRuns = new Map();

/**
 * Looks said together right before the text or links they style, at
 * least one a weight or a size, with the noun phrase ending there: "white
 * bold 11px links", "bold 13px #3b5998 text" (which the question reader
 * writes "bold 13px text #3b5998"), "#3b5998 bold 13px text". A noun after
 * it ("a 2px black text stroke") makes no run. Group 1 is the noun.
 * @param {string[]} hues the hue words a question can say
 */
function lookRun(hues) {
  const kept = lookRuns.get(hues.join('|'));
  if (kept) return kept;
  const color = `#[0-9a-f]{3,8}|white|black|gr[ae]y|${hues.join('|')}`;
  const ws = String.raw`bold|semi-?bold|\d+(?:\.\d+)?(?:px|rem|pt)`;
  const look = `(?:${color}|${ws}|uppercase|italic)`;
  const end = String.raw`(?=\s*(?:$|[,;.:)]|(?:and|but|then|in|on|of|for|with|to|at|inside|across|that|which|when|while)\b))`;
  const run = new RegExp(
    String.raw`(?:^|\s)(?:${look}\s+)*(?:${ws})\s+(?:${look}\s+)*(text|links?)(?:\s+#[0-9a-f]{3,8})?\b${end}`,
  );
  lookRuns.set(hues.join('|'), run);
  return run;
}

/** Parts whose text is the page's, never their own. */
const PAGE_PARTS = new Set(['page', 'app-shell', 'layout-content', 'body']);

/**
 * The run of looks a clause says for its own part's text, or for the top
 * bar's links: never for the page, every link, or links said with another
 * part, which read as before.
 * @param {{text: string, parts: Array<{on: string}>, container?: string, within?: unknown}} c
 * @param {string[]} hues
 */
function ownRun(c, hues) {
  const m = lookRun(hues).exec(String(c.text ?? ''));
  // (A run said for one part's text but placed in another, "tabs with bold
  // 13px #3b5998 text on cards", reads as before.)
  if (!m || c.container || c.within || new Set(c.parts.map(p => p.on)).size > 1)
    return null;
  const owns = /^links?$/.test(m[1])
    ? c.parts.length > 0 && c.parts.every(p => p.on === 'top-nav-item')
    : c.parts.length > 0 &&
      c.parts.every(p => p.on !== 'link' && !PAGE_PARTS.has(p.on));
  return owns ? m[0] : null;
}

/**
 * A draft for a run of looks read whole ("bold 13px #3b5998 text") writes
 * one of its looks, and the run's color is its color ask's, so a typed
 * color of that run is no word the draft failed to read; any other typed
 * color still is.
 * @param {{text: string, parts: Array<{on: string}>}} c the clause
 * @param {Array<{thing: string}>} steps this draft's steps
 * @param {string[]} hues the hue words a question can say
 * @param {string[]} literals the typed colors the draft would report
 */
export function colorInOtherDraft(c, steps, hues, literals) {
  const run = (ownRun(c, hues) ?? '').toLowerCase();
  return (
    RUN_READ.has(c) &&
    /#[0-9a-f]{3,8}\b/.test(run) &&
    literals.every(l => run.includes(l.toLowerCase())) &&
    steps.length > 0
  );
}

/** The asks of a clause whose run of looks is read whole. */
const RUN_READ = new WeakSet();

/** The looks of a part's text said together, each an ask of its own. */
export const TEXT_LOOKS = ['case', 'weight', 'italic', 'tracking', 'fontsize'];

/** The asks a run of looks can make: those looks and its color. */
const RUN_ASKS = new Set(['text', ...TEXT_LOOKS]);

/**
 * A run of looks said for a part's text or the top bar's links asks for
 * each of its looks: its color ("tabs: bold 13px #3b5998 text") and a size
 * said for links ("white bold 11px links"), each an ask of its own beside
 * the weight and size the clause reader already gives, when every ask the
 * clause makes is a look of that text.
 * @param {Array<{text: string, aspects: string[], parts: Array<{on: string}>, container?: string, placeStrict?: unknown, state?: string | null}>} clauses
 * @param {string[]} hues the hue words a question can say
 */
export function addRunLooks(clauses, hues) {
  const color = new RegExp(
    `#[0-9a-f]{3,8}|\\b(?:white|black|gr[ae]y|${hues.join('|')})\\b`,
  );
  // (A clause the reader gives another clause's words says no run of its
  // own.)
  /** @type {Map<string, number>} */
  const first = new Map();
  clauses.forEach((x, k) => first.has(x.text) || first.set(x.text, k));
  for (let i = clauses.length - 1; i >= 0; i--) {
    const c = clauses[i];
    // (Asks split from one clause share its words: read them once.)
    if (
      clauses[i - 1]?.text === c.text ||
      (first.get(c.text) ?? i) < i ||
      // (A run said for a state, "selected tabs with …", reads as before:
      // the reader can give it another clause's words.)
      c.state
    )
      continue;
    let end = i;
    while (clauses[end + 1]?.text === c.text) end++;
    const group = clauses.slice(i, end + 1);
    const asks = group.flatMap(x => x.aspects);
    const run = ownRun(c, hues);
    // ("top bar #3b5998 with 11px white links": the links' color stays the
    // bar's link color, and their size is the nav items'.)
    const said = lookRun(hues).exec(String(c.text ?? ''))?.[0] ?? '';
    if (
      !run &&
      /\blinks?\b/.test(said) &&
      /\d(?:px|rem|pt)\b/.test(said) &&
      BAR_KEPT.has(c) &&
      !asks.includes('fontsize') &&
      asks.every(a => RUN_ASKS.has(a))
    ) {
      const size = {...c, parts: [{on: 'top-nav-item'}], aspects: ['fontsize']};
      delete size.container;
      delete size.placeStrict;
      for (const x of [...group, size]) RUN_READ.add(x);
      clauses.splice(end + 1, 0, size);
      continue;
    }
    // (Only when every ask of the clause is a look of the run's own part's
    // text: otherwise the clause reads as before.)
    if (
      !run ||
      !group.every(x => ownRun(x, hues)) ||
      !asks.every(a => RUN_ASKS.has(a))
    )
      continue;
    /** @type {string[]} */
    const add = [];
    if (color.test(run) && !asks.includes('text')) add.push('text');
    if (/\blinks?\b/.test(run) && /\d(?:px|rem|pt)\b/.test(run)) {
      if (!asks.includes('fontsize')) add.push('fontsize');
    }
    // (The color of the bar's links is the bar's link color, placed as the
    // question reader places it.)
    const inBar = IN_BAR.get(c);
    const copies = add.map(a =>
      a === 'text' && inBar
        ? {...c, ...inBar, parts: [{on: 'link'}], aspects: [a]}
        : {...c, parts: c.parts.map(p => ({...p})), aspects: [a]},
    );
    for (const x of [...group, ...copies]) RUN_READ.add(x);
    clauses.splice(end + 1, 0, ...copies);
  }
}

/**
 * Where the question reader placed the bar's links, kept for the color
 * ask a run of their looks adds.
 * @type {WeakMap<object, {container: string, placeStrict: unknown}>}
 */
const IN_BAR = new WeakMap();

/** The bar's links whose color the question reader keeps to the bar. */
const BAR_KEPT = new WeakSet();

/** The parts that are the top bar. */
export const BAR_PARTS = new Set(['app-shell-header', 'top-nav']);

/**
 * Links said with the top bar are its nav items, never every link in the
 * app: in the clause after the bar's, joined by "with" ("top bar #3b5998
 * with white links"), or in a clause that holds the bar only as the place
 * of its links and asks only for the links' text ("top bar with white bold
 * links"), more links said after them with "and" for a mode or a state,
 * and a look said for them again ("and underline them on hover"). A
 * clause that also asks for a look of the bar, never says links, or places
 * its links elsewhere ("links on cards") keeps its reading.
 * @param {Array<{joint?: string, text: string, aspects: string[], parts: Array<{on: string}>, container?: string, within?: unknown, placeStrict?: unknown}>} clauses
 * @param {(text: string) => boolean} namesBar whether words name the bar,
 * by the part words
 * @param {(clause: object) => void} release drops the notes that a
 * clause's links could not be kept to the bar
 */
export function barLinksAreNavItems(clauses, namesBar, release) {
  const bar = (/** @type {{on: string}} */ p) => BAR_PARTS.has(p.on);
  const link = (/** @type {{on: string}} */ p) => p.on === 'link';
  /** @type {string | null} the bar whose links were last its nav items */
  let held = null;
  // (Whether the clause before is the bar's links.)
  let lastBar = false;
  for (let k = 0; k < clauses.length;) {
    // (Asks split from one clause share its words and its joint: they are
    // read as one, and the bar is in the clause before them all.)
    const c = clauses[k];
    let end = k;
    while (clauses[end + 1]?.text === c.text) end++;
    const group = clauses.slice(k, end + 1);
    const before = clauses[k - 1];
    k = end + 1;
    // (Links the ask places elsewhere, "the links on cards", stay there;
    // links said with the bar are its nav items, and "the links in the
    // header" read as before.)
    const placed = group.find(x => x.container || x.within);
    const barPlaced = Boolean(
      placed && BAR_PARTS.has(String(placed.container)),
    );
    if (placed && !barPlaced) {
      lastBar = false;
      continue;
    }
    const inBar = barPlaced && /^[\s;]*with\s*$/.test(c.joint ?? '');
    const unplace = (/** @type {(typeof clauses)[number]} */ x) => {
      if (x.container && BAR_PARTS.has(x.container)) {
        delete x.container;
        delete x.placeStrict;
        release(x);
      }
    };
    const says = /\blinks?\b/.test(c.text);
    const and = /^[\s,]*and\s*$/.test(c.joint ?? '');
    const navBefore = lastBar;
    const barOf = (/** @type {typeof clauses} */ xs) =>
      xs.flatMap(x => x.parts).find(bar)?.on ?? null;
    const joined =
      (says && inBar) ||
      (/^[\s;]*with\s*$/.test(c.joint ?? '') &&
        Boolean(before && barOf([before])));
    // ("… with white links in light mode and gray links in dark mode": more
    // links said in the bar's list for a mode or a state of their own are
    // its nav items too.)
    const more =
      says &&
      and &&
      navBefore &&
      /\b(?:(?:light|dark) mode|hover(?:ed|ing)?|selected|active|focus(?:ed)?|pressed|visited)\b/.test(
        c.text,
      ) &&
      group.every(x => x.parts.length && x.parts.every(p => link(p) || bar(p)));
    const holder =
      says &&
      Boolean(barOf(group)) &&
      group.some(x => x.parts.some(link)) &&
      !namesBar(c.text) &&
      group.every(x => x.aspects.every(a => RUN_ASKS.has(a)));
    // ("… with white links, and underline them on hover": a look said for
    // those links again, by "them", is the nav items' too.)
    const again =
      !says &&
      and &&
      navBefore &&
      /\b(?:them|they|their)\b/.test(c.text) &&
      group.every(x => x.parts.length && x.parts.every(p => link(p) || bar(p)));
    if (joined || holder || more || again) {
      if (!again)
        held =
          (inBar ? String(placed?.container) : null) ??
          (joined && before ? barOf([before]) : barOf(group)) ??
          held;
      for (const x of group) {
        // (The links' color said in the bar is the bar's link color, as
        // the question reader places it.)
        if (x.aspects.includes('text') && BAR_PARTS.has(String(x.container))) {
          BAR_KEPT.add(x);
          continue;
        }
        if (x.container && BAR_PARTS.has(x.container))
          IN_BAR.set(x, {container: x.container, placeStrict: x.placeStrict});
        unplace(x);
        if (holder || more || again) x.parts = x.parts.filter(p => !bar(p));
        for (const p of x.parts) if (link(p)) p.on = 'top-nav-item';
      }
      lastBar = true;
      continue;
    }
    lastBar = false;
    if (
      // ("top bar with white links and white text": a look said after the
      // links for text, or one the bar draws, is the bar's own.)
      !says &&
      and &&
      navBefore &&
      held &&
      // (Only a look said for text, or one the bar draws itself; "underline
      // them on hover" is still the links'.)
      !/\b(?:them|their|they|it|its)\b/.test(c.text) &&
      (/\btext\b/.test(c.text) ||
        group.every(x =>
          x.aspects.every(a =>
            ['background', 'border', 'shadow', 'corners'].includes(a),
          ),
        )) &&
      group.every(x => x.parts.length && x.parts.every(p => link(p) || bar(p)))
    )
      for (const x of group) {
        unplace(x);
        x.parts = [{on: held}];
      }
  }
}
