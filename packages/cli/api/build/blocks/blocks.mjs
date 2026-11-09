// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file build's block picker: ranks every block in the catalog for a request
 * by meaning, from each block's own docs, and keeps build's own count.
 *
 * @input The request, build's signals for it (`kitSignals`: the blocks the kit
 *   names, search's block results with their scores and coverage, the block
 *   catalog and the components), and the picker weights
 *   (`blocks.weights.json` beside this file, read by the adapter): a
 *   vocabulary of stemmed words and word pairs with their idf (x1024), two
 *   signed byte matrices that map request words and doc words into one space, the
 *   lexical weight, the blocks the matrices were fitted with, and the ranking
 *   coefficients.
 * @output `pickBlocks(...)`: block names, best first, as many as build's own
 *   list, and an entry (real score and reason) for each listed block search
 *   did not return.
 * @position api/build/blocks; tree.mjs's main searcher calls it between
 *   kitSignals (kit/signals.mjs) and kitAnswer (kit/answer.mjs). Pure: no file,
 *   network, or environment access.
 *
 * How it scores. A block is described by its own docs only: its name, display
 * name and description, and its component's name and keywords. The request
 * and each block's docs become weighted word vectors (stemmed content words
 * and adjacent pairs, (1 + ln count) x idf, unit length). Their match is the
 * request's vector through the request matrix, against the docs' vector
 * through the doc matrix, plus the lexical weight times their plain overlap
 * (cosine), so a block the weights were never fitted with, such as a new one,
 * is scored from its docs the same way. The candidates are the best matches,
 * build's own blocks, search's first results, and the best plain overlaps.
 * Each candidate's final score adds the ranking coefficients times: its match
 * relative to the best, its place among the matches, its lead over the
 * second-best match, whether the weights know it, its plain overlap,
 * search's score and share of the request matched and place, whether build
 * names it and where, how strongly the request names its component, and
 * whether it is its component's general example. A block the request writes
 * out by its exact name, and a block whose package is not Core's, keep the
 * slot build gave them; the best of the others fill the remaining slots.
 */

import {STOPWORDS} from '../../search/_query.mjs';

/**
 * @typedef {object} BlockPickerWeights
 * @property {string[]} vocab stemmed words and `a_b` word pairs
 * @property {number[]} idf one per vocab entry, x1024
 * @property {number} dims the width of the shared space
 * @property {string} request base64 bytes, vocab.length x dims, row-major, each a signed weight offset by 128
 * @property {number} requestScale
 * @property {string} doc base64 bytes, vocab.length x dims, row-major, each a signed weight offset by 128
 * @property {number} docScale
 * @property {number} lexical the weight of the plain overlap
 * @property {string[]} known the blocks the matrices were fitted with
 * @property {Record<string, number>} theta the ranking coefficients
 *
 * @typedef {import('../kit/signals.mjs').BlockScore} BlockScore
 * @typedef {{name: string, package?: string, displayName?: string, description?: string, command?: string}} CatalogBlock
 * @typedef {{name: string, keywords?: string[]}} CatalogComponent
 * @typedef {import('../../search/search.type.mjs').SearchResultEntry} SearchResultEntry
 */

/**
 * Generic English function words, search's stopwords, and words every build
 * request or block shares: never a reason to tie a block to a request.
 */
const STOP = new Set([
  ...STOPWORDS,
  ...(
    'about above across after again against all along already also although ' +
    'always am among amongst an and another any anyone anything anywhere are ' +
    'around as at be because been before behind being below beneath beside ' +
    'besides between beyond both but by can could despite did do does doing ' +
    'down during each either else enough even ever every everyone everything ' +
    'everywhere except few following for from further had has have having he ' +
    'her here hers herself him himself his how however if in inside instead ' +
    'into is it its itself just least less little lot lots many may maybe me ' +
    'might more most much must my myself near neither never no nobody none ' +
    'nor not nothing now nowhere of off often on once one ones only onto or ' +
    'other others ought our ours ourselves out outside over own past per ' +
    'perhaps quite rather same several shall she should since so some someone ' +
    'something sometimes somewhat somewhere still such than that the their ' +
    'theirs them themselves then there these they this those though through ' +
    'throughout thus till to together too toward towards under underneath ' +
    'unless unlike until up upon usually very via was we were what whatever ' +
    'when whenever where whereas whether which whichever while who whoever ' +
    'whom whomever whose why will with within without would yet you your ' +
    'yours yourself yourselves'
  ).split(' '),
  ...(
    'a an the and or of for to in on with by at from as is are be this that ' +
    'it its my our your their me we you i into via per each all any some page ' +
    'app screen ui view build make create need want like show shows showing ' +
    'using use one two new add list item items basic simple showcase example ' +
    'default variant'
  ).split(' '),
]);

