// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Split one package's RTL audit across jobs and join the parts.
 * @input The audit's ordered plan (D1 targets, D5/D6 stories, curated targets)
 *   and one shard's cards.
 * @output A shard file per job, and — only when every shard of the same plan
 *   and the same Storybook build is present — every card in plan order, as a
 *   single run would have produced them.
 * @position Used by rtl-audit.mjs: `--shard`/`--shard-output` write,
 *   `--merge-shards` reads. Coverage and completion are computed from the
 *   joined cards, so a missing card would read as an unaudited component; a
 *   partial or mismatched set is refused rather than merged.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const RTL_SHARD_FILE_VERSION = 1;
const PARTS = ['d1', 'stories', 'curated'];

export function parseShard(value) {
  const match = /^(\d+)\/(\d+)$/.exec(value ?? '');
  const index = match ? Number(match[1]) : NaN;
  const count = match ? Number(match[2]) : NaN;
  if (
    !Number.isInteger(index) ||
    !Number.isInteger(count) ||
    count < 1 ||
    index < 1 ||
    index > count
  ) {
    throw new Error(
      `--shard must be <index>/<count> with 1 <= index <= count, got ${value ?? 'nothing'}`,
    );
  }
  return {index, count};
}

/** Positions of the items a shard owns: every count-th, from its index. */
export function shardPositions(length, {index, count}) {
  return Array.from({length}, (_, position) => position).filter(
    position => position % count === index - 1,
  );
}

/** @param {{d1: string[], stories: string[], curated: string[]}} plan */
export function planDigest(plan) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(PARTS.map(part => plan[part])))
    .digest('hex');
}

export function readStorybookSha(dist) {
  const stamp = path.join(dist, 'astryx-build-sha.txt');
  return fs.existsSync(stamp)
    ? fs.readFileSync(stamp, 'utf8').trim() || null
    : null;
}

/**
 * @param {object} options
 * @param {{d1: string[], stories: string[], curated: string[]}} options.plan
 * @param {{index: number, count: number}} options.shard
 * @param {{d1: Map<number, object>, stories: Map<number, object>, curated: Map<number, object>}} options.cards
 *   position in the plan -> card(s) for that item
 */
export function shardFile({
  plan,
  shard,
  storybookSha,
  cards,
  d8BrowserContract,
  pageRecoveries,
}) {
  return {
    version: RTL_SHARD_FILE_VERSION,
    shard,
    storybookSha,
    planDigest: planDigest(plan),
    d8BrowserContract,
    pageRecoveries,
    cards: Object.fromEntries(
      PARTS.map(part => [part, Object.fromEntries(cards[part])]),
    ),
  };
}

/** Shard files directly in `dir` or one directory below it. */
export function readShardFiles(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs
    .readdirSync(dir, {withFileTypes: true})
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const entryPath = path.join(dir, entry.name);
    const candidates = entry.isDirectory()
      ? fs
          .readdirSync(entryPath)
          .sort()
          .map(name => path.join(entryPath, name))
      : [entryPath];
    for (const file of candidates) {
      if (!/^rtl-shard-\d+\.json$/.test(path.basename(file))) continue;
      files.push({file, content: JSON.parse(fs.readFileSync(file, 'utf8'))});
    }
  }
  return files;
}

/**
 * @returns {{d1: object[], stories: object[], curated: object[], d8BrowserContract: object, pageRecoveries: object[]}}
 *   cards in plan order
 */
export function mergeRtlShards(files, {plan, storybookSha}) {
  if (files.length === 0) throw new Error('No RTL shard files to merge');
  const digest = planDigest(plan);
  const count = files[0].content?.shard?.count;
  const byIndex = new Map();
  for (const {file, content} of files) {
    const where = path.basename(file);
    if (content?.version !== RTL_SHARD_FILE_VERSION) {
      throw new Error(
        `${where}: unsupported RTL shard version ${content?.version}`,
      );
    }
    if (content.shard?.count !== count) {
      throw new Error(
        `${where}: shard count ${content.shard?.count} does not match ${count}`,
      );
    }
    if (byIndex.has(content.shard.index)) {
      throw new Error(
        `${where}: shard ${content.shard.index}/${count} appears twice`,
      );
    }
    if (content.planDigest !== digest) {
      throw new Error(`${where}: audited a different plan than this run`);
    }
    if ((content.storybookSha ?? null) !== (storybookSha ?? null)) {
      throw new Error(
        `${where}: audited Storybook ${content.storybookSha ?? 'unstamped'}, this run reads ${storybookSha ?? 'unstamped'}`,
      );
    }
    for (const part of PARTS) {
      const expected = shardPositions(plan[part].length, content.shard).map(
        String,
      );
      const actual = Object.keys(content.cards?.[part] ?? {});
      if (
        actual.length !== expected.length ||
        expected.some(position => !actual.includes(position))
      ) {
        throw new Error(
          `${where}: does not hold exactly the ${part} items of shard ${content.shard.index}/${count}`,
        );
      }
    }
    byIndex.set(content.shard.index, content);
  }
  if (byIndex.size !== count) {
    throw new Error(
      `RTL shards ${[...byIndex.keys()].sort((a, b) => a - b).join(', ')} of ${count}: the set is incomplete`,
    );
  }
  const shards = [...byIndex.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, content]) => content);
  const contracts = new Set(
    shards.map(content => JSON.stringify(content.d8BrowserContract)),
  );
  if (contracts.size !== 1) {
    throw new Error(
      'RTL shards disagree on the D8 browser contract self-check',
    );
  }
  const ordered = part =>
    plan[part].map((_, position) => {
      const owner = shards[position % count];
      return owner.cards[part][String(position)];
    });
  return {
    d1: ordered('d1'),
    stories: ordered('stories'),
    curated: ordered('curated'),
    d8BrowserContract: shards[0].d8BrowserContract,
    pageRecoveries: shards.flatMap(content => content.pageRecoveries ?? []),
  };
}
