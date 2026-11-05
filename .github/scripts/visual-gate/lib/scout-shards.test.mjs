// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';

import {
  mergeScoutShards,
  parseShard,
  shardFile,
  shardStoryIds,
} from './scout-shards.mjs';

const storyIds = [
  'a--one',
  'a--two',
  'b--one',
  'c--one',
  'c--two',
  'd--one',
  'e--one',
];
const observe = id => ({[`target-${id}`]: [id]});

function shards(count, {storybookSha = 'abc', ids = storyIds} = {}) {
  return Array.from({length: count}, (_, offset) => {
    const shard = {index: offset + 1, count};
    const mine = shardStoryIds(ids, shard);
    return {
      file: `observations-${shard.index}.json`,
      content: shardFile({
        storyIds: ids,
        shard,
        storybookSha,
        observations: Object.fromEntries(mine.map(id => [id, observe(id)])),
      }),
    };
  });
}

describe('scout shards', () => {
  it('parses index/count and refuses anything else', () => {
    expect(parseShard('2/3')).toEqual({index: 2, count: 3});
    for (const bad of [null, '', '0/3', '4/3', '1/0', 'x/3', '1']) {
      expect(() => parseShard(bad), String(bad)).toThrow(/--shard/);
    }
  });

  it('gives every story to exactly one shard', () => {
    const parts = [1, 2, 3].map(index =>
      shardStoryIds(storyIds, {index, count: 3}),
    );
    expect(parts.flat().sort()).toEqual([...storyIds].sort());
    expect(new Set(parts.flat()).size).toBe(storyIds.length);
  });

  it('joins a complete set into the single-scout result, in plan order', () => {
    const merged = mergeScoutShards(shards(3).reverse(), {
      storyIds,
      storybookSha: 'abc',
    });
    expect(Object.keys(merged)).toEqual(storyIds);
    expect(merged).toEqual(
      Object.fromEntries(storyIds.map(id => [id, observe(id)])),
    );
  });

  it('refuses a missing shard', () => {
    expect(() =>
      mergeScoutShards(shards(3).slice(1), {storyIds, storybookSha: 'abc'}),
    ).toThrow(/incomplete/);
  });

  it('refuses a duplicated shard', () => {
    const set = shards(3);
    expect(() =>
      mergeScoutShards([set[0], set[0], set[1]], {
        storyIds,
        storybookSha: 'abc',
      }),
    ).toThrow(/twice/);
  });

  it('refuses shards of another story list or another build', () => {
    expect(() =>
      mergeScoutShards(shards(2, {ids: storyIds.slice(1)}), {
        storyIds,
        storybookSha: 'abc',
      }),
    ).toThrow(/different story list/);
    expect(() =>
      mergeScoutShards(shards(2, {storybookSha: 'other'}), {
        storyIds,
        storybookSha: 'abc',
      }),
    ).toThrow(/Storybook/);
  });

  it('refuses a shard holding the wrong stories', () => {
    const set = shards(2);
    delete set[1].content.observations[storyIds[1]];
    expect(() =>
      mergeScoutShards(set, {storyIds, storybookSha: 'abc'}),
    ).toThrow(/exactly the stories of shard 2\/2/);
  });

  it('refuses an empty set', () => {
    expect(() => mergeScoutShards([], {storyIds, storybookSha: 'abc'})).toThrow(
      /No scout shard/,
    );
  });
});