/**
 * Words after which the rest of a request is where the new piece goes, not
 * the piece itself ("a filter bar ABOVE the table").
 */
const CONTEXT = new Set(
  (
    'in on inside within into above below under beneath next beside to for ' +
    'with and from of near over across along around after before at'
  ).split(' '),
);

/** How many of each kind of candidate the picker weighs. */
const POOL = {matches: 60, searched: 60, overlaps: 20};

/** How many matches carry a place; the rest share the last one's match. */
const TOP = 80;

/**
 * A word with a plural or verb ending removed (words over four letters):
 * "-ies" becomes "-y"; "-es" goes only after s, x, z, ch, or sh; otherwise a
 * final "s" goes, but never after another "s"; then "-ing" or "-ed".
 * @param {string} w
 * @returns {string}
 */
export function stemOf(w) {
  if (w.length <= 4) return w;
  if (w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (/(?:s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  if (w.endsWith('ing')) return w.slice(0, -3);
  if (w.endsWith('ed')) return w.slice(0, -2);
  return w;
}

/**
 * An identifier's words, lowercase: "SideNavNestedItems" -> side, nav,
 * nested, items.
 * @param {string} text
 * @returns {string[]}
 */
export function wordsOf(text) {
  return String(text)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * A text's stemmed content words, then its adjacent pairs as `a_b`.
 * @param {string} text
 * @returns {string[]}
 */
export function termsOf(text) {
  const words = (
    String(text)
      .toLowerCase()
      .match(/[a-z0-9]{2,}/g) ?? []
  )
    .filter(w => !STOP.has(w))
    .map(stemOf);
  const out = [...words];
  for (let i = 0; i + 1 < words.length; i++)
    out.push(`${words[i]}_${words[i + 1]}`);
  return out;
}

/**
 * The weights, decoded once per weights object.
 * @type {WeakMap<BlockPickerWeights, {index: Map<string, number>, idf: Float64Array, request: Int8Array, doc: Int8Array}>}
 */
const decoded = new WeakMap();

/** @param {BlockPickerWeights} weights */
function decode(weights) {
  let d = decoded.get(weights);
  if (!d) {
    // Each byte is a signed weight stored offset by 128.
    const bytes = (/** @type {string} */ s) =>
      Int8Array.from(Buffer.from(s, 'base64'), b => b - 128);
    d = {
      index: new Map(weights.vocab.map((w, i) => [w, i])),
      idf: Float64Array.from(weights.idf, x => x / 1024),
      request: bytes(weights.request),
      doc: bytes(weights.doc),
    };
    decoded.set(weights, d);
  }
  return d;
}

/**
 * A text's sparse unit vector over the vocabulary: (1 + ln count) x idf.
 * @param {string[]} terms
 * @param {ReturnType<typeof decode>} d
 * @returns {Map<number, number>}
 */
function vectorOf(terms, d) {
  /** @type {Map<number, number>} */
  const counts = new Map();
  for (const t of terms) {
    const i = d.index.get(t);
    if (i !== undefined) counts.set(i, (counts.get(i) ?? 0) + 1);
  }
  /** @type {Map<number, number>} */
  const v = new Map();
  let sq = 0;
  for (const [i, c] of counts) {
    const x = (1 + Math.log(c)) * d.idf[i];
    v.set(i, x);
    sq += x * x;
  }
  const norm = Math.sqrt(sq) || 1;
  for (const [i, x] of v) v.set(i, x / norm);
  return v;
}

/**
 * A sparse vector through a signed byte matrix.
 * @param {Map<number, number>} v
 * @param {Int8Array} m
 * @param {number} scale
 * @param {number} dims
 */
function project(v, m, scale, dims) {
  const out = new Float64Array(dims);
  for (const [i, x] of v) {
    const row = i * dims;
    for (let k = 0; k < dims; k++) out[k] += x * m[row + k];
  }
  for (let k = 0; k < dims; k++) out[k] *= scale;
  return out;
}

/**
 * Each block's component: the longest component name its name starts with,
 * else the display name's part before " — ", without spaces.
 * @param {CatalogBlock} block
 * @param {string[]} componentNames longest first
 */
function componentOf(block, componentNames) {
  for (const c of componentNames) if (block.name.startsWith(c)) return c;
  const display = block.displayName ?? block.name;
  return display.split(' — ')[0].replace(/ /g, '');
}

/**
 * The catalog, read once per weights and catalog contents: each block's
 * component, docs vector and projection, and each component's name phrases.
 * @type {WeakMap<BlockPickerWeights, {key: string, blocks: Map<string, {component: string, vector: Map<number, number>, projected: Float64Array}>, phrases: Map<string, [string[], number][]>}>}
 */
const catalogs = new WeakMap();

/**
 * @param {CatalogBlock[]} catalog
 * @param {CatalogComponent[]} components
 * @param {BlockPickerWeights} weights
 */
function readCatalog(catalog, components, weights) {
  const key = JSON.stringify([
    catalog.map(b => [b.name, b.displayName, b.description]),
    components.map(c => [c.name, c.keywords]),
  ]);
  const cached = catalogs.get(weights);
  if (cached && cached.key === key) return cached;
  const d = decode(weights);
  const names = components.map(c => c.name).sort((a, b) => b.length - a.length);
  const keywords = new Map(components.map(c => [c.name, c.keywords ?? []]));
  /** @type {Map<string, {component: string, vector: Map<number, number>, projected: Float64Array}>} */
  const blocks = new Map();
  for (const b of catalog) {
    if (blocks.has(b.name)) continue;
    const component = componentOf(b, names);
    const text = [
      wordsOf(b.name).join(' '),
      b.displayName ?? '',
      b.description ?? '',
      wordsOf(component).join(' '),
      (keywords.get(component) ?? []).join(' '),
    ].join(' ');
    const vector = vectorOf(termsOf(text), d);
    blocks.set(b.name, {
      component,
      vector,
      projected: project(vector, d.doc, weights.docScale, weights.dims),
    });
  }
  // A component is named by its own words, or by a keyword at most three
  // components share (weighted by how few share it).
  /** @type {Map<string, number>} */
  const shared = new Map();
  for (const c of components)
    for (const k of new Set((c.keywords ?? []).map(k => k.replace(/-/g, ' '))))
      shared.set(k, (shared.get(k) ?? 0) + 1);
  const phrase = (/** @type {string} */ s) =>
    s.toLowerCase().split(/\s+/).filter(Boolean).map(stemOf);
  /** @type {Map<string, [string[], number][]>} */
  const phrases = new Map();
  const withBlocks = new Set([...blocks.values()].map(b => b.component));
  for (const c of withBlocks) {
    /** @type {[string[], number][]} */
    const list = [[phrase(wordsOf(c).join(' ')), 3]];
    for (const k of (keywords.get(c) ?? []).map(k => k.replace(/-/g, ' ')))
      if ((shared.get(k) ?? 0) <= 3)
        list.push([phrase(k), 1 / (shared.get(k) ?? 1)]);
    phrases.set(c, list);
  }
  const read = {key, blocks, phrases};
  catalogs.set(weights, read);
  return read;
}

/**
 * How strongly the request names each component: its best phrase, longer
 * phrases and earlier ones stronger, and half as strong once the request has
 * moved on to where the piece goes.
 * @param {string} request
 * @param {Map<string, [string[], number][]>} phrases
 * @returns {Map<string, number>}
 */
function namedComponents(request, phrases) {
  const raw =
    String(request)
      .toLowerCase()
      .match(/[a-z0-9]+/g) ?? [];
  const stems = raw.map(stemOf);
  let context = raw.findIndex((w, k) => k > 0 && CONTEXT.has(w));
  if (context < 0) context = raw.length;
  /** @type {Map<string, number>} */
  const out = new Map();
  for (const [c, list] of phrases) {
    let best = 0;
    for (const [p, w] of list) {
      if (p.length === 0) continue;
      let at = -1;
      for (let i = 0; i + p.length <= stems.length && at < 0; i++)
        if (p.every((x, k) => stems[i + k] === x)) at = i;
      if (at < 0) continue;
      const s =
        w *
        (1 + 0.3 * (p.length - 1)) *
        (at < context ? 1 : 0.5) *
        (1 - 0.01 * at);
      if (s > best) best = s;
    }
    if (best) out.set(c, best);
  }
  return out;
}

/**
 * Whether the request writes out the block's exact name (its words joined).
 * @param {string[]} words the request's identifier words
 * @param {string} block
 */
function writesName(words, block) {
  const name = block.toLowerCase();
  const length = wordsOf(block).length;
  for (let i = 0; i < words.length; i++) {
    let run = '';
    for (let n = 0; n < length && i + n < words.length; n++) {
      run += words[i + n];
      if (run === name) return true;
    }
  }
  return false;
}

/**
 * The blocks build names for a request, ranked by the picker.
 * @param {string} request
 * @param {{kitBlocks: string[], searched: BlockScore[], foreign: string[], catalog: CatalogBlock[], components: CatalogComponent[]}} signals
 * @param {BlockPickerWeights} weights
 * @returns {{names: string[], entries: Map<string, SearchResultEntry>}} as
 *   many names as build's own list, best first; an entry for each listed
 *   block search did not return
 */
export function pickBlocks(request, signals, weights) {
  const own = signals.kitBlocks;
  /** @type {Map<string, SearchResultEntry>} */
  const entries = new Map();
  if (own.length === 0) return {names: [], entries};
  const d = decode(weights);
  const cat = readCatalog(signals.catalog, signals.components, weights);
  const q = vectorOf(termsOf(request), d);
  const eq = project(q, d.request, weights.requestScale, weights.dims);
  const dot = (/** @type {Map<number, number>} */ v) => {
    let s = 0;
    for (const [i, x] of q) {
      const y = v.get(i);
      if (y !== undefined) s += x * y;
    }
    return s;
  };
  /** @type {Map<string, {match: number, overlap: number}>} */
  const scored = new Map();
  for (const [name, b] of cat.blocks) {
    let s = 0;
    for (let k = 0; k < weights.dims; k++) s += eq[k] * b.projected[k];
    const overlap = dot(b.vector);
    scored.set(name, {match: s + weights.lexical * overlap, overlap});
  }
  const get = (/** @type {string} */ b) =>
    scored.get(b) ?? {match: -Infinity, overlap: 0};
  const ranked = [...scored.keys()].sort((a, b) => get(b).match - get(a).match);
  const top = ranked.slice(0, TOP);
  const best = top.length ? get(top[0]).match : 0;
  const second = top.length > 1 ? get(top[1]).match : 0;
  const floor = top.length ? get(top[top.length - 1]).match : 0;
  const place = new Map(top.map((b, k) => [b, k]));
  /** @type {Map<string, [BlockScore, number]>} */
  const found = new Map();
  signals.searched.forEach((s, k) => {
    if (!found.has(s[0])) found.set(s[0], [s, k]);
  });
  const overlaps = [...scored.keys()]
    .filter(b => get(b).overlap > 0)
    .sort((a, b) => get(b).overlap - get(a).overlap || (a < b ? -1 : 1));
  const pool = [
    ...new Set([
      ...own,
      ...top.slice(0, POOL.matches),
      ...signals.searched.slice(0, POOL.searched).map(s => s[0]),
      ...overlaps.slice(0, POOL.overlaps),
    ]),
  ].filter(b => scored.has(b) || found.has(b));
  const known = new Set(weights.known);
  const named = namedComponents(request, cat.phrases);
  const t = weights.theta;
  const final = pool.map((b, pos) => {
    const m = place.has(b) ? get(b).match : floor;
    const f = found.get(b);
    const s = f?.[0];
    const component = cat.blocks.get(b)?.component;
    const score =
      t.g * (m - best) +
      t.grank * (place.get(b) ?? 99) +
      t.gmargin * (m - second) +
      t.seen * (known.has(b) ? 1 : 0) +
      t.lex * get(b).overlap +
      t.sscore * (s ? s[1] / 100 : 0) +
      t.scov * (s ? (s[2] ?? 0) / Math.max(s[3] ?? 0, 1) : 0) +
      t.srank * (f ? f[1] : 300) +
      t.inkit * (own.includes(b) ? 1 : 0) +
      t.kitpos * (own.includes(b) ? own.indexOf(b) : 9) +
      t.mention * (component ? (named.get(component) ?? 0) : 0) +
      t.show * (/Showcase|Basic/.test(b) ? 1 : 0);
    return {b, pos, score};
  });
  final.sort((a, b) => b.score - a.score || a.pos - b.pos);
  const foreign = new Set(signals.foreign);
  const words = wordsOf(request);
  const keeps = own.map(b => foreign.has(b) || writesName(words, b));
  const kept = new Set(own.filter((_, k) => keeps[k]));
  const order = [
    ...final.map(x => x.b).filter(b => !kept.has(b) && !foreign.has(b)),
    ...own.filter(b => !kept.has(b)),
  ];
  /** @type {string[]} */
  const out = [];
  let next = 0;
  for (let k = 0; k < own.length; k++) {
    if (keeps[k]) {
      out.push(own[k]);
      continue;
    }
    while (out.includes(order[next])) next++;
    out.push(order[next++]);
  }
  // A listed block search did not return gets the picker's own entry: its
  // score (100 for the best candidate, less by how far it trails, never
  // below 1) and the request words that tie it to its docs.
  const max = Math.max(...final.map(x => x.score));
  const byName = new Map(signals.catalog.map(b => [b.name, b]));
  for (const name of out) {
    if (found.has(name) || own.includes(name)) continue;
    const block = byName.get(name);
    const x = final.find(f => f.b === name);
    if (!block || !x) continue;
    entries.set(name, {
      domain: 'template',
      name,
      package: block.package ?? '',
      score: Math.max(1, Math.round(100 * Math.exp(x.score - max))),
      reason: reasonFor(request, cat.blocks.get(name), d, weights),
      description: block.description ?? '',
      displayName: block.displayName,
      kind: 'block',
      command: block.command ?? '',
    });
  }
  return {names: out, entries};
}

/**
 * Why a block fits: the request words that tie it to its docs most.
 * @param {string} request
 * @param {{vector: Map<number, number>, projected: Float64Array} | undefined} block
 * @param {ReturnType<typeof decode>} d
 * @param {BlockPickerWeights} weights
 */
function reasonFor(request, block, d, weights) {
  if (!block) return 'fits by meaning';
  const raw =
    String(request)
      .toLowerCase()
      .match(/[a-z0-9]{2,}/g) ?? [];
  /** @type {Map<string, string>} */
  const wordOf = new Map();
  for (const w of raw)
    if (!STOP.has(w) && !wordOf.has(stemOf(w))) wordOf.set(stemOf(w), w);
  const q = vectorOf(termsOf(request), d);
  /** @type {[string, number][]} */
  const parts = [];
  for (const [i, x] of q) {
    const term = weights.vocab[i];
    if (term.includes('_')) continue;
    let s = 0;
    const row = i * weights.dims;
    for (let k = 0; k < weights.dims; k++)
      s += d.request[row + k] * block.projected[k];
    s =
      x * s * weights.requestScale +
      weights.lexical * x * (block.vector.get(i) ?? 0);
    if (s > 0) parts.push([wordOf.get(term) ?? term, s]);
  }
  parts.sort((a, b) => b[1] - a[1]);
  const top = parts.slice(0, 3).map(p => p[0]);
  return top.length ? `fits by meaning: ${top.join(', ')}` : 'fits by meaning';
}
