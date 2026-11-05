// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {kitAnswer} from './answer.mjs';

/**
 * @param {any[]} blocks
 * @param {any[]} [searched] blocks search returned that build did not name
 */
const signals = (blocks, searched = []) =>
  /** @type {any} */ ({
    query: 'q',
    matchCount: blocks.length,
    directMatch: false,
    start: null,
    pages: [],
    blocks,
    kitBlocks: blocks.map(b => b.name),
    domain: [],
    searchedEntries: new Map(searched.map(b => [b.name, b])),
  });

describe('kitAnswer', () => {
  const a = {name: 'Hero', package: '@a/one', score: 90, reason: 'name'};
  const b = {name: 'Hero', package: '@b/two', score: 80, reason: 'name'};
  const c = {name: 'Footer', package: '@a/one', score: 70, reason: 'keyword'};

  it('keeps blocks of the same name from two packages', () => {
    const kit = kitAnswer(signals([a, b, c]));
    expect(kit.data.blocks).toEqual([a, b, c]);
  });

  it('keeps both when the picker re-orders them', () => {
    const kit = kitAnswer(signals([a, b, c]), ['Footer', 'Hero', 'Hero']);
    expect(kit.data.blocks).toEqual([c, a, b]);
  });

  it('never lists a block neither build nor search gave, or more than build gave', () => {
    const kit = kitAnswer(signals([a, c]), ['Hero', 'Hero', 'Nav', 'Footer']);
    expect(kit.data.blocks).toEqual([a, c]);
  });

  it('lists a block search returned with search’s own entry, within build’s count', () => {
    const nav = {name: 'Nav', package: '@a/one', score: 60, reason: 'keyword'};
    const kit = kitAnswer(signals([a, c], [nav]), [
      'Nav',
      'Nav',
      'Hero',
      'Footer',
    ]);
    expect(kit.data.blocks).toEqual([nav, a]);
  });

  it('trims an added block’s description so the answer is never longer than build’s own', () => {
    const hero = {
      ...a,
      description: 'A wide hero with a title and two buttons.',
    };
    const foot = {...c, description: 'A footer with links in three columns.'};
    const nav = {
      name: 'Nav',
      package: '@a/one',
      score: 60,
      reason: 'keyword',
      description: 'word '.repeat(200).trim(),
    };
    const own = kitAnswer(signals([hero, foot]));
    const kit = kitAnswer(signals([hero, foot], [nav]), ['Nav', 'Hero']);
    expect(kit.data.blocks.map(b => b.name)).toEqual(['Nav', 'Hero']);
    expect(kit.data.blocks[1]).toEqual(hero);
    expect(Buffer.byteLength(JSON.stringify(kit))).toBeLessThanOrEqual(
      Buffer.byteLength(JSON.stringify(own)),
    );
    expect(kit.data.blocks[0].description).toMatch(/…$/);
  });
  it('trims an added block’s first sentence so the text answer is never longer either', () => {
    const long = ' More words follow here. '.repeat(20);
    const hero = {...a, description: `A hero.${long}`};
    const foot = {...c, description: `A footer.${long}`};
    const nav = {
      name: 'Nav',
      package: '@a/one',
      score: 60,
      reason: 'keyword',
      description:
        'A navigation bar with a logo, five links, a search box and a menu.',
    };
    const kit = kitAnswer(signals([hero, foot], [nav]), ['Nav', 'Hero']);
    const d = kit.data.blocks[0].description;
    expect(d).toMatch(/…$/);
    expect(d.length).toBeLessThan(nav.description.length);
    expect(nav.description.startsWith(d.slice(0, -1))).toBe(true);
    expect(kit.data.blocks[1]).toEqual(hero);
  });
  it('never empties an added block’s description', () => {
    const nav = {
      name: 'Nav',
      package: '@a/one',
      score: 60,
      reason: 'keyword',
      description:
        'A navigation bar with a logo, five links, a search box and a menu.',
    };
    const kit = kitAnswer(signals([a, c], [nav]), ['Nav', 'Hero']);
    expect(kit.data.blocks[0].name).toBe('Nav');
    expect(kit.data.blocks[0].description.length).toBeGreaterThan(0);
  });
});
