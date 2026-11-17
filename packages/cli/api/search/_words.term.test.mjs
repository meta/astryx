// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A term's words (termWords in _words.mjs) answer as sameWord and
 * startsAWordOf did, and scoring one candidate builds the term's forms once,
 * not once for every word it compares.
 */

import {describe, expect, it} from 'vitest';
import {scoreCandidate} from './_candidate-score.mjs';
import {
  sameTermWord,
  sameWord,
  startsATermWordOf,
  startsAWordOf,
  stem,
  termWords,
  wordForms,
  wordsOf,
} from './_words.mjs';

/**
 * The forms of a word as they were worked out before termWords, kept here as
 * the reference answer.
 * @param {string} w
 */
function referenceForms(w) {
  const forms = new Set([w, stem(w)]);
  if (w.length > 3 && w.endsWith('s')) forms.add(w.slice(0, -1));
  if (w.length > 4 && w.endsWith('es')) forms.add(w.slice(0, -2));
  if (w.length > 4 && w.endsWith('ies')) forms.add(w.slice(0, -3) + 'y');
  if (w.length >= 6 && w.endsWith('ing')) {
    const base = w.slice(0, -3);
    forms.add(base);
    forms.add(`${base}e`);
    if (/([b-df-hj-np-tv-z])\1$/.test(base)) forms.add(base.slice(0, -1));
  }
  return forms;
}

/** @param {string} a @param {string} b */
function referenceSameWord(a, b) {
  if (a === b) return true;
  const forms = referenceForms(a);
  for (const f of referenceForms(b)) if (forms.has(f)) return true;
  return false;
}

/** @param {string} term @param {string} text */
function referenceStarts(term, text) {
  if (term.length < 4) return false;
  if (term.length / String(text).length < 0.5) return false;
  const singulars = [];
  if (term.length > 3 && term.endsWith('s')) singulars.push(term.slice(0, -1));
  if (term.length > 4 && term.endsWith('es')) singulars.push(term.slice(0, -2));
  if (term.length > 4 && term.endsWith('ies')) {
    singulars.push(term.slice(0, -3) + 'y');
  }
  const starts = [term, ...singulars.filter(f => f.length >= 5)];
  return wordsOf(text).some(
    w => starts.some(f => w.startsWith(f)) || referenceSameWord(term, w),
  );
}

const WORDS = [
  'table',
  'tables',
  'status',
  'statuses',
  'entry',
  'entries',
  'filter',
  'filtering',
  'filtered',
  'space',
  'spacing',
  'drag',
  'dragging',
  'run',
  'running',
  'box',
  'boxes',
  'token',
  'tokens',
  'tokenizer',
  'stats',
  'chart',
  'charts',
  'charting',
  'dashboard',
  'dashboards',
  'menu',
  'menus',
  'select',
  'selection',
  'series',
  'is',
  'as',
  'ties',
  'skies',
  'thing',
  'things',
  'sing',
];
const TEXTS = [
  'TextInput',
  'Dashboard - Analytics',
  'tokenizer',
  'StatusBadge',
  'DataTable',
  'filters',
  'Charting Guide',
  'boxes',
  'spacing scale',
  'drag and drop',
];

describe('termWords', () => {
  it('works out the forms sameWord and startsAWordOf use, for every pair', () => {
    for (const w of WORDS) {
      expect([...wordForms(w)], w).toEqual([...referenceForms(w)]);
    }
    for (const a of WORDS) {
      const t = termWords(a);
      for (const b of WORDS) {
        const answer = referenceSameWord(a, b);
        expect(sameWord(a, b), `${a} ${b}`).toBe(answer);
        expect(sameTermWord(t, b), `${a} ${b}`).toBe(answer);
      }
      for (const text of [...TEXTS, ...WORDS]) {
        const answer = referenceStarts(a, text);
        expect(startsAWordOf(a, text), `${a} in ${text}`).toBe(answer);
        expect(startsATermWordOf(t, text), `${a} in ${text}`).toBe(answer);
      }
    }
  });

  it("builds the term's forms once when scoring a candidate with many keywords", () => {
    const candidate = {
      name: 'ChartLegend',
      domain: 'component',
      keywords: WORDS.map(w => `${w} legend`),
      description: 'A legend for a chart.',
    };
    let built = 0;
    const RealSet = globalThis.Set;
    globalThis.Set = class extends RealSet {
      /** @param {Iterable<unknown>} [values] */
      constructor(values) {
        super(values);
        built += 1;
      }
    };
    try {
      scoreCandidate('dashboards', candidate);
    } finally {
      globalThis.Set = RealSet;
    }
    // One set for the term's forms, one for the prose pattern's roots.
    expect(built).toBe(2);
  });
});
