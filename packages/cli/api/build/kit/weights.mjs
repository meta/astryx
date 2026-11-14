// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Word weights for `build`'s START (spec:AST-048): checked-in tables of
 * per-template word weights, blended with the page ranker's own scores, pick
 * the template an idea starts from. The call model (the file's top-level
 * tables and blend) decides page or app shell; an optional pick model
 * (`pick`) chooses which page once the call model calls a page.
 *
 * @input An idea, the ranker's output for it (`rankPages`, `pickStart`), the
 *   project's ready page templates, and the weights (`weights.json` beside this
 *   file, read by the adapter): the candidates (the app shell as `SHELL`, then page template ids), one or more
 *   word tables (stemmed words, a bias per candidate, and one row of weights
 *   per word, a character per candidate) and the blend numbers.
 * @output `weighStart(idea, ranked, pick, catalog)`: the template id to start
 *   from, null for the app shell, or undefined when no table is available, in
 *   which case the ranker's own pick stands.
 * @position Beside rank.mjs (api/build/kit/); kit.mjs calls it for every
 *   whole page (a part or an edit follows the ranker's placement rules). A
 *   template the tables do not list competes on its own descriptor's words
 *   (`ownWords`), so a new template can start a build.
 */

import {STOPWORDS} from '../../search/search.mjs';
import {keywordUnits, keywordWordsFor} from './words.mjs';
import {isWordModel} from './word-model.mjs';
import {compareText} from '../../../foundation/text/compare-text.mjs';

/** The app shell, as one candidate. */
export const SHELL = 'SHELL';
const SHELL_FAMILY = 'Shell';

// The Porter (1980) stemmer.
/** @type {Record<string, string>} */
const STEP2 = {
  ational: 'ate',
  tional: 'tion',
  enci: 'ence',
  anci: 'ance',
  izer: 'ize',
  bli: 'ble',
  alli: 'al',
  entli: 'ent',
  eli: 'e',
  ousli: 'ous',
  ization: 'ize',
  ation: 'ate',
  ator: 'ate',
  alism: 'al',
  iveness: 'ive',
  fulness: 'ful',
  ousness: 'ous',
  aliti: 'al',
  iviti: 'ive',
  biliti: 'ble',
  logi: 'log',
};
/** @type {Record<string, string>} */
const STEP3 = {
  icate: 'ic',
  ative: '',
  alize: 'al',
  iciti: 'ic',
  ical: 'ic',
  ful: '',
  ness: '',
};
const CONS = '[^aeiou][^aeiouy]*';
const VOW = '[aeiouy][aeiou]*';
const MGR0 = new RegExp(`^(${CONS})?${VOW}${CONS}`);
const MEQ1 = new RegExp(`^(${CONS})?${VOW}${CONS}(${VOW})?$`);
const MGR1 = new RegExp(`^(${CONS})?${VOW}${CONS}${VOW}${CONS}`);
const HAS_VOWEL = new RegExp(`^(${CONS})?[aeiouy]`);
const CVC = new RegExp(`^${CONS}[aeiouy][^aeiouwxy]$`);
const stems = new Map();

/**
 * The Porter stem of a lowercase word.
 * @param {string} word
 * @returns {string}
 */
export function stem(word) {
  const cached = stems.get(word);
  if (cached !== undefined) return cached;
  let w = word;
  if (w.length < 3 || /\d/.test(w)) {
    stems.set(word, w);
    return w;
  }
  const leadingY = w[0] === 'y';
  if (leadingY) w = 'Y' + w.slice(1);
  let m;
  if ((m = /^(.+?)(ss|i)es$/.exec(w))) w = m[1] + m[2];
  else if ((m = /^(.+?)([^s])s$/.exec(w))) w = m[1] + m[2];
  if ((m = /^(.+?)eed$/.exec(w))) {
    if (MGR0.test(m[1])) w = w.slice(0, -1);
  } else if ((m = /^(.+?)(ed|ing)$/.exec(w)) && HAS_VOWEL.test(m[1])) {
    w = m[1];
    if (/(at|bl|iz)$/.test(w)) w += 'e';
    else if (/([^aeiouylsz])\1$/.test(w)) w = w.slice(0, -1);
    else if (CVC.test(w)) w += 'e';
  }
  if ((m = /^(.+?)y$/.exec(w)) && HAS_VOWEL.test(m[1])) w = m[1] + 'i';
  if (
    (m =
      /^(.+?)(ational|tional|enci|anci|izer|bli|alli|entli|eli|ousli|ization|ation|ator|alism|iveness|fulness|ousness|aliti|iviti|biliti|logi)$/.exec(
        w,
      )) &&
    MGR0.test(m[1])
  ) {
    w = m[1] + STEP2[m[2]];
  }
  if (
    (m = /^(.+?)(icate|ative|alize|iciti|ical|ful|ness)$/.exec(w)) &&
    MGR0.test(m[1])
  ) {
    w = m[1] + STEP3[m[2]];
  }
  if (
    (m =
      /^(.+?)(al|ance|ence|er|ic|able|ible|ant|ement|ment|ent|ou|ism|ate|iti|ous|ive|ize)$/.exec(
        w,
      ))
  ) {
    if (MGR1.test(m[1])) w = m[1];
  } else if ((m = /^(.+?)(s|t)(ion)$/.exec(w)) && MGR1.test(m[1] + m[2])) {
    w = m[1] + m[2];
  }
  if (
    (m = /^(.+?)e$/.exec(w)) &&
    (MGR1.test(m[1]) || (MEQ1.test(m[1]) && !CVC.test(m[1])))
  ) {
    w = m[1];
  }
  if (/ll$/.test(w) && MGR1.test(w)) w = w.slice(0, -1);
  if (leadingY) w = 'y' + w.slice(1);
  stems.set(word, w);
  return w;
}

/**
 * Lowercase words of an idea that can carry weight: letters only, two or more.
 * @param {string} idea
 * @returns {string[]}
 */
export function weightWords(idea) {
  return String(idea ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 2 && !/\d/.test(w));
}

/**
 * @typedef {object} WeightTable
 * @property {string[]} words stemmed words
 * @property {number[]} bias one per candidate
 * @property {number} clip
 * @property {number} step
 * @property {string[]} rows one per word: a character per candidate,
 *   weight = (charCode - 97) * step - clip
 *
 * @typedef {object} WeightsFile
 * @property {number} version
 * @property {string[]} candidates `SHELL`, then page template ids
 * @property {WeightTable[]} tables
 * @property {number[]} blend three numbers per member (the tables, in order,
 *   with the ranker second), then one for `SHELL`
 * @property {{tables: WeightTable[], blend: number[]}} [pick] the pick
 *   model: its own tables and blend numbers, used only to choose which page
 *   starts once the call model (the top-level tables and blend) has called a
 *   page. Without it, one model does both.
 */

/**
 * Whether the weights file carries a well-formed pick model. A malformed
 * `pick` block is ignored, so one model then does both decisions.
 * @param {WeightsFile} weights
 * @returns {boolean}
 */
const hasPickModel = weights =>
  isWordModel(weights.pick, weights.candidates.length);

/**
 * The pick model of a weights file: its `pick` tables and blend when present,
 * else the file's own.
 * @param {WeightsFile} weights
 * @returns {WeightsFile}
 */
const pickModel = weights => {
  const pick = weights.pick;
  return pick && hasPickModel(weights)
    ? {...weights, tables: pick.tables, blend: pick.blend}
    : weights;
};

/**
 * A table's score for every candidate.
 * @param {WeightTable} table
 * @param {Map<string, number>} index word -> row
 * @param {Set<string>} words the idea's stemmed words
 * @param {number} n candidates
 */
function tableScores(table, index, words, n) {
  const out = Float64Array.from(table.bias.slice(0, n));
  for (const w of words) {
    const i = index.get(w);
    if (i === undefined) continue;
    const row = table.rows[i];
    for (let c = 0; c < n; c++) {
      out[c] += (row.charCodeAt(c) - 97) * table.step - table.clip;
    }
  }
  return out;
}

/** @param {number} x */
const round4 = x => Math.round(x * 1e4) / 1e4;

/**
 * The ranker's scores as a blend member: every non-shell template's rank
 * score, the ranker's own start lifted above the rest, and the app shell above
 * them all when the ranker would start from it.
 * @param {import('./rank.mjs').RankedPage[]} ranked
 * @param {import('./rank.mjs').RankedPage | null} pick
 */
function rankerScores(ranked, pick) {
  /** @type {Map<string, number>} */
  const out = new Map();
  for (const r of ranked)
    if (r.family !== SHELL_FAMILY) out.set(r.name, r.score);
  const top = Math.max(0, ...out.values());
  const pageStart = pick && pick.family !== SHELL_FAMILY ? pick.name : null;
  out.set(SHELL, pageStart ? -1 : top + 1);
  if (pageStart) out.set(pageStart, top + 2);
  return out;
}

/**
 * Per-candidate features of one member's scores: z-score, 1/(rank+1), is-top.
 * @param {(number | undefined)[]} v a score per candidate (undefined: none)
 */
function memberFeatures(v) {
  const finite = /** @type {number[]} */ (v.filter(x => x !== undefined));
  const mean = finite.reduce((a, b) => a + b, 0) / Math.max(1, finite.length);
  const sd =
    Math.sqrt(
      finite.reduce((a, b) => a + (b - mean) ** 2, 0) /
        Math.max(1, finite.length),
    ) || 1;
  const val = v.map(x => (x === undefined ? -1e9 : x));
  // Equal values share the average of the ranks they span. That is the mean
  // rank an arbitrary order gives them, which is what the blend numbers were
  // fit on, and the candidates' order in the weights file never decides. Two
  // or more candidates tied at a member's top share a rank above 0, so none
  // of them gets the is-top feature.
  const rank = val.map(
    x =>
      val.filter(y => y > x).length + (val.filter(y => y === x).length - 1) / 2,
  );
  return v.map((x, i) => [
    x === undefined ? -4 : Math.max(-4, Math.min(4, (x - mean) / sd)),
    1 / (rank[i] + 1),
    rank[i] === 0 ? 1 : 0,
  ]);
}

/**
 * @typedef {object} DescribedTemplate
 * @property {string} name
 * @property {string} [displayName]
 * @property {string} [category]
 * @property {string[]} [keywords]
 * @property {string} [description]
 * @property {string[]} [components]
 */

/**
 * The words of a descriptor text as this file reads an idea: stemmed, less
 * search's stopwords. Search's stopwords are no evidence: "to" in a "to-do
 * list" keyword must not answer the "to" of "rows to track orders".
 * @param {string} text
 * @returns {string[]}
 */
const contentWords = text =>
  weightWords(text)
    .filter(w => !STOPWORDS.has(w))
    .map(stem);

/**
 * The words a template's descriptor gives an idea: every word of `texts`, and
 * the words its keywords give the idea (`keywordWordsFor`): a phrase keyword
 * counts all of its words when the idea names the whole phrase, and none of
 * them otherwise.
 * @param {string[]} texts
 * @param {readonly string[]} keywords
 * @param {string[]} order the idea's words, in order (`contentWords`)
 * @returns {Set<string>}
 */
const descriptorWordsFor = (texts, keywords, order) =>
  new Set([
    ...contentWords(texts.join(' ')),
    ...keywordWordsFor(keywordUnits(keywords, contentWords), order),
  ]);

/**
 * How many of the idea's words a template's own descriptor names: its display
 * name, its category, and its keywords.
 * @param {string} name
 * @param {DescribedTemplate[]} catalog
 * @param {string[]} order the idea's words, in order (`contentWords`)
 */
function ownWords(name, catalog, order) {
  const t = catalog.find(c => c.name === name);
  if (!t) return 0;
  const own = descriptorWordsFor(
    [t.displayName ?? '', t.category ?? ''],
    t.keywords ?? [],
    order,
  );
  let n = 0;
  for (const w of new Set(order)) if (own.has(w)) n++;
  return n;
}

/**
 * A template's family: the part of its category before ` - `.
 * @param {string} name
 * @param {DescribedTemplate[]} catalog
 */
const familyOf = (name, catalog) =>
  String(catalog.find(c => c.name === name)?.category ?? '')
    .split(' - ')[0]
    .trim();

/** How many fewer own words a template whose family the idea names first may
 * name than the listed template it competes with, and still start. */
const FAMILY_SLACK = 2;

/**
 * Where the idea first names a template's family, the part of its category
 * before ` - ` ("Dashboard" in "Dashboard - Analytics"): the index of that
 * word among the idea's stemmed words, or Infinity when it does not.
 * @param {string} name
 * @param {DescribedTemplate[]} catalog
 * @param {string[]} order the idea's stemmed words, in order
 */
function familyAt(name, catalog, order) {
  const t = catalog.find(c => c.name === name);
  const family = weightWords(String(t?.category ?? '').split(' - ')[0]).map(
    stem,
  );
  const at = family.length ? order.findIndex(w => family.includes(w)) : -1;
  return at < 0 ? Infinity : at;
}

/**
 * The blend's score for every candidate: the app shell and every ready,
 * non-shell template, the table's first, then any the table does not list.
 * @param {string} idea
 * @param {import('./rank.mjs').RankedPage[]} ranked
 * @param {import('./rank.mjs').RankedPage | null} pick
 * @param {DescribedTemplate[]} catalog
 * @param {WeightsFile} weights
 * @returns {{cands: string[], scores: number[], position: Map<string, number>}}
 */
function blend(idea, ranked, pick, catalog, weights) {
  const ready = new Set(catalog.map(t => t.name));
  const shellIds = new Set(
    ranked.filter(r => r.family === SHELL_FAMILY).map(r => r.name),
  );
  // Candidates: the app shell and every ready, non-shell template, the
  // table's first, then any the table does not list.
  const listed = weights.candidates.filter(c => c === SHELL || ready.has(c));
  const extra = catalog
    .map(t => t.name)
    .filter(n => !shellIds.has(n) && !weights.candidates.includes(n));
  const cands = [...listed, ...extra];
  const position = new Map(weights.candidates.map((c, i) => [c, i]));
  const words = new Set(weightWords(idea).map(stem));
  /** @type {(number | undefined)[][]} */
  const members = weights.tables.map(table => {
    const index = new Map(table.words.map((w, i) => [w, i]));
    const s = tableScores(table, index, words, weights.candidates.length);
    return cands.map(c => {
      const i = position.get(c);
      return i === undefined ? undefined : round4(s[i]);
    });
  });
  const fromRanker = rankerScores(ranked, pick);
  const rankerMember = cands.map(c => {
    const x = fromRanker.get(c);
    return x === undefined ? undefined : round4(x);
  });
  // The ranker is the blend's second member, after the first table.
  members.splice(1, 0, rankerMember);
  const feats = members.map(memberFeatures);
  const scores = cands.map((c, i) => {
    let s = 0;
    let j = 0;
    for (const f of feats) for (const x of f[i]) s += x * weights.blend[j++];
    return s + (c === SHELL ? 1 : 0) * weights.blend[j];
  });
  return {cands, scores, position};
}

/**
 * The most typical of the ready templates the ranker ties with `name` in its
 * family (same score, and both the family's base or both variants): the one
 * whose descriptor's words are shared by the most of its family's templates,
 * on average. `name` keeps its
 * place on an equal value. Reads only the templates' descriptors.
 * @param {string} name
 * @param {import('./rank.mjs').RankedPage[]} ranked
 * @param {string[]} cands
 * @returns {string}
 */
function typicalOfTie(name, ranked, cands) {
  const self = ranked.find(r => r.name === name);
  if (!self || self.family === SHELL_FAMILY || !self.family) return name;
  let chosen = self;
  for (const r of ranked) {
    if (
      r.score === self.score &&
      r.family === self.family &&
      r.base === self.base &&
      cands.includes(r.name) &&
      r.typical > chosen.typical
    )
      chosen = r;
  }
  return chosen.name;
}

/**
 * The words a template's whole descriptor gives an idea
 * (`descriptorWordsFor`): its display name, category, keywords, description,
 * and the names of the components its page composes.
 * @param {DescribedTemplate} t
 * @param {string[]} order the idea's words, in order (`contentWords`)
 * @returns {Set<string>}
 */
function descriptorWords(t, order) {
  const components = (t.components ?? []).map(c =>
    c.replace(/([a-z0-9])([A-Z])/g, '$1 $2'),
  );
  return descriptorWordsFor(
    [t.displayName ?? '', t.category ?? '', t.description ?? '', ...components],
    t.keywords ?? [],
    order,
  );
}

/**
 * Which of a set of tied templates the idea names by its whole name: its
 * display name or its id, as consecutive words of the idea ("a form wizard
 * page" names `form-wizard`, "Form Wizard"). A whole name is stronger evidence
 * than any descriptor word, so it settles an exact tie first.
 * @param {string[]} names the tied templates' ids
 * @param {string} idea
 * @param {DescribedTemplate[]} catalog
 * @returns {boolean[]} one flag per name, in order
 */
export function namedOutright(names, idea, catalog) {
  const said = weightWords(idea).map(stem);
  const holds = (/** @type {string[]} */ phrase) =>
    phrase.length > 0 &&
    said.some((_, i) => phrase.every((w, k) => said[i + k] === w));
  return names.map(name => {
    const t = catalog.find(c => c.name === name);
    return [t?.displayName ?? '', name.replace(/-/g, ' ')].some(text =>
      holds(weightWords(text).map(stem)),
    );
  });
}

/**
 * How strongly each of a set of tied templates' own descriptors answers the
 * idea. Words every tied template names cannot choose between them, so they
 * are left out; each other word of the idea that a template's descriptor
 * names adds its rarity among the templates of the tied templates' families.
 * Reads only the templates' descriptors.
 * @param {string[]} names the tied templates' ids
 * @param {string} idea
 * @param {DescribedTemplate[]} catalog
 * @returns {number[]} one reading per name, in order
 */
export function tieReading(names, idea, catalog) {
  const families = new Set(names.map(name => familyOf(name, catalog)));
  const pool = catalog.filter(t => families.has(familyOf(t.name, catalog)));
  const order = contentWords(idea);
  const words = new Map(pool.map(t => [t.name, descriptorWords(t, order)]));
  const df = (/** @type {string} */ w) =>
    pool.filter(t => words.get(t.name)?.has(w)).length;
  const said = new Set(order);
  const own = names.map(name => words.get(name) ?? new Set());
  const n = pool.length;
  return names.map((_, i) => {
    let s = 0;
    for (const w of said) {
      if (!own[i].has(w) || own.every(o => o.has(w))) continue;
      const d = df(w);
      s += Math.log(1 + (n - d + 0.5) / (d + 0.5));
    }
    return s;
  });
}

/**
 * Settles an exact tie in the ranker: a tied template the idea names by its
 * whole name starts (`namedOutright`); otherwise a fuller reading of each tied
 * template's own descriptor decides. Words every tied template names cannot choose
 * between them, so they are left out; each other word of the idea that a
 * template's descriptor names adds its rarity within the family. The highest
 * total starts. An equal total goes to the most typical of the family
 * (`typicalOfTie`), then to `name`. Reads only the templates' descriptors.
 * @param {string} name
 * @param {string} idea
 * @param {import('./rank.mjs').RankedPage[]} ranked
 * @param {string[]} cands
 * @param {DescribedTemplate[]} catalog
 * @returns {string}
 */
function fullerOfTie(name, idea, ranked, cands, catalog) {
  const self = ranked.find(r => r.name === name);
  if (!self || self.family === SHELL_FAMILY || !self.family) return name;
  const tied = ranked.filter(
    r =>
      r.score === self.score &&
      r.family === self.family &&
      r.base === self.base &&
      cands.includes(r.name),
  );
  if (tied.length < 2) return name;
  const named = namedOutright(
    tied.map(r => r.name),
    idea,
    catalog,
  );
  if (named.filter(Boolean).length === 1) return tied[named.indexOf(true)].name;
  const score = tieReading(
    tied.map(r => r.name),
    idea,
    catalog,
  );
  const top = Math.max(...score);
  if (top === 0) return typicalOfTie(name, ranked, cands);
  const leaders = tied.filter((_, i) => score[i] >= top - 1e-9);
  if (leaders.length === 1) return leaders[0].name;
  const lead = leaders.some(r => r.name === name) ? self : leaders[0];
  return typicalOfTie(
    lead.name,
    ranked,
    leaders.map(r => r.name),
  );
}

/**
 * The pick model's best ready, non-shell template that `ok` accepts, or null
 * when it has none.
 * @param {string} idea
 * @param {import('./rank.mjs').RankedPage[]} ranked
 * @param {import('./rank.mjs').RankedPage | null} pick
 * @param {DescribedTemplate[]} catalog
 * @param {WeightsFile} weights
 * @param {(c: string) => boolean} [ok]
 * @returns {string | null}
 */
function bestPage(idea, ranked, pick, catalog, weights, ok = () => true) {
  return pickOrder(idea, ranked, pick, catalog, weights).find(ok) ?? null;
}

/**
 * Every ready, non-shell template in the pick model's order, best first.
 * Templates the pick model scores exactly the same are ordered like an exact
 * tie in the ranker: a template the idea names by its whole name first
 * (`namedOutright`), then by how strongly each one's own descriptor answers
 * the idea (`tieReading`), then by how typical of its family it is, then by
 * name.
 * The weights file's candidate order never decides.
 * @param {string} idea
 * @param {import('./rank.mjs').RankedPage[]} ranked
 * @param {import('./rank.mjs').RankedPage | null} pick
 * @param {DescribedTemplate[]} catalog
 * @param {WeightsFile} weights
 * @returns {string[]}
 */
function pickOrder(idea, ranked, pick, catalog, weights) {
  const {cands, scores} = blend(
    idea,
    ranked,
    pick,
    catalog,
    pickModel(weights),
  );
  const sorted = cands
    .map((c, i) => ({c, s: scores[i]}))
    .filter(x => x.c !== SHELL)
    .sort((x, y) => y.s - x.s);
  const typical = new Map(ranked.map(r => [r.name, r.typical]));
  const out = [];
  for (let i = 0; i < sorted.length;) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].s === sorted[i].s) j++;
    const run = sorted.slice(i, j).map(x => x.c);
    if (run.length > 1) {
      const reading = tieReading(run, idea, catalog);
      const named = namedOutright(run, idea, catalog);
      const at = new Map(run.map((c, k) => [c, reading[k]]));
      const outright = new Map(run.map((c, k) => [c, named[k]]));
      run.sort(
        (a, b) =>
          Number(outright.get(b)) - Number(outright.get(a)) ||
          Number(at.get(b)) - Number(at.get(a)) ||
          (typical.get(b) ?? 0) - (typical.get(a) ?? 0) ||
          compareText(a, b),
      );
    }
    out.push(...run);
    i = j;
  }
  return out;
}

