// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Word weights for `build`'s START (spec:AST-048): a checked-in table of
 * per-template word weights, blended with the page ranker's own scores, picks
 * the template an idea starts from.
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
 */

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
  const order = [...val.keys()].sort((a, b) => val[b] - val[a]);
  const rank = new Array(v.length);
  order.forEach((ci, r) => (rank[ci] = r));
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
 */

/**
 * How many of the idea's stemmed words a template's own descriptor names: its
 * display name, its category, and its keywords, less search's stopwords.
 * @param {string} name
 * @param {DescribedTemplate[]} catalog
 * @param {Set<string>} words the idea's stemmed words, less search's stopwords
 */
function ownWords(name, catalog, words) {
  const t = catalog.find(c => c.name === name);
  if (!t) return 0;
  // Search's stopwords are no evidence: "to" in a "to-do list" keyword must
  // not answer the "to" of "rows to track orders".
  const own = new Set(
    weightWords(
      [t.displayName ?? '', t.category ?? '', ...(t.keywords ?? [])].join(' '),
    )
      .filter(w => !STOPWORDS.has(w))
      .map(stem),
  );
  let n = 0;
  for (const w of words) if (own.has(w)) n++;
  return n;
}

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
  // display name, category and keywords as of the tables' first listed
  // template's, or names its family first and nearly as many; otherwise that
  // listed template starts. Nothing learned about the template is involved,
  // so a new template competes on its own words.
  if (kept && !position.has(kept)) {
    const listed = best(c => c !== SHELL && position.has(c));
    if (!listed) return kept;
    // The idea's own words, less search's stopwords: "basically" must not
    // answer the "Basic" of a category.
    const content = weightWords(idea).filter(w => !STOPWORDS.has(w));
    const said = new Set(content.map(stem));
    const mine = ownWords(kept, catalog, said);
    const theirs = ownWords(listed, catalog, said);
    if (mine >= theirs) return kept;
    // An idea that names the template's family before the listed one's
    // ("a dashboard with a data table") is that family's page, unless it
    // names far more of the listed template's words.
    const order = content.map(stem);
    return familyAt(kept, catalog, order) < familyAt(listed, catalog, order) &&
      mine >= theirs - FAMILY_SLACK
      ? kept
      : listed;
  }
  const top = best(() => true);
  if (top !== SHELL) return top;
  // An idea that asks for a new page keeps the ranker's template rather than
  // the shell.
  if (newPage && kept) return kept;
  return null;
}
