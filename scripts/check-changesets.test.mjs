// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file check-changesets.test.mjs
 * Unit tests for the changeset convention gate — specifically the 0.x semver
 * coupling: a [breaking] change must bump the minor, [experimental] and every
 * other non-breaking category must bump the patch, and major is rejected while
 * pre-1.0.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, it, expect} from 'vitest';
import {checkRepository, validateChangeset} from './check-changesets.mjs';

const ctx = {
  pre1: true,
  pubNames: new Set(['@astryxdesign/core', '@astryxdesign/cli']),
  allNames: new Set([
    '@astryxdesign/core',
    '@astryxdesign/cli',
    '@astryxdesign/storybook',
  ]),
};

const cs = (frontmatter, body) => `---\n${frontmatter}\n---\n\n${body}\n`;

describe('validateChangeset — 0.x semver coupling', () => {
  it('accepts [breaking] with a minor bump', () => {
    const problems = validateChangeset(
      'a.md',
      cs(
        "'@astryxdesign/core': minor",
        '[breaking] Rename items to options (#1)\n@who',
      ),
      ctx,
    );
    expect(problems).toEqual([]);
  });

  it('accepts an incompatible experimental-only change with a patch bump', () => {
    const problems = validateChangeset(
      'a.md',
      cs(
        "'@astryxdesign/core': patch",
        '[experimental] Rename an experimental callback (#1)\n@who',
      ),
      ctx,
    );
    expect(problems).toEqual([]);
  });

  it('rejects [experimental] declared as minor', () => {
    const problems = validateChangeset(
      'a.md',
      cs(
        "'@astryxdesign/core': minor",
        '[experimental] Remove an experimental prop (#1)\n@who',
      ),
      ctx,
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(
      /declares "minor".*category is \[experimental\].*Use "patch"/,
    );
  });

  it('accepts another non-breaking category with a patch bump', () => {
    for (const category of [
      'feat',
      'fix',
      'component',
      'perf',
      'docs',
      'chore',
    ]) {
      const problems = validateChangeset(
        'a.md',
        cs("'@astryxdesign/core': patch", `[${category}] Something (#1)\n@who`),
        ctx,
      );
      expect(problems, category).toEqual([]);
    }
  });

  it('rejects [breaking] declared as patch', () => {
    const problems = validateChangeset(
      'a.md',
      cs("'@astryxdesign/core': patch", '[breaking] Remove onHide (#1)\n@who'),
      ctx,
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/breaking.*declares "patch".*Use "minor"/);
  });

  it('rejects a non-breaking category declared as minor', () => {
    const problems = validateChangeset(
      'a.md',
      cs(
        "'@astryxdesign/core': minor",
        '[feat] Add optional size prop (#1)\n@who',
      ),
      ctx,
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/declares "minor".*category is \[feat\]/);
  });

  it('rejects a major bump while 0.x', () => {
    const problems = validateChangeset(
      'a.md',
      cs("'@astryxdesign/core': major", '[breaking] Total rewrite (#1)\n@who'),
      ctx,
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/declares "major".*no major bump.*1\.0\.0/);
  });

  it('does not enforce the coupling once past 1.0', () => {
    const problems = validateChangeset(
      'a.md',
      cs("'@astryxdesign/core': minor", '[feat] Add prop (#1)\n@who'),
      {...ctx, pre1: false},
    );
    expect(problems).toEqual([]);
  });

  it('still flags a missing category and missing contributor', () => {
    const problems = validateChangeset(
      'a.md',
      cs("'@astryxdesign/core': patch", 'no category or handle here'),
      ctx,
    );
    expect(problems.some(p => /\[category\] tag/.test(p))).toBe(true);
    expect(problems.some(p => /contributor/.test(p))).toBe(true);
  });

  it('flags a private/ignored package', () => {
    const problems = validateChangeset(
      'a.md',
      cs("'@astryxdesign/storybook': patch", '[fix] x (#1)\n@who'),
      ctx,
    );
    expect(problems.some(p => /private\/ignored/.test(p))).toBe(true);
  });
});

describe('checkRepository — main pull requests enforce the declared tier', () => {
  const roots = [];
  afterEach(() => {
    for (const root of roots.splice(0))
      fs.rmSync(root, {recursive: true, force: true});
  });

  function mainCheckout(version, changesets) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-main-cs-'));
    roots.push(root);
    const put = (file, text) => {
      fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
      fs.writeFileSync(path.join(root, file), text);
    };
    put('pnpm-workspace.yaml', "packages:\n  - 'packages/*'\n");
    put(
      'packages/core/package.json',
      JSON.stringify({name: '@astryxdesign/core', version}),
    );
    put(
      '.changeset/config.json',
      JSON.stringify({fixed: [['@astryxdesign/core']], ignore: []}),
    );
    for (const [name, text] of Object.entries(changesets))
      put(`.changeset/${name}.md`, text);
    return root;
  }

  it('refuses [breaking] while main declares the 0.6.8 patch plan (FR46)', () => {
    const root = mainCheckout('0.6.8', {
      'remove-thing': cs(
        `'@astryxdesign/core': minor`,
        '[breaking] Remove the old thing\n@person',
      ),
    });
    const result = checkRepository(root);
    expect(result.declaredVersion).toBe('0.6.8');
    expect(result.declaredTier).toBe('patch');
    expect(result.problems).toContain(
      'remove-thing.md: [breaking] cannot merge while main declares patch 0.6.8. ' +
        'Plan the minor first, or keep the change compatible through deprecation.',
    );
    expect(result.files).toEqual(['remove-thing.md']);
  });

  it('accepts the same Changeset on a pre-bumped minor main', () => {
    const root = mainCheckout('0.7.0', {
      'remove-thing': cs(
        `'@astryxdesign/core': minor`,
        '[breaking] Remove the old thing\n@person',
      ),
    });
    const result = checkRepository(root);
    expect(result.declaredVersion).toBe('0.7.0');
    expect(result.declaredTier).toBe('minor');
    expect(result.problems).toEqual([]);
  });

  it('refuses [breaking] when the fixed group declares a prerelease, not a plain minor', () => {
    const root = mainCheckout('0.7.0-canary.3', {
      'remove-thing': cs(
        `'@astryxdesign/core': minor`,
        '[breaking] Remove the old thing\n@person',
      ),
    });
    const result = checkRepository(root);
    expect(result.declaredTier).toBeNull();
    expect(result.problems).toContain(
      'remove-thing.md: [breaking] cannot merge until the fixed group declares one plain minor version (found 0.7.0-canary.3). ' +
        'Plan the minor first, or keep the change compatible through deprecation.',
    );
  });

  it('refuses [breaking] when the fixed packages disagree on the declared version', () => {
    const root = mainCheckout('0.7.0', {
      'remove-thing': cs(
        `'@astryxdesign/core': minor`,
        '[breaking] Remove the old thing\n@person',
      ),
    });
    fs.mkdirSync(path.join(root, 'packages/cli'), {recursive: true});
    fs.writeFileSync(
      path.join(root, 'packages/cli/package.json'),
      JSON.stringify({name: '@astryxdesign/cli', version: '0.6.9'}),
    );
    fs.writeFileSync(
      path.join(root, '.changeset/config.json'),
      JSON.stringify({
        fixed: [['@astryxdesign/core', '@astryxdesign/cli']],
        ignore: [],
      }),
    );
    const result = checkRepository(root);
    expect(result.declaredVersion).toBeNull();
    expect(result.declaredTier).toBeNull();
    expect(result.problems).toContain(
      'remove-thing.md: [breaking] cannot merge until the fixed group declares one plain minor version (the fixed packages disagree). ' +
        'Plan the minor first, or keep the change compatible through deprecation.',
    );
  });

  it('still admits a non-breaking Changeset when no tier is declared', () => {
    const root = mainCheckout('0.7.0-canary.3', {
      'fix-thing': cs(
        `'@astryxdesign/core': patch`,
        '[fix] Fix the thing\n@person',
      ),
    });
    expect(checkRepository(root).problems).toEqual([]);
  });

  it('still refuses malformed Changesets on main', () => {
    const root = mainCheckout('0.6.7', {
      'no-category': cs(`'@astryxdesign/core': patch`, 'Something\n@person'),
      'wrong-bump': cs(
        `'@astryxdesign/core': patch`,
        '[breaking] Remove the old thing\n@person',
      ),
    });
    const {problems} = checkRepository(root);
    expect(problems.join('\n')).toMatch(
      /no-category\.md: body must start with a \[category\] tag/,
    );
    expect(problems.join('\n')).toMatch(
      /wrong-bump\.md: .* is a \[breaking\] change but declares "patch"/,
    );
  });

  it('ignores any leftover schedule file', () => {
    const root = mainCheckout('0.6.7', {});
    fs.mkdirSync(path.join(root, '.release'));
    fs.writeFileSync(path.join(root, '.release/target.json'), 'not json');
    expect(checkRepository(root).problems).toEqual([]);
  });
});
