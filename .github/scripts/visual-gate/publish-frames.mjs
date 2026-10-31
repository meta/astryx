#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Publishes the changed visual shots' frames for the PR report.
 * @input `--input <dir>` (publish-pr-report.mjs's output: verdict.json and
 *   re-encoded `before|after|diff/<key>.png`), `--pr <number>`,
 *   `--head-sha <sha>`, `--repository <owner/repo>`, `--limit <n>`, and a
 *   token in GITHUB_TOKEN.
 * @output Commits up to `limit` changed shots' frames, largest change first,
 *   to the pull request's `assets/pr-<number>` branch (the path PR screenshots
 *   already use) under `visual/<head sha>/`, and writes `image_base` (their
 *   raw URL prefix) to GITHUB_OUTPUT. Writes nothing when no shot changed.
 * @position The PR Comment workflow's comment job, after the visual report is
 *   prepared and before the report renders. It writes only that branch, and
 *   only frames the trusted publisher re-encoded.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const KEY = /^(?!\.+$)[A-Za-z0-9._-]{1,240}$/;
const KINDS = ['before', 'after', 'diff'];

/** The frames to publish: changed shots by pixels changed, then added and removed. */
export function framesToPublish(verdict, limit) {
  if (!verdict || verdict.status === 'skipped' || verdict.status === 'failed')
    return [];
  const changes = [...(verdict.changes || [])].sort(
    (a, b) => Number(b.diffPixels ?? 0) - Number(a.diffPixels ?? 0),
  );
  const shots = [
    ...changes.map(change => ({key: change.key, kinds: KINDS})),
    ...(verdict.added || []).map(key => ({key, kinds: ['after']})),
    ...(verdict.removed || []).map(key => ({key, kinds: ['before']})),
  ].filter(shot => KEY.test(String(shot.key ?? '')));
  return shots.slice(0, limit);
}

async function api(request, method, route, body) {
  const response = await request(method, route, body);
  if (response.status === 404) return null;
  if (response.status >= 300)
    throw new Error(`${method} ${route} failed: ${response.status}`);
  return response.json();
}

/**
 * One commit on `assets/pr-<pr>` holding the frames, on top of the branch when
 * it exists. Returns the raw URL prefix of the published frames, or null.
 */
export async function publishFrames({
  input,
  pr,
  headSha,
  repository,
  limit,
  request,
}) {
  const verdict = JSON.parse(
    fs.readFileSync(path.join(input, 'verdict.json'), 'utf8'),
  );
  const files = [];
  for (const shot of framesToPublish(verdict, limit)) {
    for (const kind of shot.kinds) {
      const file = path.join(input, kind, `${shot.key}.png`);
      if (fs.existsSync(file))
        files.push({path: `visual/${headSha}/${kind}/${shot.key}.png`, file});
    }
  }
  if (files.length === 0) return null;
  const branch = `assets/pr-${pr}`;
  const ref = await api(
    request,
    'GET',
    `/repos/${repository}/git/ref/heads/${branch}`,
  );
  const parent = ref?.object?.sha ?? null;
  const parentCommit = parent
    ? await api(request, 'GET', `/repos/${repository}/git/commits/${parent}`)
    : null;
  const tree = [];
  for (const entry of files) {
    const blob = await api(request, 'POST', `/repos/${repository}/git/blobs`, {
      content: fs.readFileSync(entry.file).toString('base64'),
      encoding: 'base64',
    });
    tree.push({path: entry.path, mode: '100644', type: 'blob', sha: blob.sha});
  }
  const newTree = await api(request, 'POST', `/repos/${repository}/git/trees`, {
    ...(parentCommit ? {base_tree: parentCommit.tree.sha} : {}),
    tree,
  });
  const commit = await api(
    request,
    'POST',
    `/repos/${repository}/git/commits`,
    {
      message: `Visual frames for #${pr} at ${headSha.slice(0, 7)}`,
      tree: newTree.sha,
      parents: parent ? [parent] : [],
    },
  );
  if (parent)
    await api(
      request,
      'PATCH',
      `/repos/${repository}/git/refs/heads/${branch}`,
      {
        sha: commit.sha,
      },
    );
  else
    await api(request, 'POST', `/repos/${repository}/git/refs`, {
      ref: `refs/heads/${branch}`,
      sha: commit.sha,
    });
  return `https://raw.githubusercontent.com/${repository}/${branch}/visual/${headSha}/`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const flag = name => {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? null : process.argv[index + 1];
  };
  const pr = Number(flag('pr'));
  const headSha = String(flag('head-sha') ?? '');
  const repository = String(flag('repository') ?? '');
  if (!Number.isSafeInteger(pr) || pr <= 0)
    throw new Error('--pr must be a PR number');
  if (!/^[0-9a-f]{40}$/.test(headSha))
    throw new Error('--head-sha must be a full SHA');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))
    throw new Error('--repository must be owner/repo');
  const token = process.env.GITHUB_TOKEN;
  const request = (method, route, body) =>
    fetch(`https://api.github.com${route}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  const imageBase = await publishFrames({
    input: path.resolve(flag('input')),
    pr,
    headSha,
    repository,
    limit: Number(flag('limit') ?? 12),
    request,
  });
  if (imageBase && process.env.GITHUB_OUTPUT)
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `image_base=${imageBase}\n`);
  console.log(
    imageBase
      ? `Published frames under ${imageBase}`
      : 'No changed shots to publish.',
  );
}
