// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Compound names: adjacent query words read as one joined word
 * (`icon button` is IconButton), the score each kind of hit earns, and which
 * candidates can earn it.
 */

import {describe, expect, it} from 'vitest';
import {MAX_RUN_WORDS, compoundHit} from './_compound.mjs';

/**
 * @param {string} name
 * @param {Record<string, unknown>} [extra]
 */
const component = (name, extra = {}) =>
  /** @type {any} */ ({domain: 'component', name, ...extra});

describe('compoundHit: whole-name hits', () => {
  it('scores 100 when the words join to a component name', () => {
    const hit = compoundHit(['icon', 'button'], component('IconButton'));
    expect(hit?.score).toBe(100);
    expect(hit?.reason).toBe('name IconButton spelled');
  });

  it('scores 100 when the last word is a plural of the name', () => {
    expect(
      compoundHit(['table', 'header', 'cells'], component('TableHeaderCell'))
        ?.score,
    ).toBe(100);
  });

  it('scores 100 for a hook named without its use prefix', () => {
    const hook = component('useTableStickyColumns', {domain: 'hook'});
    expect(compoundHit(['table', 'sticky', 'columns'], hook)?.score).toBe(100);
  });

  it('scores 100 for a template name', () => {
    const template = {domain: 'template', name: 'PricingPage'};
    expect(
      compoundHit(['pricing', 'page'], /** @type {any} */ (template)),
    ).toMatchObject({score: 100});
  });

  it('reads an alias as a name', () => {
    const hit = compoundHit(
      ['icon', 'btn'],
      component('Button', {aliases: ['IconBtn']}),
    );
    expect(hit?.score).toBe(100);
    expect(hit?.reason).toBe('name IconBtn spelled');
  });

  it('does not mark a whole-name hit as an alias', () => {
    const hit = compoundHit(['icon', 'button'], component('IconButton'));
    expect(hit).not.toHaveProperty('alias');
    expect(hit).not.toHaveProperty('aliasWords');
  });
});

describe('compoundHit: keyword hits', () => {
  it('scores 90 when the words join to a one-word keyword', () => {
    const hit = compoundHit(
      ['number', 'field'],
      component('Input', {keywords: ['numberfield']}),
    );
    expect(hit).toMatchObject({
      score: 90,
      reason: 'keyword "number field" spelled',
      alias: 'keyword',
      aliasWords: 2,
    });
  });

  it('ignores a capitalized keyword: it names another entry', () => {
    expect(
      compoundHit(
        ['number', 'field'],
        component('Input', {keywords: ['NumberField']}),
      ),
    ).toBeNull();
  });

  it('ignores a keyword of several words: it is a phrase', () => {
    expect(
      compoundHit(
        ['number', 'field'],
        component('Input', {keywords: ['number field']}),
      ),
    ).toBeNull();
  });
});

describe('compoundHit: part-of-a-name hits', () => {
  it('scores 95 for most of a name, cut short', () => {
    const hit = compoundHit(
      ['dropdown', 'menu', 'radio'],
      component('DropdownMenuRadioItem'),
    );
    expect(hit).toMatchObject({score: 95, alias: 'partial', aliasWords: 3});
  });

  it("scores 92 for a name's leading words covering half of it", () => {
    const hit = compoundHit(
      ['top', 'nav', 'mega'],
      component('TopNavMegaMenu'),
    );
    expect(hit).toMatchObject({
      score: 92,
      reason: 'name TopNavMegaMenu starts "top nav mega"',
      alias: 'partial',
    });
  });

  it('scores 70 for adjacent words inside a name', () => {
    const hit = compoundHit(['header', 'cell'], component('TableHeaderCell'));
    expect(hit).toMatchObject({
      score: 70,
      reason: 'name TableHeaderCell holds "header cell"',
      alias: 'partial',
      aliasWords: 2,
    });
  });

  it('ranks the kinds 100, 95, 92, 90, then 70', () => {
    const score = (/** @type {string[]} */ ws, /** @type {any} */ c) =>
      compoundHit(ws, c)?.score;
    const scores = [
      score(['icon', 'button'], component('IconButton')),
      score(['dropdown', 'menu', 'radio'], component('DropdownMenuRadioItem')),
      score(['top', 'nav', 'mega'], component('TopNavMegaMenu')),
      score(
        ['number', 'field'],
        component('Input', {keywords: ['numberfield']}),
      ),
      score(['header', 'cell'], component('TableHeaderCell')),
    ];
    expect(scores).toEqual([100, 95, 92, 90, 70]);
  });

  it('is for components and hooks only: a template name names a component', () => {
    const template = /** @type {any} */ ({
      domain: 'template',
      name: 'ProgressBarShowcase',
    });
    expect(compoundHit(['progress', 'bar'], template)).toBeNull();
  });

  it('needs the words to cover at least half of the name', () => {
    expect(compoundHit(['table'], component('TableHeaderCell'))).toBeNull();
    expect(
      compoundHit(['table', 'header'], component('TableHeaderCellGroupRow')),
    ).toBeNull();
  });
});

describe('compoundHit: no hit', () => {
  it('is null for a doc, whose name is a route or key', () => {
    expect(
      compoundHit(
        ['icon', 'button'],
        /** @type {any} */ ({domain: 'doc', name: 'IconButton'}),
      ),
    ).toBeNull();
  });

  it('is null for fewer than two words', () => {
    expect(compoundHit(['icon'], component('IconButton'))).toBeNull();
    expect(compoundHit([], component('IconButton'))).toBeNull();
  });

  it('is null when no run of words joins to anything', () => {
    expect(compoundHit(['foo', 'bar'], component('IconButton'))).toBeNull();
  });
});

describe('compoundHit: covered words', () => {
  it('holds each word of the run and every stretch of them joined', () => {
    const hit = compoundHit(['icon', 'button'], component('IconButton'));
    expect([...(hit?.covered ?? [])].sort()).toEqual([
      'button',
      'icon',
      'iconbutton',
    ]);
  });

  it('holds every joined stretch of a longer run', () => {
    const hit = compoundHit(
      ['table', 'header', 'cells'],
      component('TableHeaderCell'),
    );
    expect(hit?.covered).toEqual(
      new Set([
        'table',
        'header',
        'cells',
        'tableheader',
        'headercells',
        'tableheadercells',
      ]),
    );
  });
});

describe('compoundHit: the longest run', () => {
  it('reads runs of up to six words', () => {
    expect(MAX_RUN_WORDS).toBe(6);
    const six = compoundHit(
      ['a1', 'b1', 'c1', 'd1', 'e1', 'f1'],
      component('A1B1C1D1E1F1'),
    );
    expect(six?.score).toBe(100);
  });

  it('reads a longer query as a sentence: a seven-word name is not spelled', () => {
    const seven = compoundHit(
      ['a1', 'b1', 'c1', 'd1', 'e1', 'f1', 'g1'],
      component('A1B1C1D1E1F1G1'),
    );
    // Only a six-word run is read, so the name is matched as cut short.
    expect(seven?.score).toBe(95);
    expect(seven).toMatchObject({alias: 'partial', aliasWords: 6});
  });
});
