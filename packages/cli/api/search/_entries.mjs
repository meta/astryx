// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The entry table search's searchers rank over: every returnable entry
 * with its name words and the BM25 postings of its name, docs text, and card.
 * Built once per gathered catalog.
 */

import {createHash} from 'node:crypto';
import {DOMAINS, words, fold, nameWords} from './_query-words.mjs';
import {fileURLToPath} from 'node:url';
import {persistedDerived} from '../../foundation/fs/gather-cache.mjs';

/** This module and the word rules it builds entries with, by path. */
const ENTRIES_FILE = fileURLToPath(import.meta.url);
const QUERY_WORDS_FILE = fileURLToPath(
  new URL('./_query-words.mjs', import.meta.url),
);
/** The cards search reads (./_adapter.mjs), by path. */
const CARDS_FILE = fileURLToPath(new URL('./_cards.json', import.meta.url));

/** @param {string[]} list @returns {Map<string, number>} */
const counts = list => {
  const m = new Map();
  for (const w of list) m.set(w, (m.get(w) ?? 0) + 1);
  return m;
};

/**
 * @typedef {object} EntryTable
 * @property {string[]} ids every returnable `<domain>:<name>`, in code-point order
 * @property {Map<string, number>} index id -> position
 * @property {any[]} candidate one candidate per id, for its result
 * @property {number[]} domain domain index per id
 * @property {string[][]} name each id's name words
 * @property {Record<'name'|'desc'|'card', {post: WordLookup<[number, number][]>, idf: WordLookup<number>, len: number[], avg: number, rarest: number}>} fields
 */

/**
 * @template V
 * @typedef {{get: (word: string) => V | undefined}} WordLookup
 */

const tables = new WeakMap();

/**
 * The entry a lexical result answers as.
 * @param {{index: Map<string, number>}} table
 * @param {{domain: string, name: string, package?: string, section?: string}} res
 * @returns {number | undefined}
 */
export const entryOf = (table, res) => {
  const id = `${res.domain}:${res.name}${res.section ? `#${res.section}` : ''}`;
  return table.index.get(`${id}|${res.package}`) ?? table.index.get(id);
};

/**
 * The id a candidate answers as: a doc section is its own entry, beside its
 * topic. @param {any} c
 */
export const entryId = c =>
  c.domain === 'doc'
    ? `doc:${c._topic ?? c.name}${c._section ? `#${c._section}` : ''}`
    : `${c.domain}:${c._resultName ?? c.name}`;

/**
 * The entries search can answer with and their text, by field. Each doc
 * section is its own entry. Built once per gathered catalog.
 * @param {any[]} all the gathered candidates
 * @param {Record<string, {what?: string, synonyms?: string[], props?: string[]}>} cards
 * @returns {EntryTable}
 */
export function entryTable(all, cards) {
  const hit = tables.get(all);
  if (hit) return hit;
  // Each search gathers a fresh candidate list, so the table is also kept by
  // the text it is built from: an unchanged catalog reuses it.
  const key = fingerprint(all, cards);
  if (last && last.key === key) {
    tables.set(all, last.table);
    return last.table;
  }
  // The table is a function of the text it is built from: kept beside the
  // catalog, a later run with the same catalog reads it back.
  const built = persistedDerived(
    ['entry-table', key],
    () => buildTable(all, cards),
    tableCodec(all),
    // The code that builds it, loaded or not when the table is kept, and the
    // cards it reads, which search reads after the catalog is kept.
    [ENTRIES_FILE, QUERY_WORDS_FILE, CARDS_FILE],
  );
  last = {key, table: built};
  tables.set(all, built);
  return built;
}

/** @type {{key: string, table: EntryTable} | null} */
let last = null;

/**
 * A field's words and their values, kept as one text: a line per word, the
 * word and its value after one space. A lookup reads only the line it asks
 * for, so a run decodes the few words its query names, not every word.
 * Words hold no whitespace (search splits text on it), so a line's first
 * space ends its word.
 * @template V
 */
class KeptWords {
  /**
   * @param {string} text
   * @param {(value: string) => V} read
   */
  constructor(text, read) {
    if (typeof text !== 'string') throw new TypeError('kept words are text');
    this.text = text;
    this.read = read;
  }

  /**
   * @param {string} word
   * @returns {V | undefined}
   */
  get(word) {
    if (/\s/.test(word)) return undefined;
    const at = this.text.indexOf(`\n${word} `);
    if (at < 0) return undefined;
    const from = at + word.length + 2;
    return this.read(this.text.slice(from, this.text.indexOf('\n', from)));
  }
}