/**
 * Every ready, non-shell template in the blend's own order, best first: the
 * order the page start is chosen from, so the alternatives build names beside
 * the start come from the same ranking. Null without weights.
 * @param {string} idea
 * @param {import('./rank.mjs').RankedPage[]} ranked
 * @param {import('./rank.mjs').RankedPage | null} pick
 * @param {DescribedTemplate[]} catalog
 * @param {WeightsFile | null} weights
 * @returns {string[] | null}
 */
export function blendOrder(idea, ranked, pick, catalog, weights) {
  if (!weights) return null;
  return pickOrder(idea, ranked, pick, catalog, weights);
}

/**
 * Where an idea starts, by the blended weights.
 * @param {string} idea
 * @param {import('./rank.mjs').RankedPage[]} ranked the ranker's output for the idea
 * @param {import('./rank.mjs').RankedPage | null} pick the ranker's own start
 * @param {DescribedTemplate[]} catalog the project's ready page templates
 * @param {{weights?: WeightsFile | null, newPage?: boolean}} [options]
 *   `newPage`: the idea asks for a new page (rank.mjs `asksForNewPage`)
 * @returns {string | null | undefined} a template id, null for the app shell,
 *   undefined without weights
 */
export function weighStart(
  idea,
  ranked,
  pick,
  catalog,
  {weights = null, newPage = false} = {},
) {
  if (!weights) return undefined;
  const {cands, scores, position} = blend(idea, ranked, pick, catalog, weights);
  /** @param {(c: string) => boolean} ok */
  const best = ok => {
    let at = -1;
    for (let c = 0; c < cands.length; c++) {
      if (ok(cands[c]) && (at < 0 || scores[c] > scores[at])) at = c;
    }
    return at < 0 ? null : cands[at];
  };
  const kept =
    pick && pick.family !== SHELL_FAMILY && cands.includes(pick.name)
      ? pick.name
      : null;
  // A template the ranker placed by its frame stays (spec:AST-048/FR3).
  if (kept && pick?.containerMatched) return kept;
  // The tables cannot judge a template they do not list (an integration's
  // template, or one added since they were fit), so its own descriptor
  // decides: the ranker's pick stands when the idea names as many words of its
  // display name, category and keywords as of the best listed template's (the
  // pick model's choice, as for every other page), or names its family first
  // and nearly as many; otherwise that listed template starts. Nothing learned about the template is involved,
  // so a new template competes on its own words.
  if (kept && !position.has(kept)) {
    const listed = bestPage(idea, ranked, pick, catalog, weights, c =>
      position.has(c),
    );
    if (!listed) return kept;
    // The idea's own words, less search's stopwords: "basically" must not
    // answer the "Basic" of a category.
    const order = contentWords(idea);
    const mine = ownWords(kept, catalog, order);
    const theirs = ownWords(listed, catalog, order);
    // An idea that names the template's family before the listed one's
    // ("a dashboard with a data table") is that family's page, unless it
    // names far more of the listed template's words.
    const stays =
      mine >= theirs ||
      (familyAt(kept, catalog, order) < familyAt(listed, catalog, order) &&
        mine >= theirs - FAMILY_SLACK);
    if (!stays) return listed;
    // A tie in the ranker is no preference: every table that names "table"
    // scores the same, and the alphabet must not choose the page. Among the
    // family's templates the ranker ties with this unlisted one, the template
    // whose own descriptor best matches the idea starts (`fullerOfTie`), then
    // the one most typical of the family. Only the templates' descriptors
    // decide this tie, never the tables.
    return fullerOfTie(kept, idea, ranked, cands, catalog);
  }
  const top = best(() => true);
  if (top !== SHELL)
    return bestPage(idea, ranked, pick, catalog, weights) ?? top;
  // An idea that asks for a new page keeps the ranker's template rather than
  // the shell.
  if (newPage && kept) return kept;
  return null;
}

/**
 * The call model's scores: the app shell's, the best non-shell template's and
 * the runner-up's, with the page to start from (the pick model's choice when
 * the file has one, else the call model's best page). Null without weights.
 * @param {string} idea
 * @param {import('./rank.mjs').RankedPage[]} ranked
 * @param {import('./rank.mjs').RankedPage | null} pick
 * @param {DescribedTemplate[]} catalog
 * @param {WeightsFile | null} weights
 */
export function blendSummary(idea, ranked, pick, catalog, weights) {
  if (!weights) return null;
  const {cands, scores} = blend(idea, ranked, pick, catalog, weights);
  let shell = 0;
  const rest = [];
  for (let i = 0; i < cands.length; i++) {
    if (cands[i] === SHELL) shell = scores[i];
    else rest.push({name: cands[i], score: scores[i], i});
  }
  rest.sort((x, y) => y.score - x.score || x.i - y.i);
  return {
    shell,
    best: hasPickModel(weights)
      ? bestPage(idea, ranked, pick, catalog, weights)
      : (rest[0]?.name ?? null),
    bestScore: rest[0]?.score ?? 0,
    secondScore: rest[1]?.score ?? 0,
  };
}
