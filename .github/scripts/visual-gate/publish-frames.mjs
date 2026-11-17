#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Publishes the changed visual shots' frames for the PR report.
 * @input `--input <dir>` (publish-pr-report.mjs's output: verdict.json and
 *   re-encoded `before|after|diff/<key>.png`), `--pr <number>`,
 *   `--head-sha <sha>`, `--repository <owner/repo>`, `--limit <n>`, and a
 *   token in GITHUB_TOKEN.
 * @output Commits up to `limit` (at most 12) changed shots' frames, PNG or
 *   WebP of at most 500 KB each by their own bytes, largest change first,
 *   to the pull request's `assets/pr-<number>` branch (the path PR screenshots
 *   already use) under `visual/<head sha>/`, marking a branch it creates with
 *   MARKER so only such branches are pruned, and writes `image_base` (their
 *   raw URL prefix) and `published` (each frame's `<kind>/<key>.png`) to
 *   GITHUB_OUTPUT. Writes nothing when no shot changed.
 * @position The PR Comment workflow's frames job, after the visual report is
 *   prepared; the comment job renders the thumbnails. It writes only that
 *   branch, and only frames the trusted publisher re-encoded.
 */

import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

// The report's own shot order and limit (lib/pr-status.js).
const {visualShots, VISUAL_FRAME_LIMIT} = createRequire(import.meta.url)(
  '../lib/pr-status.js',
);
const KEY = /^(?!\.+$)[A-Za-z0-9._-]{1,240}$/;
/** Shots published per head, whatever `--limit` asks for: the report's rows. */
export const MAX_SHOTS = VISUAL_FRAME_LIMIT;
export const MAX_FRAME_BYTES = 500 * 1024;

/** A PNG or WebP no larger than MAX_FRAME_BYTES, by its own bytes. */
export function isPublishableImage(bytes) {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length === 0 ||
    bytes.length > MAX_FRAME_BYTES
  )
    return false;
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.subarray(0, 8).equals(png)) return true;
  return (
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  );
}

/**
 * The file that marks an assets branch as created by this script. The daily
 * branch pruner deletes only marked branches, once their PR closes; a branch
 * someone pushed by hand never gets the marker.
 */
export const MARKER = '.pr-report-frames';

/** The only ref this script writes: PR #<pr>'s assets branch. */
export function assetsBranch(pr) {
  if (!Number.isSafeInteger(pr) || pr <= 0) throw new Error('not a PR number');
  return `assets/pr-${pr}`;
}

/**
 * The frames to publish: the report's rows (visualShots), the first `limit`
 * of them and at most MAX_SHOTS, and only shots whose key is a safe name.
 */
export function framesToPublish(verdict, limit) {
  return visualShots(verdict)
    .slice(0, Math.min(Number(limit) || 0, MAX_SHOTS))
    .filter(shot => KEY.test(String(shot.key ?? '')))
    .map(shot => ({key: shot.key, kinds: shot.kinds}));
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
 * it exists. Returns the raw URL prefix of the published frames and each
 * published frame's `<kind>/<key>.png`, or null when none was published.
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
      if (!fs.existsSync(file)) continue;
      const bytes = fs.readFileSync(file);
      if (!isPublishableImage(bytes)) continue;
      files.push({
        frame: `${kind}/${shot.key}.png`,
        path: `visual/${headSha}/${kind}/${shot.key}.png`,
        bytes,
      });
    }
  }
  if (files.length === 0) return null;
  if (!/^[0-9a-f]{40}$/.test(String(headSha)))
    throw new Error('not a head SHA');
  const branch = assetsBranch(pr);
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
  if (!parent) {
    const marker = await api(
      request,
      'POST',
      `/repos/${repository}/git/blobs`,
      {
        content: Buffer.from(
          'Created by the PR report; pruned when the PR closes.\n',
        ).toString('base64'),
        encoding: 'base64',
      },
    );
    tree.push({path: MARKER, mode: '100644', type: 'blob', sha: marker.sha});
  }
  for (const entry of files) {
    const blob = await api(request, 'POST', `/repos/${repository}/git/blobs`, {
      content: entry.bytes.toString('base64'),
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
  return {
    imageBase: `https://raw.githubusercontent.com/${repository}/${branch}/visual/${headSha}/`,
    published: files.map(entry => entry.frame),
  };
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
  const result = await publishFrames({
    input: path.resolve(flag('input')),
    pr,
    headSha,
    repository,
    limit: Number(flag('limit') ?? 12),
    request,
  });
  if (result && process.env.GITHUB_OUTPUT)
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `image_base=${result.imageBase}\npublished=${JSON.stringify(result.published)}\n`,
    );
  console.log(
    result
      ? `Published ${result.published.length} frames under ${result.imageBase}`
      : 'No changed shots to publish.',
  );
}
