// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contracts for the public API tag-along check.
 * @input Fixture API changes, pull request titles and bodies, component folders
 * @output Scope parsing, per-component grouping, tag-along rows, size, exit codes
 * @position Regression tests for `.github/scripts/api-tagalong.mjs`
 */

import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  analyze,
  componentsByPackage,
  parseScope,
  renderSummary,
} from './api-tagalong.mjs';

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'api-tagalong.mjs',
);

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

let tmp;
let root;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'api-tagalong-'));
  root = tmp;
  for (const dir of [
    'packages/core/src/Item',
    'packages/core/src/ItemGroup',
    'packages/core/src/List',
    'packages/core/src/Table',
    'packages/core/src/Tab',
    'packages/core/src/Button',
    'packages/core/src/Icon',
    'packages/core/src/Collapsible',
    'packages/core/src/hooks',
    'packages/lab/src/Integration',
    'packages/lab/src/__tests__',
    'packages/cli/src/IconSet',
  ])
    fs.mkdirSync(path.join(root, dir), {recursive: true});
  fs.writeFileSync(path.join(root, 'packages/core/src/index.ts'), '');
});

afterAll(() => fs.rmSync(tmp, {recursive: true, force: true}));

const row = (item, member = null, change = 'added') => ({
  change,
  entry: '.',
  section: 'Types',
  item,
  member,
  line: member ? `prop ${member}?: unknown` : item,
  usage: '',
});

const changesFile = packages => ({version: 2, baseRecord: 'main', packages});
const pkg = (name, rows) => ({pkg: name, rows});

/** The changes of an integration import that also adds Item's onClick. */
const integrationImport = changesFile([
  pkg('@astryxdesign/core', [
    row('component Item', 'onClick'),
    row('interface ItemProps', 'onClick'),
  ]),
  pkg('@astryxdesign/lab', [
    row('component Integration'),
    row('interface IntegrationProps'),
    row('type IntegrationConfig'),
    row('function IntegrationManifest'),
  ]),
]);
const integrationTitle =
  'feat(integrations): import the config and integration API';

const body = scopeLines =>
  [
    '## Summary',
    '',
    'Text.',
    '',
    '## Scope',
    '',
    ...scopeLines,
    '',
    '## Testing',
    '',
    'Ran it.',
  ].join('\n');

const run = input =>
  analyze({components: componentsByPackage(root), files: 0, ...input});

describe('scope', () => {
  it('reads component scopes from the conventional-commit title', () => {
    expect(
      parseScope({title: 'feat(Table): sort rows', body: ''}).scope,
    ).toEqual(['Table']);
    expect(
      parseScope({title: 'fix(Item, List): keep focus', body: ''}).scope,
    ).toEqual(['Item', 'List']);
  });

  it('keeps every title scope entry, and a plain type has none', () => {
    expect(parseScope({title: 'fix(core): x', body: ''}).scope).toEqual([
      'core',
    ]);
    expect(parseScope({title: integrationTitle, body: ''}).scope).toEqual([
      'integrations',
    ]);
    expect(parseScope({title: 'ci: x', body: ''}).scope).toEqual([]);
  });

  it('adds the Components line under the Scope heading and ignores template comments', () => {
    const {scope} = parseScope({
      title: 'feat(Table): x',
      body: body([
        'Components: Integration, `Item` <!-- note -->',
        '- [ ] No intended public API change.',
      ]),
    });
    expect(scope).toEqual(['Table', 'Integration', 'Item']);
    expect(
      parseScope({
        title: 'ci: x',
        body: body([
          'Components: <!-- the components and modules this PR changes, comma-separated -->',
        ]),
      }).scope,
    ).toEqual([]);
  });

  it('reads a Components line only under the Scope heading', () => {
    expect(
      parseScope({title: 'ci: x', body: 'Components: Item\n\n## Scope\n\nnone'})
        .scope,
    ).toEqual([]);
  });
});

