// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract: merge-guard's scope-overlap check lists the browser
 *   accessibility specs main added or changed that select a pull request's
 *   changes but are not at its head.
 *
 * A pull request's runs use the head's specs. A table-tree change merged green
 * while main had added a Table focus-ring spec whose scope covers it, because
 * no file overlapped and the branch never took main's spec.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

import {
  overlappingSpecs,
  selectingScope,
  touchedComponents,
  VERSION,
} from './a11y-scope-overlap.mjs';

const SCRIPT = path.join(import.meta.dirname, 'a11y-scope-overlap.mjs');

// The table-tree change, and the focus-ring spec main added meanwhile.
const TREE_CHANGE = [
  'packages/core/src/Table/plugins/tree/useTableTreeData.tsx',
  'packages/core/src/Table/plugins/tree/useTableTreeData.test.tsx',
  'packages/core/src/Table/useTableTreeData.doc.mjs',
  'docs/specs/components/Table/plugins/tree/useTableTreeData.spec.md',
  '.changeset/table-tree-row-aria-expanded.md',
];
const FOCUS_RING =
  'packages/core/src/Table/__tests__/TableFocusRing.a11y.chromium.spec.ts';
const FOCUS_RING_SOURCE = `// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Table/|packages/core/src/utils/focusOutline|apps/storybook/stories/Table(Tree)?\\.stories)
test('…', () => {});
`;

describe('overlappingSpecs', () => {
  it('lists a scoped spec main added that covers the change, and the head lacks', () => {
    expect(
      overlappingSpecs(
        [
          {
            path: FOCUS_RING,
            status: 'added',
            mainSource: FOCUS_RING_SOURCE,
            headSource: null,
          },
        ],
        TREE_CHANGE,
      ),
    ).toEqual([
      {
        path: FOCUS_RING,
        reason: 'added-on-main',
        scope:
          'changed packages/core/src/Table/plugins/tree/useTableTreeData.tsx',
      },
    ]);
  });

  it('lists a spec main changed, and leaves out one the head already has', () => {
    const changed = {
      path: FOCUS_RING,
      status: 'changed',
      mainSource: FOCUS_RING_SOURCE,
      headSource: `${FOCUS_RING_SOURCE}// older\n`,
    };
    expect(overlappingSpecs([changed], TREE_CHANGE)).toMatchObject([
      {path: FOCUS_RING, reason: 'changed-on-main'},
    ]);
    expect(
      overlappingSpecs(
        [{...changed, headSource: FOCUS_RING_SOURCE}],
        TREE_CHANGE,
      ),
    ).toEqual([]);
  });

  it('leaves out a spec whose scope does not cover the change', () => {
    const tabs = 'packages/core/src/Tabs/__tests__/Tabs.a11y.chromium.spec.ts';
    expect(
      overlappingSpecs(
        [
          {
            path: tabs,
            status: 'added',
            mainSource: 'test();\n',
            headSource: null,
          },
        ],
        TREE_CHANGE,
      ),
    ).toEqual([]);
  });

  it('counts an audit spec by the folder that owns it', () => {
    const audit =
      'packages/core/src/Table/__tests__/TableAudit.a11y.chromium.spec.ts';
    expect(
      selectingScope(audit, '// @pr-a11y audit Table\n', TREE_CHANGE),
    ).toBe('owner packages/core/src/Table/');
    expect(
      selectingScope(audit, '// @pr-a11y audit Table\n', [
        'packages/core/src/Tabs/Tabs.tsx',
      ]),
    ).toBeNull();
  });

  it('reads the touched components from changed source, never from a record', () => {
    expect(touchedComponents(TREE_CHANGE)).toEqual(['core/Table']);
    expect(
      touchedComponents(['packages/core/src/Table/TableRow.tsx']).sort(),
    ).toEqual(['core/Table', 'core/TableRow']);
  });
});

describe('the command merge-guard runs', () => {
  it('prints version 1 JSON for a merge base, main and a head', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-overlap-'));
    const run = (...args) =>
      execFileSync('git', args, {cwd: dir, encoding: 'utf8'}).trim();
    try {
      run('init', '-q', '-b', 'main');
      run('config', 'user.email', 't@example.com');
      run('config', 'user.name', 't');
      const write = (file, text) => {
        fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true});
        fs.writeFileSync(path.join(dir, file), text);
      };
      write(TREE_CHANGE[0], 'export const a = 1;\n');
      run('add', '-A');
      run('commit', '-qm', 'base');
      const base = run('rev-parse', 'HEAD');
      write(FOCUS_RING, FOCUS_RING_SOURCE);
      run('add', '-A');
      run('commit', '-qm', 'main adds the spec');
      const main = run('rev-parse', 'HEAD');
      run('checkout', '-q', '-b', 'pr', base);
      write(TREE_CHANGE[0], 'export const a = 2;\n');
      run('commit', '-qam', 'the change');
      const head = run('rev-parse', 'HEAD');
      const paths = path.join(dir, 'paths.txt');
      fs.writeFileSync(paths, `${TREE_CHANGE[0]}\n`);
      const out = execFileSync(
        process.execPath,
        [
          SCRIPT,
          '--base',
          base,
          '--main',
          main,
          '--head',
          head,
          '--paths-file',
          paths,
        ],
        {cwd: dir, encoding: 'utf8'},
      );
      expect(JSON.parse(out)).toEqual({
        version: VERSION,
        specs: [
          {
            path: FOCUS_RING,
            reason: 'added-on-main',
            scope: `changed ${TREE_CHANGE[0]}`,
          },
        ],
      });
      expect(VERSION).toBe(1);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});
