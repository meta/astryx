// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The fit pass over search's answer, on a made-up catalog: the first
 * result stays, the set of results stays, nothing crosses a band or kind,
 * and an entry known only from its own docs moves up when it fits.
 */

import {describe, it, expect} from 'vitest';
import {requireNatively} from '../../test-utils/native-require.mjs';

const require = requireNatively(import.meta.url);
/** @type {typeof import('./_fit-order.mjs')} */
const {orderByFit, withFitOrder, withLimit} = require('./_fit-order.mjs');
/** @type {typeof import('./_adapter.mjs')} */
const {loadSearchData} = require('./_adapter.mjs');
/** @type {typeof import('./_result.mjs')} */
const {searchedComponents, searchedComponentsOf} = require('./_result.mjs');

const weights = /** @type {any} */ (loadSearchData().picker);

const QUERY = 'drop zone to upload files';

/** Made-up entries; none of them is in Astryx. */
const CATALOG = [
  {domain: 'component', name: 'Beacon', description: 'A page title row.'},
  {
    domain: 'component',
    name: 'Pebble',
    description: 'A small round marker that shows a count.',
  },
  {
    domain: 'component',
    name: 'Quill',
    description: 'A text field for a short note.',
  },
  {
    domain: 'component',
    name: 'Marrow',
    description: 'A banner that tells people about upload limits.',
  },
  {
    domain: 'component',
    name: 'Thistle',
    description: 'A list of rows with files and folders.',
  },
  {
    domain: 'component',
    name: 'LanternCrate',
    description: 'A drop zone where people drag files to upload them.',
  },
  {
    domain: 'component',
    name: 'UploadZoneHint',
    description: 'A grey line of help text.',
  },
];

/**
 * @param {string} name
 * @param {number} score
 * @param {string} [domain]
 */
const result = (name, score, domain = 'component') => ({domain, name, score});

/** @param {any[]} results */
const names = results => results.map(r => r.name);

describe('orderByFit', () => {
  it('lifts a new entry known only from its own docs when it fits', () => {
    expect(weights.known).not.toContain('LanternCrate');
    const results = [
      result('Beacon', 160),
      result('Pebble', 120),
      result('Quill', 120),
      result('Marrow', 120),
      result('Thistle', 120),
      result('LanternCrate', 120),
    ];
    const out = orderByFit(results, CATALOG, QUERY, weights);
    expect(names(out)).toEqual([
      'Beacon',
      'Thistle',
      'LanternCrate',
      'Pebble',
      'Quill',
      'Marrow',
    ]);
    expect(new Set(out)).toEqual(new Set(results));
  });

  it('scores an entry with no catalog item from the result itself', () => {
    const results = [
      result('Beacon', 160),
      result('Pebble', 120),
      result('Quill', 120),
      result('Marrow', 120),
      result('Thistle', 120),
      {
        ...result('Driftbox', 120),
        description: 'A drop zone where people drag files to upload them.',
      },
    ];
    const out = orderByFit(results, CATALOG, QUERY, weights);
    expect(names(out).slice(0, 3)).toEqual(['Beacon', 'Thistle', 'Driftbox']);
  });

  it('never moves an entry past one of another band or kind', () => {
    const results = [
      result('Beacon', 160),
      result('Pebble', 120),
      result('Quill', 120),
      result('Marrow', 120),
      result('Thistle', 60),
      result('LanternCrate', 60),
      result('Quill', 120, 'doc'),
    ];
    const out = orderByFit(results, CATALOG, QUERY, weights);
    expect(out.map(r => `${r.score}:${r.domain}`)).toEqual(
      results.map(r => `${r.score}:${r.domain}`),
    );
    expect(out[0]).toBe(results[0]);
  });

  it('keeps an entry whose name spells two query words', () => {
    const results = [
      result('Beacon', 160),
      result('UploadZoneHint', 120),
      result('Pebble', 120),
      result('Quill', 120),
      result('Thistle', 120),
      result('LanternCrate', 120),
    ];
    const out = orderByFit(results, CATALOG, QUERY, weights);
    expect(names(out).slice(0, 2)).toEqual(['Beacon', 'UploadZoneHint']);
  });

  it('keeps the order when the median fit is not above zero', () => {
    const results = [
      result('Beacon', 160),
      result('Pebble', 120),
      result('Quill', 120),
      result('Thistle', 120),
    ];
    expect(orderByFit(results, CATALOG, 'qzxv blorf', weights)).toBe(results);
  });

  it('keeps an answer of fewer than three results, and works without weights', () => {
    const two = [result('Beacon', 160), result('LanternCrate', 120)];
    expect(orderByFit(two, CATALOG, QUERY, weights)).toBe(two);
    const many = [
      result('Beacon', 160),
      result('Pebble', 120),
      result('LanternCrate', 120),
    ];
    expect(orderByFit(many, CATALOG, QUERY, null)).toBe(many);
  });

  it('orders only the first ten places', () => {
    const results = [
      result('Beacon', 160),
      ...Array.from({length: 9}, (_, k) => ({
        ...result(`Pebble${k}`, 120),
        description: 'A small round marker that shows a count.',
      })),
      result('LanternCrate', 120),
    ];
    const out = orderByFit(results, CATALOG, QUERY, weights);
    expect(out).toEqual(results);
  });
});

describe('withFitOrder and withLimit', () => {
  it('keep the response shape and the components it was scored against', () => {
    const response = {
      type: 'search',
      data: {
        query: QUERY,
        matchCount: 6,
        results: [
          result('Beacon', 160),
          result('Pebble', 120),
          result('Quill', 120),
          result('Marrow', 120),
          result('Thistle', 120),
          result('LanternCrate', 120),
        ],
      },
    };
    const searched = [{name: 'Beacon', keywords: []}];
    searchedComponentsOf.set(response, searched);
    const ordered = withFitOrder(response, CATALOG, QUERY, weights);
    expect(Object.keys(ordered.data)).toEqual(Object.keys(response.data));
    expect(ordered.data.matchCount).toBe(6);
    expect(searchedComponents(ordered)).toBe(searched);
    const cut = withLimit(ordered, 2);
    expect(names(cut.data.results)).toEqual(['Beacon', 'Thistle']);
    expect(searchedComponents(cut)).toBe(searched);
  });
});
