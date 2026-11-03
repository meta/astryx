// Copyright (c) Meta Platforms, Inc. and affiliates.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  CHECKS,
  applicableChecks,
  fileClass,
  findingChecks,
  formatReport,
  mergeConflicts,
} from './pre-review.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');

/** A unified diff that adds `lines` to `file`. */
function diffAdding(file, lines) {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -1,0 +1,${lines.length} @@`,
    ...lines.map(line => `+${line}`),
  ].join('\n');
}

function idsFor(entries) {
  const files = entries.map(([file]) => file);
  const diff = entries
    .map(([file, lines]) => diffAdding(file, lines))
    .join('\n');
  return applicableChecks(files, diff).map(item => item.id);
}

describe('applicableChecks', () => {
  it('always applies the public boundary item', () => {
    expect(idsFor([['README.md', ['text']]])).toEqual(['d']);
  });

  it('routes a new hook row to the API delta and hook example items', () => {
    expect(
      idsFor([['packages/core/api-report.md', ['hook useThing: () => void']]]),
    ).toEqual(['a', 'd', 'e']);
  });

  it('routes a behavior or boolean prop row to the behavior prop item', () => {
    expect(
      idsFor([
        [
          'packages/core/api-report.md',
          ["  prop openBehavior?: 'hover' | 'press'"],
        ],
      ]),
    ).toEqual(['a', 'c', 'd']);
    expect(
      idsFor([['packages/core/api-report.md', ['  prop isPinned?: boolean']]]),
    ).toEqual(['a', 'c', 'd']);
  });

  it('routes published source to the behavior item and its comments to the comment item', () => {
    expect(
      idsFor([
        [
          'packages/core/src/Button/Button.tsx',
          [
            '// The focus ring shows only after keyboard input.',
            'const x = 1;',
          ],
        ],
      ]),
    ).toEqual(['b', 'd', 'f']);
  });

  it('routes a hook export from an entry point to the hook example item', () => {
    expect(
      idsFor([
        [
          'packages/core/src/index.ts',
          ["export {useThing} from './useThing/useThing';"],
        ],
      ]),
    ).toEqual(['b', 'd', 'e']);
  });

  it('ignores directives and the copyright line', () => {
    expect(
      idsFor([
        [
          'packages/core/src/Button/Button.tsx',
          [
            '// eslint-disable-next-line no-console',
            '// Copyright (c) Meta Platforms, Inc. and affiliates.',
          ],
        ],
      ]),
    ).toEqual(['b', 'd']);
  });

  it('keeps tests, stories, and docs out of the source items', () => {
    expect(
      idsFor([
        ['packages/core/src/Button/Button.test.tsx', ['// Arrange the menu.']],
        ['packages/core/src/Button/Button.stories.tsx', ['// A story.']],
        ['packages/core/src/Button/Button.doc.mjs', ['// A doc.']],
      ]),
    ).toEqual(['d']);
  });

  it('routes published code outside src and shipped catalogs to the behavior item', () => {
    expect(
      idsFor([['packages/cli/clients/cli/bin/astryx.mjs', ['run();']]]),
    ).toEqual(['b', 'd']);
    expect(
      idsFor([['packages/core/locales/fr-FR.json', ['"key": "value"']]]),
    ).toEqual(['b', 'd']);
  });

  it('keeps private packages out of the behavior item', () => {
    expect(
      idsFor([
        ['packages/charts/src/Chart/Chart.tsx', ['// Clear the ring first.']],
      ]),
    ).toEqual(['d', 'f']);
  });

  it('applies the comment item to Lab source but not the behavior item', () => {
    expect(
      idsFor([
        ['packages/lab/src/Thing/Thing.tsx', ['// Clear the ring first.']],
      ]),
    ).toEqual(['d', 'f']);
  });

  it('routes an owner-gated record to the spec owner item', () => {
    expect(
      idsFor([
        ['docs/architecture/knowledge-contracts.md', ['- **INV99 — A rule.**']],
      ]),
    ).toEqual(['d', 'g']);
  });

  it('gives every item a checklist entry', () => {
    expect(Object.keys(CHECKS)).toEqual([
      ...['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      ...['h', 'i', 'j', 'k', 'l'],
    ]);
  });
});

describe('fileClass', () => {
  it('names the class a reviewer reads each path as', () => {
    const plain = {specRecord: false, ownerGatedRecord: false};
    expect(
      fileClass('docs/x.md', {specRecord: true, ownerGatedRecord: true}),
    ).toBe('record, owner-gated');
    expect(fileClass('packages/core/api-report.md', plain)).toBe('API report');
    expect(fileClass('packages/lab/src/A/A.tsx', plain)).toBe('Lab');
    expect(fileClass('packages/core/src/A/A.tsx', plain)).toBe(
      'published package code',
    );
    expect(fileClass('packages/charts/src/A/A.tsx', plain)).toBe(
      'package file',
    );
    expect(fileClass('scripts/x.mjs', plain)).toBe('repository');
  });
});

describe('findingChecks', () => {
  it('lists each item that has findings once, with its count', () => {
    expect(
      findingChecks([{item: 'j'}, {item: 'i'}, {item: 'j'}]).map(
        item => `${item.id}: ${item.reason}`,
      ),
    ).toEqual(['i: 1 finding above', 'j: 2 findings above']);
  });
});

describe('formatReport', () => {
  const finding = {
    item: 'i',
    file: 'packages/core/src/A/A.tsx',
    line: 12,
    rule: 'A new ResizeObserver; Core owns this concern',
    fix: 'Call `observeResize`.',
  };

  it('lists the applicable items and the checklist link', () => {
    const text = formatReport({
      base: 'origin/main',
      head: 'working tree',
      mergeBase: 'a'.repeat(40),
      scope: 'changes include another surface',
      files: [
        {file: 'packages/core/src/A/A.tsx', class: 'published package code'},
      ],
      records: [{id: 'component:A', path: 'docs/specs/components/A/A.spec.md'}],
      claims: [],
      baselines: {command: null, claims: []},
      authoredLines: 12,
      merge: {conflicts: []},
      findings: [finding],
      checks: [
        {id: 'd', check: CHECKS.d, reason: 'every pull request is public'},
      ],
      checklist: 'docs/contributing/pull-requests.md#pre-review-checklist',
    });
    expect(text).toContain('Authored lines: 12 (limit 2000;');
    expect(text).toContain('Merge into origin/main: clean');
    expect(text).toContain(
      '  [i] packages/core/src/A/A.tsx:12  A new ResizeObserver; Core owns this concern\n      fix: Call `observeResize`.',
    );
    expect(text).toContain('component:A  docs/specs/components/A/A.spec.md');
    expect(text).toContain('[d] ');
    expect(text).toContain(
      'Checklist: docs/contributing/pull-requests.md#pre-review-checklist',
    );
  });
});

describe('mergeConflicts', () => {
  function repoWithBranches(theirs) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-pre-test-'));
    const git = (...args) =>
      execFileSync('git', ['-C', root, ...args], {encoding: 'utf8'});
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    fs.writeFileSync(path.join(root, 'a.txt'), 'one\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('checkout', '-qb', 'topic');
    fs.writeFileSync(path.join(root, 'a.txt'), 'topic\n');
    git('commit', '-qam', 'topic');
    git('checkout', '-q', 'main');
    fs.writeFileSync(path.join(root, theirs.file), theirs.text);
    git('add', '.');
    git('commit', '-qm', 'main');
    return {root, git};
  }

  it('names the conflicting paths and writes no objects', () => {
    const {root, git} = repoWithBranches({file: 'a.txt', text: 'main\n'});
    const before = git('count-objects', '-v');
    expect(mergeConflicts('main', 'topic', root)).toEqual({
      conflicts: ['a.txt'],
    });
    expect(git('count-objects', '-v')).toBe(before);
    fs.rmSync(root, {recursive: true, force: true});
  });

  it('reports a clean merge', () => {
    const {root} = repoWithBranches({file: 'b.txt', text: 'other\n'});
    expect(mergeConflicts('main', 'topic', root)).toEqual({conflicts: []});
    fs.rmSync(root, {recursive: true, force: true});
  });
});

describe('pnpm review:pre', () => {
  it('reports no changes for an empty range', () => {
    const output = execFileSync(
      process.execPath,
      ['scripts/pre-review.mjs', '--base', 'HEAD', '--head', 'HEAD'],
      {cwd: repoRoot, encoding: 'utf8'},
    );
    expect(output).toContain('No changes against HEAD...HEAD.');
  });
});
