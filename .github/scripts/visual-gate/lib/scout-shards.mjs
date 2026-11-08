// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Split the theming-target scout across jobs and join the parts.
 *
 * @input  the plan's ordered scout story list, one shard's observations
 * @output a shard file per job, and — only when every shard of the same list
 *         and the same Storybook build is present — the full observations
 *         object, in the plan's story order
 * @position Used by `gate.mjs scout` (write) and by the plan when it is given
 *           `--observation-shards` (read). The plan cannot tell a missing
 *           observation from a story that renders nothing, so a partial or
 *           mismatched set is refused rather than merged.
 */

import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const SHARD_FILE_VERSION = 1;

/** @param {string | null | undefined} value e.g. `2/3` */
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
      `--shard must be <index>/<count> with 1 <= index <= count, got ${value ?? 'nothing'}.`,
    );
  }
  return {index, count};
}

/**
 * The stories one shard scouts: every count-th story, starting at its index,
 * so each shard gets a spread of the index rather than one slow corner of it.
 * @param {string[]} storyIds
 * @param {{index: number, count: number}} shard
 */
export function shardStoryIds(storyIds, {index, count}) {
  return storyIds.filter((_, position) => position % count === index - 1);
}

/** @param {string[]} storyIds */
export function storyListDigest(storyIds) {
  return createHash('sha256').update(JSON.stringify(storyIds)).digest('hex');
}

/**
 * @param {object} options
 * @param {string[]} options.storyIds the plan's full scout list
 * @param {{index: number, count: number}} options.shard
 * @param {string | null} options.storybookSha
 * @param {Record<string, Record<string, string[]>>} options.observations this shard's stories only
 */
export function shardFile({storyIds, shard, storybookSha, observations}) {
  return {
    version: SHARD_FILE_VERSION,
    shard,
    storybookSha,
    storyListDigest: storyListDigest(storyIds),
    storyCount: storyIds.length,
    observations,
  };
}

/** @param {string} dir */
export function readShardFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .sort()
    .map(name => {
      const file = path.join(dir, name);
      return {file, content: JSON.parse(fs.readFileSync(file, 'utf8'))};
    });
}

/**
 * Join shard files into the observations a single scout of `storyIds` would
 * have produced. Throws unless every shard of this exact list and build is
 * present once and together they cover every story exactly once.
 * @param {{file: string, content: any}[]} files
 * @param {{storyIds: string[], storybookSha: string | null}} expected
 * @returns {Record<string, Record<string, string[]>>}
 */
export function mergeScoutShards(files, {storyIds, storybookSha}) {
  if (files.length === 0) throw new Error('No scout shard files to merge.');
  const digest = storyListDigest(storyIds);
  const count = files[0].content?.shard?.count;
  const seen = new Set();
  /** @type {Record<string, Record<string, string[]>>} */
  const merged = {};
  for (const {file, content} of files) {
    const where = path.basename(file);
    if (content?.version !== SHARD_FILE_VERSION) {
      throw new Error(
        `${where}: unsupported scout shard version ${content?.version}.`,
      );
    }
    if (content.shard?.count !== count) {
      throw new Error(
        `${where}: shard count ${content.shard?.count} does not match ${count}.`,
      );
    }
    if (seen.has(content.shard.index)) {
      throw new Error(
        `${where}: shard ${content.shard.index}/${count} appears twice.`,
      );
    }
    seen.add(content.shard.index);
    if (
      content.storyListDigest !== digest ||
      content.storyCount !== storyIds.length
    ) {
      throw new Error(
        `${where}: scouted a different story list than this plan.`,
      );
    }
    if ((content.storybookSha ?? null) !== (storybookSha ?? null)) {
      throw new Error(
        `${where}: scouted Storybook ${content.storybookSha ?? 'unstamped'}, this plan reads ${storybookSha ?? 'unstamped'}.`,
      );
    }
    const expectedIds = new Set(shardStoryIds(storyIds, content.shard));
    const ids = Object.keys(content.observations ?? {});
    if (
      ids.length !== expectedIds.size ||
      ids.some(id => !expectedIds.has(id))
    ) {
      throw new Error(
        `${where}: does not hold exactly the stories of shard ${content.shard.index}/${count}.`,
      );
    }
    Object.assign(merged, content.observations);
  }
  if (seen.size !== count) {
    throw new Error(
      `Scout shards ${[...seen].sort((a, b) => a - b).join(', ')} of ${count} — the set is incomplete.`,
    );
  }
  return Object.fromEntries(storyIds.map(id => [id, merged[id]]));
}