/**
 * A map's words and values as KeptWords text; a word with whitespace is
 * refused, so its table is never kept.
 * @template V
 * @param {Map<string, V>} map
 * @param {(value: V) => string} show
 * @returns {string}
 */
function wordsText(map, show) {
  let text = '';
  for (const [word, value] of map) {
    if (/\s/.test(word)) throw new Error(`a word with whitespace: ${word}`);
    text += `\n${word} ${show(value)}`;
  }
  return `${text}\n`;
}

/** @param {[number, number][]} list */
const showPostings = list => list.map(([k, c]) => `${k}:${c}`).join(',');

/** @param {string} text @returns {[number, number][]} */
const readPostings = text =>
  text.split(',').map(pair => {
    const cut = pair.indexOf(':');
    return [Number(pair.slice(0, cut)), Number(pair.slice(cut + 1))];
  });

/**
 * A table's plain-JSON form and back. Candidates are kept as their place in
 * `all`, and each field's words as KeptWords text, so the table reads back
 * the same: every word looks up the value it had.
 * @param {any[]} all
 * @returns {{encode: (table: EntryTable) => any, decode: (stored: any) => EntryTable, valid: (table: any) => boolean}}
 */
export function tableCodec(all) {
  return {
    /**
     * The shape a read-back table needs: a candidate for every id, and its
     * fields.
     * @param {any} table
     */
    valid: table =>
      table != null &&
      Array.isArray(table.ids) &&
      Array.isArray(table.candidate) &&
      table.candidate.length === table.ids.length &&
      table.candidate.every((/** @type {any} */ c) => c != null) &&
      Array.isArray(table.domain) &&
      table.domain.length === table.ids.length &&
      Array.isArray(table.name) &&
      table.name.length === table.ids.length &&
      table.fields != null &&
      ['name', 'desc', 'card'].every(f => {
        const field = table.fields[f];
        return (
          field != null &&
          field.post instanceof KeptWords &&
          field.idf instanceof KeptWords &&
          Array.isArray(field.len) &&
          field.len.length === table.ids.length &&
          typeof field.avg === 'number' &&
          typeof field.rarest === 'number'
        );
      }),
    encode(table) {
      const place = new Map(all.map((c, k) => [c, k]));
      const t = /** @type {any} */ (table);
      return {
        ids: t.ids,
        candidate: t.candidate.map((/** @type {any} */ c) => place.get(c)),
        domain: t.domain,
        name: t.name,
        fields: Object.fromEntries(
          Object.entries(t.fields).map(([f, {post, idf, len, avg, rarest}]) => [
            f,
            {
              post: wordsText(post, showPostings),
              idf: wordsText(idf, String),
              len,
              avg,
              rarest,
            },
          ]),
        ),
      };
    },
    decode(stored) {
      return /** @type {EntryTable} */ (
        /** @type {unknown} */ ({
          ids: stored.ids,
          index: new Map(
            stored.ids.map(
              (/** @type {string} */ id, /** @type {number} */ k) => [id, k],
            ),
          ),
          candidate: stored.candidate.map((/** @type {number} */ k) => all[k]),
          domain: stored.domain,
          name: stored.name,
          fields: Object.fromEntries(
            Object.entries(stored.fields).map(
              ([f, {post, idf, len, avg, rarest}]) => [
                f,
                {
                  post: new KeptWords(post, readPostings),
                  idf: new KeptWords(idf, Number),
                  len,
                  avg,
                  rarest,
                },
              ],
            ),
          ),
        })
      );
    },
  };
}
/** @type {WeakMap<object, number>} */
const cardIds = new WeakMap();
let nextCardId = 0;

/**
 * The candidate fields buildTable reads, all of them hashed by fingerprint;
 * `_entries.test.mjs` fails if buildTable starts reading another.
 */
/** How many guidance lines and prose paragraphs of a candidate the index reads. */
const GUIDANCE_LINES = 10;
const PROSE_PARAGRAPHS = 4;

export const HASHED_FIELDS = Object.freeze([
  'domain',
  'name',
  '_topic',
  '_section',
  '_resultName',
  '_package',
  'description',
  'keywords',
  'aliases',
  'titles',
  'guidance',
  'prose',
]);

/**
 * Everything the table reads from the catalog, hashed.
 * @param {any[]} all
 * @param {object} cards
 * @returns {string}
 */