describe('grouping', () => {
  it("finds each registered package's own component folders", () => {
    expect(componentsByPackage(root)).toEqual({
      '@astryxdesign/core': [
        'Button',
        'Collapsible',
        'Icon',
        'Item',
        'ItemGroup',
        'List',
        'Tab',
        'Table',
      ],
      '@astryxdesign/lab': ['Integration'],
    });
  });

  it("names the components the registry finds inside other components' folders", () => {
    const core = componentsByPackage(REPO)['@astryxdesign/core'];
    for (const name of ['Table', 'TableRow', 'List', 'ListItem', 'Theme'])
      expect(core).toContain(name);
  });

  it('files a nested component under its own name, not its folder', () => {
    const components = {
      '@astryxdesign/core': ['List', 'ListItem', 'Table', 'TableRow'],
    };
    const tableRow = analyze({
      components,
      changes: changesFile([
        pkg('@astryxdesign/core', [
          row('component TableRow', 'status'),
          row('type TableRowStatus'),
        ]),
      ]),
      title: 'fix(TableRow): add a status prop',
      body: '',
    });
    expect(Object.keys(tableRow.rows_by_component)).toEqual(['TableRow']);
    expect(tableRow.tagalongs).toEqual({});
    const listItem = analyze({
      components,
      changes: changesFile([
        pkg('@astryxdesign/core', [row('interface ListItemProps', 'tone')]),
      ]),
      title: 'fix(ListItem): x',
      body: '',
    });
    expect(listItem.tagalongs).toEqual({});
    const list = analyze({
      components,
      changes: changesFile([
        pkg('@astryxdesign/core', [row('interface ListItemProps', 'tone')]),
      ]),
      title: 'fix(List): x',
      body: '',
    });
    expect(Object.keys(list.tagalongs)).toEqual(['ListItem']);
  });

  it("matches a row only against its own package's components", () => {
    const result = run({
      changes: changesFile([
        pkg('@astryxdesign/cli', [
          row('interface IconSetAdapter'),
          row('interface IconSetAdapter', 'resolve'),
        ]),
      ]),
      title: 'feat(cli): add icon set adapters',
      body: body(['Components: cli']),
    });
    expect(Object.keys(result.rows_by_component)).toEqual([
      '@astryxdesign/cli',
    ]);
    expect(result.tagalongs).toEqual({});
  });

  it("groups a component's own hooks and factories under it", () => {
    const result = run({
      changes: changesFile([
        pkg('@astryxdesign/core', [
          row('hook useItemState'),
          row('function createTableModel'),
          row('function isListItem'),
        ]),
      ]),
      title: 'feat(core): x',
      body: '',
    });
    expect(Object.keys(result.rows_by_component).sort()).toEqual([
      'Item',
      'List',
      'Table',
    ]);
  });

  it('groups a row under the component with the longest matching name', () => {
    const result = run({
      changes: changesFile([
        pkg('@astryxdesign/core', [
          row('interface ItemProps', 'onClick'),
          row('interface ItemGroupProps', 'gap'),
          row('component ItemGroup'),
          row('interface TableProps', 'dense'),
          row('type TabOrientation'),
        ]),
      ]),
      title: 'feat(Item): x',
      body: '',
    });
    expect(Object.keys(result.rows_by_component).sort()).toEqual([
      'Item',
      'ItemGroup',
      'Tab',
      'Table',
    ]);
    expect(result.rows_by_component.Item.map(r => r.name)).toEqual([
      'ItemProps',
    ]);
    expect(result.rows_by_component.ItemGroup).toHaveLength(2);
  });

  it('groups a row with no component under its package', () => {
    const result = run({
      changes: changesFile([
        pkg('@astryxdesign/core', [
          row('hook useThemeMode'),
          row('var --color-accent (core.css)'),
        ]),
      ]),
      title: 'feat(core): x',
      body: '',
    });
    expect(Object.keys(result.rows_by_component)).toEqual([
      '@astryxdesign/core',
    ]);
  });

  it('does not match a component name followed by a lowercase letter', () => {
    const result = run({
      changes: changesFile([pkg('@astryxdesign/core', [row('type Tabular')])]),
      title: 'feat(Tab): x',
      body: '',
    });
    expect(Object.keys(result.rows_by_component)).toEqual([
      '@astryxdesign/core',
    ]);
  });
});

