// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {familyMove} from './family.mjs';

const catalog = [
  {name: 'dash', category: 'Dashboard - Basic', description: '', keywords: []},
  {name: 'form', category: 'Form - Basic', description: '', keywords: []},
  {
    name: 'dash-new',
    category: 'Dashboard - New',
    description: '',
    keywords: [],
  },
];
const table = {
  version: 1,
  families: ['Dashboard', 'Form'],
  bias: [0, 0],
  state: [0, 0],
  words: ['field', 'form'],
  rows: [
    [0, 2],
    [0, 2],
  ],
  coef: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0],
  at: 0.5,
  bar: 2,
  keep: 1,
};
/** @param {object} over */
const move = over =>
  familyMove({
    idea: 'a form with fields',
    start: 'dash',
    direct: null,
    proposed: 'dash',
    blend: {cands: ['dash', 'form', 'dash-new'], scores: [0.5, 0.2, 0]},
    order: ['dash', 'form', 'dash-new'],
    ranked: [
      {name: 'dash', family: 'Dashboard', score: 1},
      {name: 'form', family: 'Form', score: 0.5},
    ],
    catalog,
    listed: ['SHELL', 'dash', 'form'],
    table,
    ...over,
  });

describe('familyMove', () => {
  it("moves a page to the family its words name, at that family's best template", () => {
    expect(move({})).toBe('form');
  });

  it('keeps a start the blend clearly prefers', () => {
    expect(
      move({
        blend: {cands: ['dash', 'form', 'dash-new'], scores: [1.5, 0.2, 0]},
      }),
    ).toBeNull();
  });

  it('keeps a start whose words give no family enough weight', () => {
    expect(move({idea: 'a page about sales'})).toBeNull();
  });

  it('keeps a start the word tables do not list', () => {
    expect(move({start: 'dash-new', proposed: 'dash-new'})).toBeNull();
  });

  it('never moves from a family the table does not list', () => {
    const other = [
      ...catalog,
      {name: 'chat', category: 'Chat - Basic', description: '', keywords: []},
    ];
    expect(
      move({start: 'chat', catalog: other, listed: ['chat', 'form']}),
    ).toBeNull();
  });
});