function fingerprint(all, cards) {
  if (!cardIds.has(cards)) cardIds.set(cards, nextCardId++);
  const h = createHash('sha1');
  h.update(String(cardIds.get(cards)));
  for (const c of all) {
    h.update(
      JSON.stringify(
        HASHED_FIELDS.map(f =>
          f === 'guidance'
            ? (c.guidance ?? []).slice(0, GUIDANCE_LINES)
            : f === 'prose'
              ? (c.prose ?? []).slice(0, PROSE_PARAGRAPHS)
              : c[f],
        ),
      ),
    );
  }
  return h.digest('hex');
}

/**
 * The largest of a field's idf values, or 0 for a field with no words.
 * @param {Map<string, number>} idf
 * @returns {number}
 */
function largest(idf) {
  let most = 0;
  for (const value of idf.values()) if (value > most) most = value;
  return most;
}

/**
 * @param {any[]} all
 * @param {Record<string, {what?: string, synonyms?: string[], props?: string[]}>} cards
 * @returns {EntryTable}
 */
export function buildTable(all, cards) {
  /** @type {Map<string, any[]>} */
  const by = new Map();
  /** @type {Map<string, string>} each id's first package */
  const owner = new Map();
  for (const c of all) {
    // Two packages may each give an entry the same name (an integration's
    // Dialog beside Core's): the later package's entry keeps its own id.
    const plain = entryId(c);
    if (!owner.has(plain)) owner.set(plain, c._package ?? '');
    const id =
      (c._package ?? '') === owner.get(plain)
        ? plain
        : `${plain}|${c._package}`;
    if (!by.has(id)) by.set(id, []);
    /** @type {any[]} */ (by.get(id)).push(c);
  }
  const ids = [...by.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  /** @type {Record<'name'|'desc'|'card', Map<string, number>[]>} */
  const docs = {name: [], desc: [], card: []};
  const table = /** @type {EntryTable} */ (
    /** @type {unknown} */ ({
      ids,
      index: new Map(ids.map((id, k) => [id, k])),
      candidate: [],
      domain: [],
      name: [],
      fields: {},
    })
  );
  for (const id of ids) {
    const group = /** @type {any[]} */ (by.get(id));
    const first = group.find(c => !c._section) ?? group[0];
    const plain = id.split('|')[0].split('#')[0];
    const [domain, name] = [
      plain.slice(0, plain.indexOf(':')),
      plain.slice(plain.indexOf(':') + 1),
    ];
    const nw = nameWords(name).map(fold);
    table.candidate.push(first);
    table.domain.push(DOMAINS.indexOf(domain));
    table.name.push(nw);
    const text = [];
    for (const c of group) {
      text.push(
        c.description ?? '',
        ...(c.keywords ?? []),
        ...(c.aliases ?? []),
        ...(c.titles ?? []),
      );
      text.push(
        ...(c.guidance ?? []).slice(0, GUIDANCE_LINES),
        ...(c.prose ?? []).slice(0, PROSE_PARAGRAPHS),
      );
    }
    const card =
      domain === 'component' || domain === 'hook' ? cards[name] : undefined;
    docs.name.push(counts([...nw, nw.join('')]));
    docs.desc.push(counts(words(text.join(' ')).map(fold)));
    docs.card.push(
      counts(
        card
          ? words(
              [
                card.what ?? '',
                ...(card.synonyms ?? []),
                ...(card.props ?? []),
              ].join(' '),
            ).map(fold)
          : [],
      ),
    );
  }
  const n = ids.length;
  for (const f of /** @type {const} */ (['name', 'desc', 'card'])) {
    /** @type {Map<string, [number, number][]>} */
    const post = new Map();
    /** @type {Map<string, number>} */
    const df = new Map();
    /** @type {number[]} */
    const len = [];
    docs[f].forEach((m, k) => {
      let l = 1;
      for (const [w, c] of m) {
        l += c;
        df.set(w, (df.get(w) ?? 0) + 1);
        const list = post.get(w) ?? [];
        list.push([k, c]);
        post.set(w, list);
      }
      len.push(l);
    });
    const idf = new Map();
    for (const [w, d] of df)
      idf.set(w, Math.log(1 + (n - d + 0.5) / (d + 0.5)));
    table.fields[f] = {
      post,
      idf,
      len,
      avg: len.reduce((a, b) => a + b, 0) / n,
      rarest: largest(idf),
    };
  }
  return table;
}
