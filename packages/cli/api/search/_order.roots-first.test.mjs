// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A family's root leads a part of its own family in their run when the
 * part adds nothing the query asked for (rootsFirst in _order.mjs). Made-up
 * entries: the Zorb family (root ZorbList; parts ZorbItem, ZorbStatus and
 * Zorb) and the Quill family (root QuillBox, part QuillMark).
 */

import {describe, expect, it} from 'vitest';
import {requireNatively} from '../../test-utils/native-require.mjs';

const require = requireNatively(import.meta.url);
/** @type {typeof import('./_order.mjs')} */
const {rootsFirst} = require('./_order.mjs');

const FAMILIES = new Map([
  ['component:ZorbItem', 'ZorbList'],
  ['component:Zorb', 'ZorbList'],
  ['component:QuillMark', 'QuillBox'],
  ['component:ZorbStatus', 'ZorbList'],
]);

/**
 * @param {[string, number, string, number?][]} rows name, score, reason, run
 * @param {string} [domain]
 */
const items = (rows, domain = 'component') =>
  rows.map(([name, score, reason, band = 0], i) => ({
    res: {domain, name, score, reason},
    i,
    band,
    learned: i,
  }));

/** @param {any[]} out */
const names = out => out.map(it => it.res.name);

describe('rootsFirst', () => {
  it('puts the root ahead of its part when both answer the whole query', () => {
    const out = rootsFirst(
      items([
        ['Zorb', 99, 'plural of the name'],
        ['ZorbList', 90, 'keyword "zorbs"'],
      ]),
      FAMILIES,
      'zorbs',
    );
    expect(names(out)).toEqual(['ZorbList', 'Zorb']);
  });

  it('puts the root ahead when it answers every word the part answers', () => {
    const out = rootsFirst(
      items([
        ['ZorbItem', 120, 'matches 2/3 terms: zorb, compact'],
        ['Fizz', 110, 'matches 2/3 terms: compact, lists'],
        ['ZorbList', 105, 'matches 3/3 terms: zorb, lists, compact'],
      ]),
      FAMILIES,
      'zorb lists compact',
    );
    expect(names(out)).toEqual(['ZorbList', 'ZorbItem', 'Fizz']);
  });

  it('keeps the part first when it answers a word the root does not', () => {
    const rows = items([
      ['QuillMark', 120, 'matches 2/3 terms: quill, ink'],
      ['QuillBox', 110, 'matches 2/3 terms: quill, frame'],
    ]);
    expect(names(rootsFirst(rows, FAMILIES, 'quill ink frame'))).toEqual([
      'QuillMark',
      'QuillBox',
    ]);
  });

  it('keeps the part first when the query holds a word only its name has', () => {
    const rows = items([
      ['ZorbItem', 120, 'matches 2/2 terms: zorb, item'],
      ['ZorbList', 110, 'matches 2/2 terms: zorb, item'],
    ]);
    expect(names(rootsFirst(rows, FAMILIES, 'zorb item'))).toEqual([
      'ZorbItem',
      'ZorbList',
    ]);
    // A typed identifier counts by its words.
    expect(names(rootsFirst(rows, FAMILIES, 'ZorbItem wide'))).toEqual([
      'ZorbItem',
      'ZorbList',
    ]);
  });

  it('reads a part word in any plural form, as search reads words', () => {
    const rows = items([
      ['ZorbStatus', 120, 'matches 2/2 terms: zorb, statuses'],
      ['ZorbList', 110, 'matches 2/2 terms: zorb, statuses'],
    ]);
    expect(names(rootsFirst(rows, FAMILIES, 'zorb statuses'))).toEqual([
      'ZorbStatus',
      'ZorbList',
    ]);
    expect(names(rootsFirst(rows, FAMILIES, 'zorb status'))).toEqual([
      'ZorbStatus',
      'ZorbList',
    ]);
  });

  it('never moves the root out of its run', () => {
    const rows = items([
      ['Zorb', 107, 'matches 1/2 terms: zorbs', 0],
      ['ZorbList', 98, 'matches 1/2 terms: zorbs', 1],
    ]);
    expect(names(rootsFirst(rows, FAMILIES, 'zorbs pile'))).toEqual([
      'Zorb',
      'ZorbList',
    ]);
  });

  it('leaves entries of no family, and other domains, in place', () => {
    const rows = [
      ...items([['Zorb', 99, 'plural of the name']], 'template'),
      ...items([['ZorbList', 90, 'keyword "zorbs"']]),
    ];
    expect(names(rootsFirst(rows, FAMILIES, 'zorbs'))).toEqual([
      'Zorb',
      'ZorbList',
    ]);
  });
});
