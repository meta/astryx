// Copyright (c) Meta Platforms, Inc. and affiliates.
import {describe, expect, it} from 'vitest';
import {templateList} from './list.mjs';

const t = (type, dirName, pkg) => ({
  type,
  dirName,
  name: dirName,
  description: dirName,
  ...(pkg ? {package: pkg} : {}),
});

const templates = [
  t('page', 'dashboard'),
  t('block', 'hero'),
  t('block', 'promo', '@acme/blocks'),
];

describe('templateList filters', () => {
  it('returns an empty list for a valid filter that matches nothing', () => {
    // @acme/blocks ships only blocks, so asking it for pages is a valid
    // filter with no match: an empty list, not an error.
    const response = templateList(templates, {
      type: 'page',
      package: '@acme/blocks',
    });
    expect(response.type).toBe('template.list');
    expect(response.data).toEqual([]);
  });

  it('refuses a type outside page or block', () => {
    expect(() => templateList(templates, {type: 'bogus'})).toThrow(
      /Unknown template type "bogus"/,
    );
  });

  it('refuses a package that provides no templates', () => {
    expect(() => templateList(templates, {package: '@nope/x'})).toThrow(
      /No templates found in package "@nope\/x"/,
    );
  });

  it('keeps a matching type and package filter', () => {
    const response = templateList(templates, {
      type: 'block',
      package: '@acme/blocks',
    });
    expect(response.data.map(item => item.id ?? item.dirName)).toEqual([
      'promo',
    ]);
  });
});
