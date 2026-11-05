// Copyright (c) Meta Platforms, Inc. and affiliates.

import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {
  mergeA11yShards,
  parseShard,
  shardFile,
  shardItems,
} = require('./a11y-shards.js');

const storyIds = [
  'button--a',
  'button--b',
  'card--a',
  'chat--a',
  'chat--b',
  'dialog--a',
  'list--a',
];
const violations = id =>
  id.startsWith('chat') ? [{id: 'color-contrast', nodes: [{html: id}]}] : [];

function shards(count, {storybookSha = 'abc', ids = storyIds} = {}) {
  return Array.from({length: count}, (_, offset) => {
    const shard = {index: offset + 1, count};
    return {
      file: `a11y-${shard.index}.json`,
      content: shardFile({
        storyIds: ids,
        shard,
        storybookSha,
        violationsByStory: new Map(
          shardItems(ids, shard).map(id => [id, violations(id)]),
        ),
      }),
    };
  });
}

describe('accessibility audit shards', () => {
  it('parses index/count and refuses anything else', () => {
    expect(parseShard('1/3')).toEqual({index: 1, count: 3});
    for (const bad of [null, '', '0/2', '3/2', '2/0', 'a/b']) {
      expect(() => parseShard(bad), String(bad)).toThrow(/--shard/);
    }
  });

  it('gives every story to exactly one shard', () => {
    const parts = [1, 2, 3].map(index =>
      shardItems(storyIds, {index, count: 3}),
    );
    expect(parts.flat().sort()).toEqual([...storyIds].sort());
    expect(new Set(parts.flat()).size).toBe(storyIds.length);
  });

  it('joins a complete set into every story’s violations', () => {
    const merged = mergeA11yShards(shards(3).reverse(), {
      storyIds,
      storybookSha: 'abc',
    });
    expect([...merged.keys()].sort()).toEqual([...storyIds].sort());
    for (const id of storyIds) expect(merged.get(id)).toEqual(violations(id));
  });

  it('refuses a missing or duplicated shard', () => {
    const set = shards(3);
    expect(() =>
      mergeA11yShards(set.slice(0, 2), {storyIds, storybookSha: 'abc'}),
    ).toThrow(/incomplete/);
    expect(() =>
      mergeA11yShards([set[0], set[0], set[2]], {
        storyIds,
        storybookSha: 'abc',
      }),
    ).toThrow(/twice/);
  });

  it('refuses shards of another story list or another build', () => {
    expect(() =>
      mergeA11yShards(shards(2, {ids: storyIds.slice(1)}), {
        storyIds,
        storybookSha: 'abc',
      }),
    ).toThrow(/different story list/);
    expect(() =>
      mergeA11yShards(shards(2, {storybookSha: 'zzz'}), {
        storyIds,
        storybookSha: 'abc',
      }),
    ).toThrow(/Storybook/);
  });

  it('refuses a shard missing one of its stories', () => {
    const set = shards(2);
    delete set[0].content.violationsByStory[storyIds[0]];
    expect(() => mergeA11yShards(set, {storyIds, storybookSha: 'abc'})).toThrow(
      /exactly the stories of shard 1\/2/,
    );
  });

  it('refuses an empty set', () => {
    expect(() => mergeA11yShards([], {storyIds, storybookSha: 'abc'})).toThrow(
      /No accessibility shard/,
    );
  });
});
