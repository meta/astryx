// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  nameWords,
  orderByAffinity,
  orderRouteSuggestions,
  rankComponentSuggestions,
  synonymMatches,
} from './suggest-order.mjs';

describe('nameWords', () => {
  it('reads every spelling of a name as the same words', () => {
    expect(nameWords('DropdownMenuItems')).toEqual([
      'dropdown',
      'menu',
      'item',
    ]);
    expect(nameWords('dropdown-menu-item')).toEqual([
      'dropdown',
      'menu',
      'item',
    ]);
    expect(nameWords('Dropdown Menu Item')).toEqual([
      'dropdown',
      'menu',
      'item',
    ]);
    expect(nameWords('cli/api_HTMLParser')).toEqual([
      'cli',
      'api',
      'html',
      'parser',
    ]);
  });

  it('keeps short words and double-s endings', () => {
    expect(nameWords('Gas')).toEqual(['gas']);
    expect(nameWords('Glass')).toEqual(['glass']);
  });
});

describe('orderByAffinity', () => {
  const names = (/** @type {string[]} */ list, /** @type {string} */ typed) =>
    orderByAffinity(typed, list, n => [n]);

  it('puts the same words first, then every typed word, then some', () => {
    expect(
      names(
        ['zeta-panel', 'wide-panel-grid', 'panel-grid', 'grid-panel-x'],
        'PanelGrid',
      ),
    ).toEqual(['panel-grid', 'wide-panel-grid', 'grid-panel-x', 'zeta-panel']);
  });

  it('matches a title as well as an id', () => {
    const items = [
      {id: 'alpha', title: 'Something Else'},
      {id: 'beta', title: 'Wave Editor'},
    ];
    expect(
      orderByAffinity('Wave Editor', items, i => [i.id, i.title]).map(
        i => i.id,
      ),
    ).toEqual(['beta', 'alpha']);
  });

  it('keeps the original order between equal matches and never changes the list', () => {
    const list = ['c', 'b', 'a', 'route/b-thing', 'route/a-thing'];
    const out = names(list, 'thing');
    expect(out).toEqual(['route/b-thing', 'route/a-thing', 'c', 'b', 'a']);
    expect([...out].sort()).toEqual([...list].sort());
  });

  it('ranks a route by its words', () => {
    expect(
      names(
        ['basics/basics-color', 'basics/basics-size', 'basics/basics-usage'],
        'basics/usage',
      ),
    ).toEqual([
      'basics/basics-usage',
      'basics/basics-color',
      'basics/basics-size',
    ]);
  });
});

describe('orderByAffinity with closest', () => {
  const closest = (/** @type {string[]} */ list, /** @type {string} */ typed) =>
    orderByAffinity(typed, list, n => [n], {closest: true});

  it('keeps the items with every typed word after the same words, and drops the weaker ones', () => {
    expect(
      closest(
        [
          'zeta-panel',
          'other',
          'wide-panel-grid',
          'panel-grid',
          'grid-panel-x',
        ],
        'PanelGrid',
      ),
    ).toEqual(['panel-grid', 'wide-panel-grid', 'grid-panel-x']);
  });

  it('keeps every item with a typed word when the best has only some of them', () => {
    expect(closest(['table', 'card-grid', 'list-view'], 'card list')).toEqual([
      'card-grid',
      'list-view',
    ]);
  });

  it('does not count one-letter words', () => {
    const list = ['use-a-theme', 'author-a-theme', 'card', 'table'];
    expect(closest(list, 'a11y')).toEqual(list);
    expect(closest(list, 'make-a-card')).toEqual(['card']);
  });

  it('keeps the whole list, in its order, when no item has a typed word', () => {
    expect(closest(['c', 'b', 'a'], 'thing')).toEqual(['c', 'b', 'a']);
  });

  it('only ever shortens the list', () => {
    const list = ['alpha-beta', 'beta', 'gamma', 'alpha'];
    const out = closest(list, 'alpha beta');
    expect(out.every(n => list.includes(n))).toBe(true);
    expect(out.length).toBeLessThanOrEqual(list.length);
  });
});

