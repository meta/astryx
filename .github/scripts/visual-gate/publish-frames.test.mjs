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
import {framesToPublish, publishFrames} from './publish-frames.mjs';

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
      fs.writeFileSync(path.join(root, kind, `${key}.png`), `${kind}-${key}`);
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
    expect(base).toBe(
      `https://raw.githubusercontent.com/meta/astryx/assets/pr-9171/visual/${HEAD}/`,
    );
    const tree = calls.find(call => call.route.endsWith('/git/trees')).body;
    expect(tree.base_tree).toBe('parent-tree');
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