describe('tag-alongs', () => {
  it('flags Item when an integration import with no component scope adds its onClick', () => {
    const result = run({
      changes: integrationImport,
      title: integrationTitle,
      body: '',
    });
    expect(result.scope).toEqual(['integrations']);
    expect(result.tagalongs.Item.map(r => `${r.name}.${r.member}`)).toEqual([
      'Item.onClick',
      'ItemProps.onClick',
    ]);
    expect(result.tagalongs.Integration).toHaveLength(4);
  });

  it('has no tag-alongs when the Scope section names Integration and Item', () => {
    const result = run({
      changes: integrationImport,
      title: integrationTitle,
      body: body(['Components: Integration, Item']),
    });
    expect(result.scope).toEqual(['integrations', 'Integration', 'Item']);
    expect(result.tagalongs).toEqual({});
    expect(result.rows_by_component.Item).toHaveLength(2);
  });

  it('accepts a row named anywhere under the Scope heading', () => {
    const result = run({
      changes: integrationImport,
      title: integrationTitle,
      body: body([
        'Components: Integration',
        '',
        'Also adds `ItemProps.onClick` and `Item` onClick (owner approved).',
      ]),
    });
    expect(result.tagalongs).toEqual({});
  });

  it('does not accept a row named only outside the Scope heading', () => {
    const result = run({
      changes: integrationImport,
      title: integrationTitle,
      body: `Adds Item onClick.\n\n${body(['Components: Integration'])}`,
    });
    expect(Object.keys(result.tagalongs)).toEqual(['Item']);
  });

  it('keeps every component of a multi-component title in scope', () => {
    const result = run({
      changes: changesFile([
        pkg('@astryxdesign/core', [
          row('interface ItemProps', 'size', 'changed'),
          row('interface ListProps', 'gap', 'removed'),
          row('interface ButtonProps', 'tone'),
        ]),
      ]),
      title: 'fix(Item, List): align rows',
      body: '',
    });
    expect(result.scope).toEqual(['Item', 'List']);
    expect(Object.keys(result.tagalongs)).toEqual(['Button']);
  });

  it('accepts a package-level row whose name starts with a named scope entry', () => {
    const result = run({
      changes: changesFile([
        pkg('@astryxdesign/lab', [
          row('type ConnectorRegistry'),
          row('type Connectors'),
        ]),
      ]),
      title: 'chore: x',
      body: body(['Components: Connector']),
    });
    expect(Object.keys(result.rows_by_component)).toEqual([
      '@astryxdesign/lab',
    ]);
    expect(result.tagalongs['@astryxdesign/lab'].map(r => r.name)).toEqual([
      'Connectors',
    ]);
  });
});

describe('change kinds and case', () => {
  it('never lists a removed row as a tag-along', () => {
    const result = run({
      changes: changesFile([
        pkg('@astryxdesign/core', [
          row('interface ButtonProps', 'tone', 'removed'),
          row('interface ButtonProps', 'size', 'changed'),
        ]),
      ]),
      title: 'fix(List): x',
      body: '',
    });
    expect(result.rows_by_component.Button).toHaveLength(2);
    expect(result.tagalongs.Button.map(r => r.member)).toEqual(['size']);
  });

  it('matches scope names in any case', () => {
    const result = run({
      changes: changesFile([
        pkg('@astryxdesign/core', [
          row('interface ItemProps', 'size'),
          row('interface ButtonProps', 'tone'),
          row('var --color-accent (core.css)'),
        ]),
      ]),
      title: 'fix(item): x',
      body: body(['Components: button, CORE']),
    });
    expect(result.tagalongs).toEqual({});
  });
});

