// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Release-branch admission over a checkout.
 *
 * @input  temporary checkouts with a fixed group, Changesets, and tags
 * @output proofs that admission reads main's declared version and the newest
 *   stable tag, and runs where a release is planned (spec:AST-017 FR47-FR49)
 * @position focused suite for scripts/release/release-inputs.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {admitRelease} from './release-inputs.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, {recursive: true, force: true});
});

function checkout(version, changesets = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-admit-'));
  roots.push(root);
  const put = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
    fs.writeFileSync(path.join(root, file), text);
  };
  put('pnpm-workspace.yaml', "packages:\n  - 'packages/*'\n");
  for (const name of ['core', 'cli'])
    put(
      `packages/${name}/package.json`,
      JSON.stringify({name: `@astryxdesign/${name}`, version}),
    );
  put(
    '.changeset/config.json',
    JSON.stringify({fixed: [['@astryxdesign/core', '@astryxdesign/cli']]}),
  );
  for (const [name, text] of Object.entries(changesets))
    put(`.changeset/${name}.md`, text);
  return root;
}

const BREAKING =
  "---\n'@astryxdesign/core': minor\n---\n\n[breaking] Remove it\n@person\n";
const FIX = "---\n'@astryxdesign/core': patch\n---\n\n[fix] Fix it\n@person\n";
const TAGS = ['v0.6.5', 'v0.6.6', 'v0.7.0-canary.abc1234'];

describe('admitRelease', () => {
  it('admits a [breaking] Changeset when main declares the minor', () => {
    const result = admitRelease(checkout('0.7.0', {b: BREAKING}), {
      version: '0.7.0',
      tags: TAGS,
    });
    expect(result).toMatchObject({
      declared: '0.7.0',
      latestStable: '0.6.6',
      tier: 'minor',
      problems: [],
    });
  });

  it('keeps the patch path and refuses incompatible work in it', () => {
    expect(
      admitRelease(checkout('0.6.7', {f: FIX}), {version: '0.6.7', tags: TAGS})
        .problems,
    ).toEqual([]);
    const refused = admitRelease(checkout('0.6.7', {f: FIX, b: BREAKING}), {
      version: '0.6.7',
      tags: TAGS,
    });
    expect(refused.problems).toHaveLength(1);
    expect(refused.problems[0]).toMatch(/^b\.md: this entry is incompatible/);
  });

  it("refuses a release version other than main's declaration", () => {
    const result = admitRelease(checkout('0.7.0', {b: BREAKING}), {
      version: '0.8.0',
      tags: TAGS,
    });
    expect(result.problems[0]).toBe(
      "the release version is 0.8.0, but main declares 0.7.0. A release branch releases the version main's package.json declares.",
    );
  });

  it('refuses a declared version that is already released', () => {
    const result = admitRelease(checkout('0.6.6', {f: FIX}), {
      version: '0.6.6',
      tags: TAGS,
    });
    expect(result.problems[0]).toMatch(
      /not newer than the latest stable release 0\.6\.6/,
    );
  });

  it('reads the base from tags, never from a canary', () => {
    const result = admitRelease(checkout('0.7.1', {f: FIX}), {
      version: '0.7.1',
      tags: TAGS,
    });
    expect(result.latestStable).toBe('0.6.6');
    expect(result.tier).toBeNull();
  });
});