describe('rankComponentSuggestions', () => {
  const all = [
    'Zebra',
    'Picker',
    'MultiPicker',
    'PickerOption',
    'Gadget',
    'SideRailItem',
    'Sheet',
  ];

  it('breaks a tie by where the typed name sits in the keywords', () => {
    const results = [
      {name: 'MultiPicker', score: 90, reason: 'keyword', keywordAt: 3},
      {name: 'Picker', score: 90, reason: 'keyword', keywordAt: 0},
      {name: 'Gadget', score: 90, reason: 'keyword', keywordAt: 5},
    ];
    expect(
      rankComponentSuggestions('Pick', results, all).map(r => r.name),
    ).toEqual(['Picker', 'MultiPicker', 'Gadget']);
  });

  it('breaks a remaining tie by edit distance, not by the alphabet', () => {
    const results = [
      {name: 'Gadget', score: 70, reason: 'keyword'},
      {name: 'Sheet', score: 70, reason: 'keyword'},
    ];
    expect(
      rankComponentSuggestions('Sheets', results, all).map(r => r.name),
    ).toEqual(['Sheet', 'Gadget']);
  });

  it('finds the family part named with other words', () => {
    const results = [{name: 'Picker', score: 70, reason: 'keyword'}];
    expect(rankComponentSuggestions('PickerItem', results, all)[0].name).toBe(
      'PickerOption',
    );
  });

  it('finds the part named without its first word', () => {
    expect(rankComponentSuggestions('RailItem', [], all)[0].name).toBe(
      'SideRailItem',
    );
  });

  it('finds the family of a part that is not its own component', () => {
    expect(rankComponentSuggestions('SheetFooter', [], all)[0].name).toBe(
      'Sheet',
    );
  });

  it('puts a name with exactly the typed words first, ahead of every rule', () => {
    const results = [{name: 'Picker', score: 80, reason: 'similar name'}];
    const ranked = rankComponentSuggestions(
      'pickers',
      results,
      all,
      new Set(['Gadget']),
    );
    expect(ranked[0].name).toBe('Picker');
    expect(rankComponentSuggestions('side-rail-item', [], all)[0].name).toBe(
      'SideRailItem',
    );
  });

  it('names a family only for a structural part', () => {
    expect(
      rankComponentSuggestions('SheetMusic', [], all).map(r => r.name),
    ).not.toContain('Sheet');
  });

  it('does not let a lifted entry borrow a weaker keyword position', () => {
    const results = [
      {name: 'Picker', score: 90, reason: 'keyword', keywordAt: 2},
      {name: 'MultiPicker', score: 70, reason: 'keyword', keywordAt: 0},
    ];
    const ranked = rankComponentSuggestions(
      'Pick',
      results,
      all,
      new Set(['Picker', 'MultiPicker']),
    );
    expect(ranked.map(r => r.name).slice(0, 2)).toEqual([
      'Picker',
      'MultiPicker',
    ]);
  });

  it('never lowers a score search gave', () => {
    const results = [{name: 'Picker', score: 100, reason: 'exact name'}];
    const ranked = rankComponentSuggestions('PickerItem', results, all);
    expect(ranked[0]).toEqual({
      name: 'Picker',
      score: 100,
      reason: 'exact name',
    });
  });

  it('suggests only catalog names', () => {
    const ranked = rankComponentSuggestions('PickerWidgetItem', [], all);
    for (const r of ranked) expect(all).toContain(r.name);
  });
});

describe('synonymMatches', () => {
  const cards = {
    Picker: {synonyms: ['choice box', 'Acme ChoiceBox', 'MUI Choice Field']},
    Sheet: {synonyms: ['side sheet', 'choice']},
  };

  it('matches a synonym in any spelling, without a leading library name', () => {
    expect([...synonymMatches('ChoiceField', cards)]).toEqual(['Picker']);
    expect([...synonymMatches('choice-box', cards)]).toEqual(['Picker']);
    expect([...synonymMatches('SideSheets', cards)]).toEqual(['Sheet']);
    expect([...synonymMatches('MUI Choice Field', cards)]).toEqual(['Picker']);
  });

  it('needs every word to match', () => {
    expect([...synonymMatches('Side', cards)]).toEqual([]);
    expect([...synonymMatches('', cards)]).toEqual([]);
  });

  it('puts a synonym match first among equal scores, and only real names', () => {
    const all = ['Gadget', 'Picker'];
    const results = [
      {name: 'Gadget', score: 90, reason: 'keyword', keywordAt: 0},
    ];
    const ranked = rankComponentSuggestions(
      'ChoiceField',
      results,
      all,
      new Set(['Picker', 'NotInCatalog']),
    );
    expect(ranked.map(r => r.name)).toEqual(['Picker', 'Gadget']);
  });
});

describe('orderRouteSuggestions', () => {
  const kids = [
    'guide/start',
    'guide/building-blocks',
    'guide/ship',
    'guide/help',
  ].map(name => ({name}));
  const names = (/** @type {{name: string}[]} */ list) => list.map(s => s.name);

  it('keeps tree order when no child matches, at any depth', () => {
    expect(names(orderRouteSuggestions('guide/theme', kids))).toEqual(
      names(kids),
    );
    expect(names(orderRouteSuggestions('guide/theme/colors', kids))).toEqual(
      names(kids),
    );
  });

  it('puts the child the route names first', () => {
    expect(names(orderRouteSuggestions('guide/ship-it', kids))[0]).toBe(
      'guide/ship',
    );
    expect(names(orderRouteSuggestions('guide/help/extra', kids))[0]).toBe(
      'guide/help',
    );
  });

  it('with closest, keeps only the child the route names', () => {
    expect(
      names(orderRouteSuggestions('guide/ship-it', kids, {closest: true})),
    ).toEqual(['guide/ship']);
    expect(
      names(orderRouteSuggestions('guide/theme', kids, {closest: true})),
    ).toEqual(names(kids));
  });

  it('compares whole routes when the suggestions share no namespace', () => {
    const roots = [{name: 'cli'}, {name: 'guide'}, {name: 'theme'}];
    expect(names(orderRouteSuggestions('theme/quick-start', roots))[0]).toBe(
      'theme',
    );
  });
});
