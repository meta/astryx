// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A docs side read field by field (`termsOfFields`, `docSideOfFields`):
 * no word pair spans two fields, so a sentence of unknown words added at the
 * end of a description leaves the side unchanged. Made-up entries only.
 */

import {describe, it, expect} from 'vitest';
import {requireNatively} from '../../../test-utils/native-require.mjs';

const require = requireNatively(import.meta.url);
/** @type {typeof import('./blocks.mjs')} */
const {termsOfFields, termsOf, docSideOfFields} = require('./blocks.mjs');
/** @type {typeof import('../../search/_adapter.mjs')} */
const {loadSearchData} = require('../../search/_adapter.mjs');

const weights = /** @type {any} */ (loadSearchData().picker);

/** @param {string[]} fields */
const sideOf = fields => {
  const {vector, projected} = docSideOfFields(fields, weights);
  return {
    vector: [...vector].sort((a, b) => a[0] - b[0]),
    projected: [...projected],
  };
};

const fields = () => [
  'lantern crate',
  'Lantern crate',
  'A drop zone where people drag files to upload them',
  'dropzone',
  'file picker',
];

describe('docs side read field by field', () => {
  it('makes no word pair across two fields', () => {
    const terms = termsOfFields(['drag files', 'upload zone']);
    expect(terms).toContain('drag_file');
    expect(terms).toContain('upload_zone');
    expect(terms).not.toContain('file_upload');
  });

  it('reads one field as termsOf does', () => {
    expect(termsOfFields(['drag files here'])).toEqual(
      termsOf('drag files here'),
    );
  });

  it('a sentence of unknown words after the description changes nothing', () => {
    const grown = fields();
    grown[2] += ' zqvorbl zqmendix zqtarpho zqlinvue.';
    expect(sideOf(grown)).toEqual(sideOf(fields()));
  });

  it('a known word the description did not hold still counts', () => {
    const grown = fields();
    grown[2] += ' It shows a progress bar.';
    expect(sideOf(grown)).not.toEqual(sideOf(fields()));
  });
});
