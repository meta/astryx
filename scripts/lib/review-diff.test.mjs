// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {afterEach, describe, expect, it} from 'vitest';
import {readDiff} from './review-diff.mjs';
import {collectConcernMatches} from '../check-knowledge.mjs';
import {loadKnowledgeIndex} from '../specs-for-file.mjs';

const HERE = import.meta.dirname;
const ROOT = path.resolve(HERE, '../..');
const fixture = name =>
  fs.readFileSync(path.join(HERE, '__fixtures__/review-diff', name), 'utf8');

/** The repository's own records, as `pnpm specs:for` reads them. */
const records = loadKnowledgeIndex(ROOT).records.map(record => ({
  path: record.path,
  content: record.content,
}));
const routed = name =>
  collectConcernMatches(records, readDiff(fixture(name)).addedLines, null).map(
    match => `${match.recordId}/${match.claimId}`,
  );

describe('readDiff', () => {
  it('reads added shipped-source lines with their new line numbers', () => {
    const {files, addedLines} = readDiff(fixture('pr-8381.diff'));
    expect(files).toEqual([
      'packages/core/src/Dialog/Dialog.tsx',
      'packages/core/src/utils/interactionModality.ts',
    ]);
    expect(addedLines).toContainEqual({
      file: 'packages/core/src/Dialog/Dialog.tsx',
      line: 548,
      text: '  useEffect(() => {',
    });
  });

  it('reads no lines from tests, stories or fixtures', () => {
    const {files, addedLines} = readDiff(fixture('pr-8381-dialog-test.diff'));
    expect(files).toEqual(['packages/core/src/Dialog/Dialog.test.tsx']);
    expect(addedLines).toEqual([]);
  });
});

describe('concern routing on real diffs', () => {
  it("routes #8381's Dialog effect and modality listeners to their owners", () => {
    expect(routed('pr-8381.diff')).toEqual(
      expect.arrayContaining([
        'architecture:interaction-modality/INV1',
        'architecture:interaction-modality/INV2',
        'architecture:interaction-modality/INV3',
        'architecture:react-component-runtime/INV2',
        'architecture:react-component-runtime/INV3',
        'architecture:react-component-runtime/INV5',
        'architecture:react-component-runtime/INV6',
        'architecture:react-component-runtime/INV16',
      ]),
    );
  });

  it("routes #8236's hand-written slot check to INV16, naming isRenderable", () => {
    const matches = collectConcernMatches(
      records,
      readDiff(fixture('pr-8236-badge.diff')).addedLines,
      null,
    );
    expect(matches).toContainEqual(
      expect.objectContaining({
        recordId: 'architecture:react-component-runtime',
        concern: 'slot-presence',
        claimId: 'INV16',
        utilities: ['isRenderable'],
      }),
    );
    expect(
      matches.find(match => match.concern === 'slot-presence').matchReason,
    ).toContain('(shared: isRenderable)');
  });

  it("routes #8513's MonthScroller listeners to the runtime claims", () => {
    expect(routed('pr-8513-month-scroller.diff')).toEqual(
      expect.arrayContaining([
        'architecture:react-component-runtime/INV3',
        'architecture:react-component-runtime/INV5',
      ]),
    );
  });

  it('routes nothing for a CSS-only change', () => {
    expect(routed('css-only.diff')).toEqual([]);
  });

  it('routes nothing for listeners a test adds', () => {
    expect(routed('pr-8381-dialog-test.diff')).toEqual([]);
  });
});

describe('review-global-baselines.mjs', () => {
  const roots = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

  function git(root, ...args) {
    return execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Test',
        GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'Test',
        GIT_COMMITTER_EMAIL: 'test@example.com',
      },
    }).trim();
  }

  function write(root, relative, content) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, content);
  }

  /** A base whose runtime record owns an effects concern; a head changing `source`. */
  function repository(source) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-baselines-'));
    roots.push(root);
    git(root, 'init', '-q', '-b', 'main');
    write(
      root,
      'docs/architecture/react-component-runtime.md',
      [
        '---',
        'authority: current',
        'kind: architecture',
        'id: architecture:react-component-runtime',
        '---',
        '',
        '# React component runtime',
        '',
        '<!-- review-applicability:v1 -->',
        '',
        '```json',
        JSON.stringify({
          scope: 'global',
          triggers: {styling: ['INV2']},
          concerns: {
            effects: {patterns: ['\\buseEffect\\b'], claims: ['INV1']},
          },
        }),
        '```',
        '',
        '## Requirements',
        '',
        '- **INV1 — Effects clean up.** Detail.',
        '- **INV2 — Styles stay static.** Detail.',
        '',
      ].join('\n'),
    );
    write(root, 'packages/core/src/A/A.tsx', 'export function A() {}\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'base');
    const base = git(root, 'rev-parse', 'HEAD');
    git(root, 'update-ref', 'refs/remotes/origin/main', base);
    write(root, 'packages/core/src/A/A.tsx', source);
    git(root, 'commit', '-q', '-am', 'head');
    return {root, base, head: git(root, 'rev-parse', 'HEAD')};
  }

  function route({root, base, head}) {
    return JSON.parse(
      execFileSync(
        'node',
        [
          path.join(ROOT, 'scripts/review-global-baselines.mjs'),
          '--root',
          root,
          '--authority-commit',
          base,
          '--review-head',
          head,
          '--triggers',
          'styling',
        ],
        {encoding: 'utf8'},
      ),
    );
  }

  it("routes a concern the head's added lines match, beside the requested triggers", () => {
    const result = route(
      repository(
        'export function A() {\n  useEffect(() => () => {}, []);\n}\n',
      ),
    );
    expect(result.matches.map(match => match.claimId)).toEqual(['INV2']);
    expect(result.concernMatches).toEqual([
      expect.objectContaining({
        recordId: 'architecture:react-component-runtime',
        concern: 'effects',
        claimId: 'INV1',
        evidence: [
          expect.objectContaining({
            file: 'packages/core/src/A/A.tsx',
            line: 2,
            matched: 'useEffect',
          }),
        ],
      }),
    ]);
  });

  it('routes no concern when no added line matches', () => {
    const result = route(
      repository('export function A() {\n  return null;\n}\n'),
    );
    expect(result.concernMatches).toEqual([]);
  });
});
