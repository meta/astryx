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

import ts from 'typescript';

import {
  codeKey,
  loadSameCode,
  overlappingSpecs,
  renders,
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
// Button is a shared primitive; ChatSendButton renders it.
const GRAPH = {
  primitives: ['core/Button', 'core/IconButton'],
  importers: new Map([
    [
      'packages/core/src/Button/Button.tsx',
      new Set(['packages/core/src/Chat/ChatSendButton.tsx']),
    ],
  ]),
};
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
        GRAPH,
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
    expect(overlappingSpecs([changed], TREE_CHANGE, GRAPH)).toMatchObject([
      {path: FOCUS_RING, reason: 'changed-on-main'},
    ]);
    expect(
      overlappingSpecs(
        [{...changed, headSource: FOCUS_RING_SOURCE}],
        TREE_CHANGE,
        GRAPH,
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
        GRAPH,
      ),
    ).toEqual([]);
  });

  it("lists an audit main added that a shared primitive's change owes", () => {
    const chat =
      'packages/core/src/Chat/__tests__/ChatSendButtonAudit.a11y.chromium.spec.ts';
    const added = {
      path: chat,
      status: 'added',
      mainSource: '// @pr-a11y audit ChatSendButton\n',
      headSource: null,
    };
    expect(
      overlappingSpecs([added], ['packages/core/src/Button/Button.tsx'], GRAPH),
    ).toEqual([
      {path: chat, reason: 'added-on-main', scope: 'owed audit of core/Chat'},
    ]);
    // A test-only change to Button renders nothing, so it owes no audit.
    expect(
      overlappingSpecs(
        [added],
        ['packages/core/src/Button/Button.test.tsx'],
        GRAPH,
      ),
    ).toEqual([]);
  });

  it("counts a component's own audit only for a change to its rendered source", () => {
    const audit =
      'packages/core/src/Table/__tests__/TableAudit.a11y.chromium.spec.ts';
    const added = {
      path: audit,
      status: 'added',
      mainSource: '// @pr-a11y audit Table\n',
      headSource: null,
    };
    expect(overlappingSpecs([added], TREE_CHANGE, GRAPH)).toMatchObject([
      {path: audit, scope: 'owed audit of core/Table'},
    ]);
    expect(
      overlappingSpecs(
        [added],
        [
          'packages/core/src/Table/Table.doc.mjs',
          'docs/specs/components/Table/Table.spec.md',
        ],
        GRAPH,
      ),
    ).toEqual([]);
    expect(
      selectingScope(
        audit,
        '// @pr-a11y audit Table\n',
        TREE_CHANGE,
        new Set(),
      ),
    ).toBeNull();
  });

  it('lists a changed always spec only for a pull request with the run label', () => {
    const always = 'internal/a11y-spec/src/patterns/landmarks.chromium.spec.ts';
    const changed = [
      {
        path: always,
        status: 'changed',
        mainSource: '// @pr-a11y always\n',
        headSource: 'older\n',
      },
    ];
    expect(overlappingSpecs(changed, ['README.md'], GRAPH)).toEqual([]);
    expect(
      overlappingSpecs(changed, ['README.md'], {...GRAPH, labelled: true}),
    ).toEqual([{path: always, reason: 'changed-on-main', scope: 'always'}]);
  });

  it('leaves out every spec for a change to unit tests only', () => {
    // A Layout spec whose scope names the Table folder, added on main.
    const corners =
      'packages/core/src/Layout/__tests__/ContainerCorners.a11y.chromium.spec.ts';
    const added = {
      path: corners,
      status: 'added',
      mainSource:
        '// @pr-a11y scope ^(packages/core/src/(Layout|Table)/|apps/storybook/stories/ContainerCorners\\.stories)\n',
      headSource: null,
    };
    expect(
      overlappingSpecs(
        [added],
        [
          'packages/core/src/Table/plugins/tree/useTableTreeData.test.tsx',
          'packages/core/src/Table/__tests__/TableTree.a11y.chromium.spec.ts',
        ],
        GRAPH,
      ),
    ).toEqual([]);
    expect(
      overlappingSpecs([added], ['packages/core/src/Table/Table.tsx'], GRAPH),
    ).toMatchObject([{path: corners, reason: 'added-on-main'}]);
    expect(renders('packages/core/src/Table/Table.tsx')).toBe(true);
    // A shared fixture under __tests__/ that stories import still counts.
    const tableSpec =
      'packages/core/src/Table/__tests__/Table.a11y.chromium.spec.ts';
    expect(
      overlappingSpecs(
        [
          {
            path: tableSpec,
            status: 'changed',
            mainSource: '// @pr-a11y scope ^packages/core/src/Table/\n',
            headSource: 'older\n',
          },
        ],
        ['packages/core/src/Table/__tests__/Table.a11y.renders.tsx'],
        GRAPH,
      ),
    ).toMatchObject([{path: tableSpec, reason: 'changed-on-main'}]);
    expect(renders('apps/storybook/stories/Table.stories.tsx')).toBe(true);
  });

  it('leaves out a spec main changed only in comments or whitespace', async () => {
    const sameCode = await loadSameCode();
    const head = `${FOCUS_RING_SOURCE}test('opens', async ({page}) => {\n  await page.goto(\`/x?\${id}\`);\n});\n`;
    const changed = mainSource => [
      {path: FOCUS_RING, status: 'changed', mainSource, headSource: head},
    ];
    const listed = mainSource =>
      overlappingSpecs(changed(mainSource), TREE_CHANGE, {...GRAPH, sameCode});
    // A reworded comment and reformatted code run the same tests.
    expect(
      listed(
        head
          .replace(
            "test('opens'",
            "/**\n * Opens the page, reworded.\n * @see the story\n */\n// Opens the page.\ntest(\n  'opens'",
          )
          .replace('});\n', '}); /* done */\n'),
      ),
    ).toEqual([]);
    // A changed assertion, string, template text or routing line is listed.
    for (const mainSource of [
      head.replace("'opens'", "'opens twice'"),
      head.replace('/x?', '/y?'),
      head.replace('/x?', '/x ?'),
      head.replace(
        '@pr-a11y scope ^(packages/core/src/Table/',
        '@pr-a11y scope ^(packages/core/src/Tables/',
      ),
    ]) {
      expect(listed(mainSource), mainSource).toHaveLength(1);
    }
    // A spec the head lacks is always listed.
    expect(
      overlappingSpecs(
        [
          {
            path: FOCUS_RING,
            status: 'added',
            mainSource: head,
            headSource: null,
          },
        ],
        TREE_CHANGE,
        {...GRAPH, sameCode},
      ),
    ).toHaveLength(1);
  });

  it('keeps a line break that changes the program', () => {
    const value = 'function f() {\n  return x;\n}\n';
    expect(codeKey(ts, value.replace('return x', 'return\n  x'))).not.toBe(
      codeKey(ts, value),
    );
    expect(codeKey(ts, `/** Says what f does. */\n${value}`)).toBe(
      codeKey(ts, `/** Says it better. */\n${value}`),
    );
  });

  it('keys a spec by its tokens and routing lines', () => {
    const key = codeKey(ts, FOCUS_RING_SOURCE);
    expect(codeKey(ts, `${FOCUS_RING_SOURCE}\n\n`)).toBe(key);
    expect(
      codeKey(ts, FOCUS_RING_SOURCE.replace('scope ^(', 'scope ^(apps/|')),
    ).not.toBe(key);
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
      write(
        '.github/a11y-shared-primitives.json',
        JSON.stringify({primitives: GRAPH.primitives}),
      );
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

      // An empty list of changed paths is unknown, not "no overlap".
      const empty = path.join(dir, 'empty.txt');
      fs.writeFileSync(empty, '\n');
      expect(() =>
        execFileSync(
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
            empty,
          ],
          {cwd: dir, encoding: 'utf8', stdio: 'pipe'},
        ),
      ).toThrow();

      // A routing line main cannot read makes the answer unknown: a non-zero
      // exit, which merge-guard treats as overlap.
      run('checkout', '-q', 'main');
      write(FOCUS_RING, '// @pr-a11y nonsense\n');
      run('commit', '-qam', 'main breaks the routing line');
      const broken = run('rev-parse', 'HEAD');
      expect(() =>
        execFileSync(
          process.execPath,
          [
            SCRIPT,
            '--base',
            base,
            '--main',
            broken,
            '--head',
            head,
            '--paths-file',
            paths,
          ],
          {cwd: dir, encoding: 'utf8', stdio: 'pipe'},
        ),
      ).toThrow();
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});
