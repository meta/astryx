// Copyright (c) Meta Platforms, Inc. and affiliates.

'use strict';
/* global module */

/**
 * @file Split one accessibility audit across jobs and join the parts.
 * @input The audit's ordered story list, one shard's per-story axe violations.
 * @output A shard file per job, and — only when every shard of the same story
 *   list and the same Storybook build is present — the per-story violations a
 *   single run would have collected.
 * @position Used by accessibility-audit.js: `--shard`/`--shard-output` write,
 *   `--merge-shards` reads. A story with no entry would read as "not audited",
 *   so a partial or mismatched set is refused rather than merged.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SHARD_FILE_VERSION = 1;

function parseShard(value) {
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

/** Every count-th item starting at the shard's index, so shards stay balanced. */
function shardItems(items, {index, count}) {
  return items.filter((_, position) => position % count === index - 1);
}

function storyListDigest(storyIds) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(storyIds))
    .digest('hex');
}

function readStorybookSha(storybookPath) {
  const stamp = path.join(storybookPath, 'astryx-build-sha.txt');
  return fs.existsSync(stamp)
    ? fs.readFileSync(stamp, 'utf8').trim() || null
    : null;
}

function shardFile({storyIds, shard, storybookSha, violationsByStory}) {
  return {
    version: SHARD_FILE_VERSION,
    shard,
    storybookSha,
    storyListDigest: storyListDigest(storyIds),
    storyCount: storyIds.length,
    violationsByStory: Object.fromEntries(violationsByStory),
  };
}

function readShardFiles(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
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
 * @returns {Map<string, object[]>} story id -> axe violations, for every story
 */
function mergeA11yShards(files, {storyIds, storybookSha}) {
  if (files.length === 0)
    throw new Error('No accessibility shard files to merge');
  const digest = storyListDigest(storyIds);
  const count = files[0].content?.shard?.count;
  const seen = new Set();
  const merged = new Map();
  for (const {file, content} of files) {
    const where = path.basename(file);
    if (content?.version !== SHARD_FILE_VERSION) {
      throw new Error(
        `${where}: unsupported shard version ${content?.version}`,
      );
    }
    if (content.shard?.count !== count) {
      throw new Error(
        `${where}: shard count ${content.shard?.count} does not match ${count}`,
      );
    }
    if (seen.has(content.shard.index)) {
      throw new Error(
        `${where}: shard ${content.shard.index}/${count} appears twice`,
      );
    }
    seen.add(content.shard.index);
    if (
      content.storyListDigest !== digest ||
      content.storyCount !== storyIds.length
    ) {
      throw new Error(`${where}: audited a different story list than this run`);
    }
    if ((content.storybookSha ?? null) !== (storybookSha ?? null)) {
      throw new Error(
        `${where}: audited Storybook ${content.storybookSha ?? 'unstamped'}, this run reads ${storybookSha ?? 'unstamped'}`,
      );
    }
    const expected = shardItems(storyIds, content.shard);
    const ids = Object.keys(content.violationsByStory ?? {});
    const expectedSet = new Set(expected);
    if (
      ids.length !== expected.length ||
      ids.some(id => !expectedSet.has(id))
    ) {
      throw new Error(
        `${where}: does not hold exactly the stories of shard ${content.shard.index}/${count}`,
      );
    }
    for (const id of ids) {
      if (!Array.isArray(content.violationsByStory[id])) {
        throw new Error(`${where}: ${id} has no violations list`);
      }
      merged.set(id, content.violationsByStory[id]);
    }
  }
  if (seen.size !== count) {
    throw new Error(
      `Accessibility shards ${[...seen].sort((a, b) => a - b).join(', ')} of ${count}: the set is incomplete`,
    );
  }
  return merged;
}

module.exports = {
  mergeA11yShards,
  parseShard,
  readShardFiles,
  readStorybookSha,
  shardFile,
  shardItems,
};
