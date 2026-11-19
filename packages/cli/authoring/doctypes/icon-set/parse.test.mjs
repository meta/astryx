// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The icon-set descriptor and data-file parsers (AST-084 FR2, FR3).
 */

import {describe, it, expect} from 'vitest';
import {parseIconSet, parseIconSetData} from './parse.mjs';
import {parseDoc} from '../parse.mjs';
import {glyphsData} from '../../../test-utils/icon-set-fixture.mjs';

const DOC = {
  type: 'icon-set',
  name: 'outline',
  displayName: 'Acme Outline',
  description: 'Outline icons.',
  maintained: true,
  license: 'MIT',
};

/** @param {(data: any) => void} change */
function dataWith(change) {
  const data = /** @type {any} */ (glyphsData());
  change(data);
  return data;
}

describe('parseIconSet', () => {
  it('accepts a complete descriptor, also through parseDoc', () => {
    expect(parseIconSet(DOC)).toEqual(DOC);
    expect(parseDoc(DOC)).toEqual(DOC);
  });

  it('rejects an unknown field, a missing license, and a non-kebab name', () => {
    expect(() => parseIconSet({...DOC, icons: []})).toThrow(/Unrecognized key/);
    const {license: _license, ...noLicense} = DOC;
    expect(() => parseIconSet(noLicense)).toThrow(/license/);
    expect(() => parseIconSet({...DOC, name: 'Outline'})).toThrow(/kebab/);
  });
});

describe('parseIconSetData', () => {
  it('accepts the fixture data file', () => {
    expect(parseIconSetData(glyphsData()).icons).toHaveLength(4);
    // One icon may draw several definitions.
    const data = /** @type {any} */ (glyphsData());
    data.map = {...data.map, delete: 'trash', remove: 'trash'};
    expect(parseIconSetData(data).map).toMatchObject({
      delete: 'trash',
      remove: 'trash',
    });
  });

  it.each([
    ['schemaVersion 2', d => (d.schemaVersion = 2), /schemaVersion/],
    ['an unknown field', d => (d.extra = true), /Unrecognized key/],
    ['a relative module', d => (d.module = './icons'), /module/],
    ['a duplicate id', d => (d.icons[1].id = 'x'), /duplicate id "x"/],
    [
      'an icon with no words',
      d => (d.icons[0].words = []),
      /at least one word/,
    ],
    ['an upper-case word', d => (d.icons[0].words = ['Close']), /lower-case/],
    [
      'a map key that is not a definition name',
      d => (d.map['big-house'] = 'home'),
      /"big-house" is not an icon definition name/,
    ],
    [
      'a map value that is not an icon id',
      d => (d.map.delete = 'bin'),
      /"bin" is not the id of an icon in this file/,
    ],
    [
      'icons that still carry fills',
      d => (d.icons[0].fills = ['close']),
      /Unrecognized key/,
    ],
    [
      'an undeclared variant',
      d => (d.icons[2].variants[0].variant = 'duotone'),
      /"duotone" is not in variants/,
    ],
    [
      'a variant entry that names no variant',
      d => (d.icons[2].variants = [{export: 'TrashAltIcon'}]),
      /variant/,
    ],
    [
      'a variant entry for the default variant',
      d => (d.icons[2].variants[0].variant = 'outline'),
      /"outline" is the default/,
    ],
    [
      'two exports for one variant',
      d =>
        d.icons[2].variants.push({variant: 'solid', export: 'TrashFillIcon'}),
      /"solid" is listed twice/,
    ],
    [
      'a variant declared twice',
      d => (d.variants = ['outline', 'solid', 'solid']),
      /"solid" is listed twice/,
    ],
    [
      'a variant name that is not kebab-case',
      d => (d.variants = ['outline', 'Solid']),
      /kebab-case/,
    ],
    [
      'an undeclared default',
      d => (d.default.variant = 'duotone'),
      /"duotone" is not in variants/,
    ],
    ['a size axis', d => (d.sizes = [24]), /Unrecognized key/],
    ['the retired axes field', d => (d.axes = {}), /Unrecognized key/],
    [
      'a match with an unknown confidence',
      d =>
        (d.icons[0].matches = [
          {set: 'other-set', export: 'XMarkIcon', confidence: 'maybe'},
        ]),
      /confidence/,
    ],
    [
      'a match listed twice',
      d =>
        (d.icons[0].matches = [
          {set: 'other-set', export: 'X', confidence: 'exact'},
          {set: 'other-set', export: 'X', confidence: 'likely'},
        ]),
      /listed twice/,
    ],
    [
      'a match with an unknown field',
      d =>
        (d.icons[0].matches = [
          {set: 'other-set', export: 'X', confidence: 'exact', note: 'x'},
        ]),
      /Unrecognized key/,
    ],
  ])('rejects %s', (_label, change, message) => {
    expect(() => parseIconSetData(dataWith(change))).toThrow(message);
  });

  it('accepts reviewed matches with and without a variant', () => {
    const data = dataWith(d => {
      d.icons[0].matches = [
        {
          set: 'other-set',
          export: 'XMarkIcon',
          variant: 'outline',
          confidence: 'exact',
        },
        {set: 'other-set', export: 'X', confidence: 'likely'},
      ];
    });
    expect(parseIconSetData(data).icons[0].matches).toHaveLength(2);
  });

  it('accepts the declared variants and a default among them', () => {
    const data = parseIconSetData(glyphsData());
    expect(data.variants).toEqual(['outline', 'solid']);
    expect(data.default).toEqual({variant: 'outline'});
    expect(data.icons[2].variants).toEqual([
      {variant: 'solid', export: 'TrashSolidIcon'},
    ]);
  });

  it('accepts a set with one look: no variants and no default', () => {
    const data = dataWith(d => {
      delete d.variants;
      delete d.default;
      delete d.icons[2].variants;
    });
    expect(parseIconSetData(data).variants).toBeUndefined();
  });
});
