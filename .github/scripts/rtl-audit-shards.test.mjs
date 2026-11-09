// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  mergeRtlShards,
  parseShard,
  shardFile,
  shardPositions,
} from '../../apps/storybook/rtl-audit/rtl-audit-shards.mjs';

const plan = {
  d1: ['Button::core-button--a', 'Card::core-card--a', 'Chat::core-chat--a'],
  stories: [
    'Button::core-button--a',
    'Button::core-button--b',
    'Card::core-card--a',
    'Chat::core-chat--a',
    'Chat::core-chat--b',
  ],
  curated: ['Carousel::core-carousel--a', 'Slider::core-slider--a'],
};
const card = (part, position) => ({part, position});
const contract = {ok: true};

function shards(count, {storybookSha = 'abc', withPlan = plan} = {}) {
  return Array.from({length: count}, (_, offset) => {
    const shard = {index: offset + 1, count};
    const cards = Object.fromEntries(
      ['d1', 'stories', 'curated'].map(part => [
        part,
        new Map(
          shardPositions(withPlan[part].length, shard).map(position => [
            position,
            card(part, position),
          ]),
        ),
      ]),
    );
    return {
      file: `rtl-shard-${shard.index}.json`,
      content: JSON.parse(
        JSON.stringify(
          shardFile({
            plan: withPlan,
            shard,
            storybookSha,
            cards,
            d8BrowserContract: contract,
            pageRecoveries: [{storyId: `recovered-${shard.index}`}],
          }),
        ),
      ),
    };
  });
}

describe('RTL audit shards', () => {
  it('parses index/count and refuses anything else', () => {
    expect(parseShard('2/3')).toEqual({index: 2, count: 3});
    for (const bad of [null, '', '0/3', '4/3', '1/0', 'x']) {
      expect(() => parseShard(bad), String(bad)).toThrow(/--shard/);
    }
  });

  it('gives every plan position to exactly one shard', () => {
    const owned = [1, 2, 3].flatMap(index =>
      shardPositions(5, {index, count: 3}),
    );
    expect(owned.sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('joins a complete set back into plan order', () => {
    const merged = mergeRtlShards(shards(3).reverse(), {
      plan,
      storybookSha: 'abc',
    });
    for (const part of ['d1', 'stories', 'curated']) {
      expect(merged[part]).toEqual(
        plan[part].map((_, position) => card(part, position)),
      );
    }
    expect(merged.d8BrowserContract).toEqual(contract);
    expect(merged.pageRecoveries.map(entry => entry.storyId)).toEqual([
      'recovered-1',
      'recovered-2',
      'recovered-3',
    ]);
  });

  it('refuses a missing or duplicated shard', () => {
    const set = shards(3);
    expect(() =>
      mergeRtlShards(set.slice(1), {plan, storybookSha: 'abc'}),
    ).toThrow(/incomplete/);
    expect(() =>
      mergeRtlShards([set[0], set[1], set[1]], {plan, storybookSha: 'abc'}),
    ).toThrow(/twice/);
    expect(() => mergeRtlShards([], {plan, storybookSha: 'abc'})).toThrow(
      /No RTL shard files/,
    );
  });

  it('refuses shards of another plan or another build', () => {
    const otherPlan = {...plan, curated: plan.curated.slice(1)};
    expect(() =>
      mergeRtlShards(shards(2, {withPlan: otherPlan}), {
        plan,
        storybookSha: 'abc',
      }),
    ).toThrow(/different plan/);
    expect(() =>
      mergeRtlShards(shards(2, {storybookSha: 'zzz'}), {
        plan,
        storybookSha: 'abc',
      }),
    ).toThrow(/Storybook/);
  });

  it('refuses a shard missing one of its cards', () => {
    const set = shards(2);
    delete set[1].content.cards.stories['1'];
    expect(() => mergeRtlShards(set, {plan, storybookSha: 'abc'})).toThrow(
      /exactly the stories items of shard 2\/2/,
    );
  });

  it('refuses shards that disagree on the D8 self-check', () => {
    const set = shards(2);
    set[1].content.d8BrowserContract = {ok: false};
    expect(() => mergeRtlShards(set, {plan, storybookSha: 'abc'})).toThrow(
      /D8/,
    );
  });
});
