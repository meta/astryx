// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file publish-frames.test.mjs
 * Pins which visual frames the PR report publishes (the largest changes
 * first, then added and removed shots, at most `limit`, safe keys only) and
 * how: one commit on `assets/pr-<n>`, on top of the branch when it exists.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {
  MAX_FRAME_BYTES,
  MAX_SHOTS,
  MARKER,
  assetsBranch,
  framesToPublish,
  isPublishableImage,
  publishFrames,
} from './publish-frames.mjs';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('rest'),
]);

const HEAD = 'a'.repeat(40);
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, {recursive: true, force: true});
});

function input(verdict) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-'));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'verdict.json'), JSON.stringify(verdict));
  for (const kind of ['before', 'after', 'diff']) {
    fs.mkdirSync(path.join(root, kind));
    for (const key of ['a', 'b', 'c', 'added'])
      fs.writeFileSync(path.join(root, kind, `${key}.png`), PNG);
  }
  return root;
}

function fakeGitHub({branchExists}) {
  const calls = [];
  const request = async (method, route, body) => {
    calls.push({method, route, body});
    const json = data => ({status: 200, json: async () => data});
    if (method === 'GET' && route.includes('/git/ref/'))
      return branchExists
        ? json({object: {sha: 'parent'}})
        : {status: 404, json: async () => ({})};
    if (method === 'GET' && route.includes('/git/commits/'))
      return json({tree: {sha: 'parent-tree'}});
    if (route.endsWith('/git/blobs'))
      return json({sha: `blob-${calls.length}`});
    if (route.endsWith('/git/trees')) return json({sha: 'tree'});
    if (route.endsWith('/git/commits')) return json({sha: 'commit'});
    return json({});
  };
  return {calls, request};
}

describe('framesToPublish', () => {
  it('takes the largest changes first, then added and removed shots, up to the limit', () => {
    const verdict = {
      changes: [
        {key: 'a', diffPixels: 1},
        {key: 'b', diffPixels: 9},
        {key: '../escape', diffPixels: 99},
      ],
      added: ['added'],
      removed: ['gone'],
    };
    expect(framesToPublish(verdict, 3).map(shot => shot.key)).toEqual([
      'b',
      'a',
      'added',
    ]);
    expect(framesToPublish({...verdict, status: 'skipped'}, 3)).toEqual([]);
  });
});

describe('image and ref limits', () => {
  it('accepts only PNG or WebP bytes no larger than 500 KB', () => {
    expect(isPublishableImage(PNG)).toBe(true);
    const webp = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.alloc(4),
      Buffer.from('WEBPVP8 '),
    ]);
    expect(isPublishableImage(webp)).toBe(true);
    expect(isPublishableImage(Buffer.from('<svg onload=alert(1)>'))).toBe(
      false,
    );
    expect(isPublishableImage(Buffer.from('GIF89a'))).toBe(false);
    expect(
      isPublishableImage(Buffer.concat([PNG, Buffer.alloc(MAX_FRAME_BYTES)])),
    ).toBe(false);
  });

  it('publishes at most 12 shots, whatever the limit asks', () => {
    const changes = Array.from({length: 30}, (_, i) => ({
      key: `s${i}`,
      diffPixels: i,
    }));
    expect(framesToPublish({changes}, 100)).toHaveLength(MAX_SHOTS);
    expect(MAX_SHOTS).toBe(12);
  });

  it('writes only assets/pr-<n>', () => {
    expect(assetsBranch(42)).toBe('assets/pr-42');
    for (const bad of [0, -1, 1.5, NaN, '42/../main'])
      expect(() => assetsBranch(bad)).toThrow();
  });
});

describe('publishFrames', () => {
  it("commits the frames on top of the PR's existing assets branch", async () => {
    const {calls, request} = fakeGitHub({branchExists: true});
    const base = await publishFrames({
      input: input({changes: [{key: 'b', diffPixels: 2}]}),
      pr: 9171,
      headSha: HEAD,
      repository: 'meta/astryx',
      limit: 12,
      request,
    });
    expect(base).toEqual({
      imageBase: `https://raw.githubusercontent.com/meta/astryx/assets/pr-9171/visual/${HEAD}/`,
      published: ['before/b.png', 'after/b.png', 'diff/b.png'],
    });
    const tree = calls.find(call => call.route.endsWith('/git/trees')).body;
    expect(tree.base_tree).toBe('parent-tree');
    expect(tree.tree.map(entry => entry.path)).not.toContain(MARKER);
    expect(tree.tree.map(entry => entry.path)).toEqual([
      `visual/${HEAD}/before/b.png`,
      `visual/${HEAD}/after/b.png`,
      `visual/${HEAD}/diff/b.png`,
    ]);
    expect(
      calls.find(call => call.route.endsWith('/git/commits')).body.parents,
    ).toEqual(['parent']);
    expect(calls.at(-1)).toMatchObject({
      method: 'PATCH',
      route: '/repos/meta/astryx/git/refs/heads/assets/pr-9171',
      body: {sha: 'commit'},
    });
  });

  it('skips a frame that is not an image, and touches no other ref', async () => {
    const root = input({changes: [{key: 'a', diffPixels: 1}]});
    fs.writeFileSync(path.join(root, 'diff', 'a.png'), '<html>');
    const {calls, request} = fakeGitHub({branchExists: true});
    await publishFrames({
      input: root,
      pr: 7,
      headSha: HEAD,
      repository: 'meta/astryx',
      limit: 12,
      request,
    });
    const tree = calls.find(call => call.route.endsWith('/git/trees')).body;
    expect(tree.tree.map(entry => entry.path)).toEqual([
      `visual/${HEAD}/before/a.png`,
      `visual/${HEAD}/after/a.png`,
    ]);
    const refs = calls.filter(call => call.route.includes('/git/ref'));
    expect(
      refs.every(
        call =>
          call.route.includes('assets/pr-7') ||
          call.route.endsWith('/git/refs'),
      ),
    ).toBe(true);
  });

  it('creates the branch when it does not exist, and writes nothing without changes', async () => {
    const created = fakeGitHub({branchExists: false});
    await publishFrames({
      input: input({added: ['added']}),
      pr: 5,
      headSha: HEAD,
      repository: 'meta/astryx',
      limit: 12,
      request: created.request,
    });
    // Only a branch this script creates carries the pruning marker.
    const createdTree = created.calls.find(call =>
      call.route.endsWith('/git/trees'),
    ).body;
    expect(createdTree.tree.map(entry => entry.path)).toContain(MARKER);
    expect(created.calls.at(-1)).toMatchObject({
      method: 'POST',
      route: '/repos/meta/astryx/git/refs',
      body: {ref: 'refs/heads/assets/pr-5'},
    });
    const none = fakeGitHub({branchExists: true});
    await expect(
      publishFrames({
        input: input({changes: []}),
        pr: 5,
        headSha: HEAD,
        repository: 'meta/astryx',
        limit: 12,
        request: none.request,
      }),
    ).resolves.toBeNull();
    expect(none.calls).toEqual([]);
  });
});
