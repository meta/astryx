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
