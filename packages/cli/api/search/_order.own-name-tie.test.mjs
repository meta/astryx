// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Among matches tied with the first result on score and on the query
 * words they matched, the one whose own name holds more query words leads
 * (tieByOwnName in _order.mjs). Made-up entries: Glim, Quark, PebbleTray,
 * and the Zorb family (root Zorb, part ZorbStack).
 */

import {describe, expect, it} from 'vitest';
import {requireNatively} from '../../test-utils/native-require.mjs';

const require = requireNatively(import.meta.url);
/** @type {typeof import('./_order.mjs')} */
const {tieByOwnName} = require('./_order.mjs');

const FAMILIES = new Map([['component:ZorbStack', 'Zorb']]);
const BOTH = 'matches 2/3 terms: pebble, trays';

/**
 * @param {[string, number, string?, string?, number?][]} rows name, score,
 *   reason, domain, run
 */
const items = rows =>
  rows.map(
    ([name, score, reason = BOTH, domain = 'component', band = 0], i) => ({
      res: {domain, name, score, reason},
      i,
      band,
      learned: i,
    }),
  );

/** @param {any} it */
const blockOf = it => `${it.band}:${it.res.score}`;

/** @param {any[]} out */
const names = out => out.map(it => it.res.name);

describe('tieByOwnName', () => {
  it('moves the tied match whose name holds more query words first', () => {
    const out = tieByOwnName(
      items([
        ['Glim', 112],
        ['Quark', 112],
        ['PebbleTray', 112],
        ['Fizz', 100],
      ]),
      'pebble trays glow',
      blockOf,
      FAMILIES,
    );
    expect(names(out)).toEqual(['PebbleTray', 'Glim', 'Quark', 'Fizz']);
  });

  it('keeps every match, score and reason; only the order moves', () => {
    const rows = items([
      ['Glim', 112],
      ['Quark', 112],
      ['PebbleTray', 112],
      ['Fizz', 100, 'matches 1/3 terms: glow'],
    ]);
    const before = rows.map(it => ({...it.res}));
    const out = tieByOwnName(rows, 'pebble trays glow', blockOf, FAMILIES);
    expect(names(out)).toEqual(['PebbleTray', 'Glim', 'Quark', 'Fizz']);
    expect(out).toHaveLength(rows.length);
    expect(new Set(out)).toEqual(new Set(rows));
    const key = (/** @type {any} */ r) => `${r.domain}:${r.name}`;
    const sorted = (/** @type {any[]} */ list) =>
      [...list].sort((a, b) => (key(a) < key(b) ? -1 : 1));
    expect(sorted(out.map(it => it.res))).toEqual(sorted(before));
  });

  it('keeps the order when the tied matches matched other words', () => {
    const rows = items([
      ['Glim', 98, 'matches 1/2 terms: glow'],
      ['PebbleTray', 98, 'matches 1/2 terms: pebble'],
    ]);
    expect(names(tieByOwnName(rows, 'pebble glow', blockOf))).toEqual([
      'Glim',
      'PebbleTray',
    ]);
  });

  it('keeps the order when no tied name holds more query words', () => {
    const rows = items([
      ['Glim', 112],
      ['Quark', 112],
    ]);
    expect(names(tieByOwnName(rows, 'pebble trays glow', blockOf))).toEqual([
      'Glim',
      'Quark',
    ]);
  });

  it('keeps the order when the first result matched the whole query', () => {
    const rows = items([
      ['Glim', 90, 'keyword "pebble tray"'],
      ['PebbleTray', 90, 'keyword "pebble tray"'],
    ]);
    expect(names(tieByOwnName(rows, 'pebble tray', blockOf))).toEqual([
      'Glim',
      'PebbleTray',
    ]);
  });

  it('keeps the order when the query holds the first result title', () => {
    const named = 'the query names the title "Pebble trays"';
    const rows = items([
      ['Glim', 162, named, 'doc'],
      ['PebbleTray', 162, named, 'doc'],
    ]);
    expect(names(tieByOwnName(rows, 'make pebble trays', blockOf))).toEqual([
      'Glim',
      'PebbleTray',
    ]);
  });

  it('never moves a match of another score, run, or domain', () => {
    const rows = items([
      ['Glim', 112],
      ['PebbleTray', 110],
      ['PebbleTray', 112, BOTH, 'template'],
      ['PebbleTray', 112, BOTH, 'component', 1],
    ]);
    expect(names(tieByOwnName(rows, 'pebble trays', blockOf))).toEqual([
      'Glim',
      'PebbleTray',
      'PebbleTray',
      'PebbleTray',
    ]);
  });

  it('never puts a part of the first result in its place', () => {
    const rows = items([
      ['Zorb', 118, 'matches 2/2 terms: zorb, stack'],
      ['ZorbStack', 118, 'matches 2/2 terms: zorb, stack'],
    ]);
    expect(names(tieByOwnName(rows, 'zorb stack', blockOf, FAMILIES))).toEqual([
      'Zorb',
      'ZorbStack',
    ]);
    // A part by name, with no family declared, also keeps its place.
    expect(names(tieByOwnName(rows, 'zorb stack', blockOf))).toEqual([
      'Zorb',
      'ZorbStack',
    ]);
  });
});