describe('own types, removed-only, and decided rows', () => {
  it("groups a component's Use-prefixed types under it", () => {
    const result = run({
      changes: changesFile([
        pkg('@astryxdesign/core', [
          row('interface UseCollapsibleOptions', 'defaultOpen'),
          row('type UseCollapsibleReturn'),
          row('hook useCollapsible'),
        ]),
      ]),
      title: 'fix(Collapsible): x',
      body: '',
    });
    expect(Object.keys(result.rows_by_component)).toEqual(['Collapsible']);
    expect(result.tagalongs).toEqual({});
  });

  it('labels a component whose only rows are removed', () => {
    const result = run({
      changes: changesFile([
        pkg('@astryxdesign/core', [
          row('interface ButtonProps', 'tone', 'removed'),
          row('interface ListProps', 'gap'),
        ]),
      ]),
      title: 'fix(List): x',
      body: '',
    });
    const table = renderSummary(result);
    expect(table).toMatch(/\| Button \| 1 \| removed only \|/);
    expect(table).toMatch(/\| List \| 1 \| yes \|/);
  });

  it('lists a row a current record decides as outside the scope, not as a tag-along', () => {
    const result = run({
      changes: integrationImport,
      title: integrationTitle,
      body: body(['Components: Integration']),
      decided: ['ItemProps.onClick', 'Item'],
    });
    expect(result.tagalongs).toEqual({});
    expect(result.decided.Item.map(r => `${r.name}.${r.member}`)).toEqual([
      'Item.onClick',
      'ItemProps.onClick',
    ]);
    expect(renderSummary(result)).toMatch(
      /\| Item \| 2 \| outside the scope: 2 rows a current record decides \|/,
    );
  });

  it('counts an undecided row as a tag-along beside a decided one', () => {
    const result = run({
      changes: integrationImport,
      title: integrationTitle,
      body: body(['Components: Integration']),
      decided: ['ItemProps.onClick'],
    });
    expect(result.tagalongs.Item.map(r => r.name)).toEqual(['Item']);
    expect(result.decided.Item.map(r => r.name)).toEqual(['ItemProps']);
    expect(renderSummary(result)).toMatch(
      /\| Item \| 2 \| no: 1 tag-along row; 1 row a current record decides \|/,
    );
  });
});

describe('theme targets and template prose', () => {
  const components = {
    '@astryxdesign/core': [
      'AlertDialog',
      'Button',
      'Layout',
      'Text',
      'TextArea',
    ],
  };
  const target = (name, owner) => ({
    ...row(`target ${name} (${owner})`),
    entry: 'Theme targets',
    section: '',
  });

  it('files a theme target under the exact component it names', () => {
    const result = analyze({
      components,
      changes: changesFile([
        pkg('@astryxdesign/core', [target('alert-dialog', 'AlertDialog')]),
      ]),
      title: 'fix(AlertDialog): x',
      body: '',
    });
    expect(Object.keys(result.rows_by_component)).toEqual(['AlertDialog']);
    expect(result.tagalongs).toEqual({});
  });

  it("never lets a component cover another component's target by prefix", () => {
    const result = analyze({
      components,
      changes: changesFile([
        pkg('@astryxdesign/core', [target('text-area', 'TextArea')]),
      ]),
      title: 'fix(Text): x',
      body: '',
    });
    expect(Object.keys(result.tagalongs)).toEqual(['TextArea']);
  });

  it('does not read the template checklist as naming rows', () => {
    const template = fs.readFileSync(
      path.join(REPO, '.github/pull_request_template.md'),
      'utf8',
    );
    const filled = template.replace(/^Components:.*$/m, 'Components: Button');
    expect(filled).toMatch(/text and artifacts/);
    expect(filled).toMatch(/layout/);
    const result = analyze({
      components,
      changes: changesFile([
        pkg('@astryxdesign/core', [
          target('text', 'Text'),
          target('layout', 'Layout'),
          row('interface ButtonProps', 'tone'),
        ]),
      ]),
      title: 'fix(Button): x',
      body: filled,
    });
    expect(Object.keys(result.tagalongs).sort()).toEqual(['Layout', 'Text']);
  });
});

describe('member names in code spans', () => {
  it('names only that member when a code span names Name.member', () => {
    const result = run({
      changes: changesFile([
        pkg('@astryxdesign/core', [
          row('interface ItemProps', 'onClick'),
          row('interface ItemProps', 'size', 'changed'),
          row('hook useItemState'),
        ]),
      ]),
      title: 'fix(List): x',
      body: body(['Components: List', '', 'Also adds `ItemProps.onClick`.']),
    });
    expect(result.tagalongs.Item.map(r => `${r.name}.${r.member}`)).toEqual([
      'ItemProps.size',
      'useItemState.null',
    ]);
  });
});

describe('size', () => {
  const many = (n, name = 'Item') =>
    Array.from({length: n}, (_, i) => row(`interface ${name}Props`, `p${i}`));

  it('is big with more than 3 components', () => {
    const rows = [
      row('type ItemA'),
      row('type ListA'),
      row('type TableA'),
      row('type ButtonA'),
    ];
    expect(
      run({
        changes: changesFile([pkg('@astryxdesign/core', rows.slice(0, 3))]),
        title: 'x: y',
        body: '',
      }).big,
    ).toBe(false);
    expect(
      run({
        changes: changesFile([pkg('@astryxdesign/core', rows)]),
        title: 'x: y',
        body: '',
      }).big,
    ).toBe(true);
  });

  it('is big with more than 10 rows', () => {
    expect(
      run({
        changes: changesFile([pkg('@astryxdesign/core', many(10))]),
        title: 'x: y',
        body: '',
      }).big,
    ).toBe(false);
    expect(
      run({
        changes: changesFile([pkg('@astryxdesign/core', many(11))]),
        title: 'x: y',
        body: '',
      }).big,
    ).toBe(true);
  });

  it('is big with more than 100 changed files', () => {
    const changes = changesFile([pkg('@astryxdesign/core', many(1))]);
    expect(run({changes, title: 'x: y', body: '', files: 100}).big).toBe(false);
    expect(run({changes, title: 'x: y', body: '', files: 101}).big).toBe(true);
  });
});

describe('command line', () => {
  const write = (name, text) => {
    const file = path.join(tmp, name);
    fs.writeFileSync(file, text);
    return file;
  };

  it('prints the result, writes the summary table, and exits 0', () => {
    const changes = write('changes.json', JSON.stringify(integrationImport));
    const bodyFile = write('body.md', body(['Components: Integration']));
    const summary = path.join(tmp, 'summary.md');
    const out = execFileSync(
      process.execPath,
      [
        SCRIPT,
        '--changes',
        changes,
        '--title',
        integrationTitle,
        '--body-file',
        bodyFile,
        '--root',
        root,
        '--files',
        '3330',
        '--summary',
        summary,
      ],
      {encoding: 'utf8'},
    );
    const result = JSON.parse(out);
    expect(result.version).toBe(1);
    expect(result.big).toBe(true);
    expect(Object.keys(result.tagalongs)).toEqual(['Item']);
    const table = fs.readFileSync(summary, 'utf8');
    expect(table).toContain('| Component | Rows | In scope |');
    expect(table).toMatch(/\| Integration \| 4 \| yes \|/);
    expect(table).toMatch(/\| Item \| 2 \| no: 2 tag-along rows \|/);
  });

  it('exits 2 when the changes file is missing or unreadable', () => {
    const missing = spawnSync(
      process.execPath,
      [
        SCRIPT,
        '--changes',
        path.join(tmp, 'nope.json'),
        '--title',
        'ci: x',
        '--root',
        root,
      ],
      {encoding: 'utf8'},
    );
    expect(missing.status).toBe(2);
    const broken = write('broken.json', '{not json');
    const unreadable = spawnSync(
      process.execPath,
      [SCRIPT, '--changes', broken, '--title', 'ci: x', '--root', root],
      {encoding: 'utf8'},
    );
    expect(unreadable.status).toBe(2);
    const noFlag = spawnSync(process.execPath, [SCRIPT, '--title', 'ci: x'], {
      encoding: 'utf8',
    });
    expect(noFlag.status).toBe(2);
  });
});
