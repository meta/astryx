// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {
  GLOBAL_REVIEW_TRIGGERS,
  collectGlobalReviewMatches,
} from './check-knowledge.mjs';
import {
  findUnreachedRecords,
  findUnroutedFiles,
  loadKnowledgeIndex,
  resolveSpecsForFile,
  formatResult,
} from './specs-for-file.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

function fixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-specs-for-'));
  roots.push(root);
  return root;
}

function write(root, relative, content = '') {
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), {recursive: true});
  fs.writeFileSync(absolute, content);
}

function frontmatterValue(value) {
  return Array.isArray(value) ? `[${value.join(', ')}]` : String(value);
}

function writeRecord(root, relative, fields, body = '') {
  const lines = Object.entries({authority: 'current', ...fields}).map(
    ([key, value]) => `${key}: ${frontmatterValue(value)}`,
  );
  write(root, relative, `---\n${lines.join('\n')}\n---\n\n# Record\n${body}`);
}

function globalBlock(triggers) {
  return [
    '',
    '<!-- review-applicability:v1 -->',
    '',
    '```json',
    JSON.stringify({scope: 'global', triggers}),
    '```',
    '',
    '## Requirements',
    '',
    ...Object.values(triggers)
      .flat()
      .map(id => `- **${id} — Claim ${id}.** Detail.`),
    '',
  ].join('\n');
}

/**
 * A small repository: Popover (component + family + architecture + deciding
 * spec), a Dialog module directory, a tooling architecture, and a docs topic.
 */
function popoverFixture() {
  const root = fixtureRoot();
  write(root, 'packages/core/src/Popover/Popover.tsx');
  write(root, 'packages/core/src/Popover/Popover.test.tsx');
  write(
    root,
    'packages/core/src/Popover/Popover.doc.mjs',
    "export const docs = {name: 'Popover', usage: {anatomy: [{name: 'Table'}]}, components: [{name: 'PopoverTrigger', description: 'Opens it.'}, {name: 'Item'}]};\n",
  );
  writeRecord(root, 'packages/core/src/Popover/Popover.spec.md', {
    kind: 'component',
    id: 'component:Popover',
    review_triggers: ['behavior', 'layering'],
    verified_by: ['packages/core/src/Popover/Popover.test.tsx'],
    families: ['family:overlay-dismissal'],
    architecture: ['architecture:layer-runtime'],
    modules: [],
  });
  writeRecord(root, 'docs/families/overlay-dismissal.md', {
    kind: 'family',
    id: 'family:overlay-dismissal',
    members: ['component:Popover', 'component:Tooltip'],
    architecture: [],
    deciding_specs: ['spec:AST-003'],
  });
  writeRecord(root, 'docs/architecture/layer-runtime.md', {
    kind: 'architecture',
    id: 'architecture:layer-runtime',
    applies_to: ['packages/core/src/Layer/'],
    verified_by: ['scripts/layer-check.mjs'],
    deciding_specs: [],
  });
  writeRecord(root, 'docs/specs/AST-003/spec.md', {
    kind: 'system-spec',
    id: 'spec:AST-003',
    affects_architecture: ['architecture:layer-runtime'],
    affects_families: [],
    affects_consumer_docs: [],
  });
  writeRecord(root, 'docs/specs/AST-013/spec.md', {
    kind: 'system-spec',
    id: 'spec:AST-013',
    affects_architecture: [],
    affects_families: [],
    affects_consumer_docs: ['Tooltip', 'browser-support'],
  });
  writeRecord(
    root,
    'docs/specs/AST-020/spec.md',
    {
      kind: 'system-spec',
      id: 'spec:AST-020',
      affects_architecture: [],
      affects_families: [],
      affects_consumer_docs: [],
    },
    globalBlock({behavior: ['FR1'], testing: ['FR2']}),
  );
  writeRecord(root, 'docs/specs/AST-090/spec.md', {
    kind: 'system-spec',
    id: 'spec:AST-090',
    authority: 'draft',
    affects_architecture: [],
    affects_families: ['family:overlay-dismissal'],
    affects_consumer_docs: [],
  });

  write(root, 'packages/core/src/Dialog/Dialog.tsx');
  write(root, 'packages/core/src/Dialog/modules/DialogHeader.tsx');
  write(root, 'packages/core/src/Dialog/modules/DialogHeader.test.tsx');
  write(root, 'packages/core/src/Dialog/modules/DialogFooter.tsx');
  writeRecord(root, 'packages/core/src/Dialog/modules/DialogHeader.spec.md', {
    kind: 'module',
    id: 'module:Dialog/DialogHeader',
    parent_component: 'component:Dialog',
    references: [],
  });
  writeRecord(root, 'packages/core/src/Dialog/modules/DialogBody.spec.md', {
    kind: 'module',
    id: 'module:Dialog/DialogBody',
    parent_component: 'component:Dialog',
    references: [],
  });
  write(root, 'packages/core/src/Table/plugins/activation/useActivation.ts');
  write(root, 'packages/core/src/Table/plugins/activation/helpers/key.ts');
  writeRecord(
    root,
    'packages/core/src/Table/plugins/activation/useTableActivation.spec.md',
    {
      kind: 'module',
      id: 'module:Table/useTableActivation',
      parent_component: 'component:Table',
      references: [],
    },
  );

  write(root, 'packages/core/src/Layer/Layer.tsx');
  write(root, 'packages/core/src/LayerProvider/LayerProvider.tsx');
  write(root, 'scripts/layer-check.mjs');
  write(root, 'packages/cli/assets/docs/browser-support.doc.mjs');
  write(root, 'packages/cli/assets/docs/tree/browser-support.doc.mjs');
  write(root, 'apps/docsite/src/content/blog/posts/release.md');
  writeRecord(root, 'docs/families/data-display.md', {
    kind: 'family',
    id: 'family:data-display',
    members: ['component:Table', 'component:Item', 'component:ChatHeadingItem'],
    architecture: [],
    deciding_specs: [],
  });
  write(root, 'packages/core/src/Drawer/Drawer.tsx');
  writeRecord(root, 'packages/core/src/Drawer/Drawer.spec.md', {
    kind: 'component',
    id: 'component:Drawer',
    authority: 'draft',
    review_triggers: ['motion'],
    verified_by: [],
    families: [],
    architecture: ['architecture:container-padding'],
    system_specs: ['spec:AST-017/DEC-1'],
    modules: [],
  });
  writeRecord(root, 'docs/architecture/container-padding.md', {
    kind: 'architecture',
    id: 'architecture:container-padding',
    applies_to: ['packages/core/src/Layout/'],
    verified_by: [],
    deciding_specs: [],
  });
  write(
    root,
    'packages/core/src/Chat/Chat.doc.mjs',
    "export const docs = {name: 'Chat'};\n",
  );
  write(root, 'packages/core/src/Chat/ChatMessageList.tsx');
  write(root, 'packages/core/src/Chat/ChatComposerDrawer.tsx');
  write(root, 'packages/core/src/Chat/ChatComposerDrawer.test.tsx');
  write(
    root,
    'packages/core/src/Chat/__tests__/ChatComposerDrawer.a11y.states.ts',
  );
  write(root, 'packages/core/src/Chat/ChatHeadingItem.tsx');
  writeRecord(root, 'packages/core/src/Chat/ChatComposerDrawer.spec.md', {
    kind: 'component',
    id: 'component:ChatComposerDrawer',
    review_triggers: ['motion'],
    verified_by: [],
    families: [],
    architecture: [],
    modules: [],
  });
  write(root, 'packages/core/src/Markdown/Markdown.tsx');
  write(root, 'packages/core/src/Markdown/plugins/headingLinks.ts');
  write(root, 'packages/core/src/Markdown/plugins/softBreaks.ts');
  writeRecord(root, 'packages/core/src/Markdown/modules/headingLinks.spec.md', {
    kind: 'module',
    id: 'module:Markdown/headingLinks',
    parent_component: 'component:Markdown',
    references: [],
  });
  writeRecord(root, 'packages/core/src/Markdown/modules/softBreaks.spec.md', {
    kind: 'module',
    id: 'module:Markdown/softBreaks',
    parent_component: 'component:Markdown',
    references: [],
  });
  write(root, 'packages/core/src/hooks/useMenuPress.ts');
  write(root, 'packages/core/src/hooks/useMenuPress.test.tsx');
  write(root, 'packages/core/src/hooks/useEntryAnimation.ts');
  write(
    root,
    'packages/core/src/hooks/useMenuPress.doc.mjs',
    "export const docs = {name: 'useMenuPress'};\n",
  );
  write(
    root,
    'packages/core/src/hooks/useEntryAnimation.doc.mjs',
    "export const docs = {name: 'useEntryAnimation'};\n",
  );
  writeRecord(
    root,
    'packages/core/src/DropdownMenu/modules/useMenuPress.spec.md',
    {
      kind: 'module',
      id: 'module:DropdownMenu/useMenuPress',
      parent_component: 'component:DropdownMenu',
      verified_by: ['packages/core/src/hooks/useMenuPress.test.tsx'],
      references: [],
    },
  );
  writeRecord(root, 'docs/specs/AST-014/spec.md', {
    kind: 'system-spec',
    id: 'spec:AST-014',
    affects_architecture: [],
    affects_families: [],
    affects_consumer_docs: ['useEntryAnimation'],
  });
  write(root, 'apps/sandbox/src/app/(fullscreen)/pages/perf/benchmark.test.ts');
  writeRecord(root, 'packages/core/src/Markdown/Markdown.spec.md', {
    kind: 'component',
    id: 'component:Markdown',
    review_triggers: ['behavior'],
    verified_by: [
      'apps/sandbox/src/app/(fullscreen)/pages/perf/benchmark.test.ts',
      'browser check of the rendered page',
    ],
    families: [],
    architecture: [],
    system_specs: ['spec:AST-017/FR3'],
    modules: [],
  });
  write(root, 'packages/cli/assets/docs/color.doc.mjs');
  write(root, 'packages/core/src/utils/color.ts');
  writeRecord(root, 'docs/specs/AST-008/spec.md', {
    kind: 'system-spec',
    id: 'spec:AST-008',
    affects_architecture: [],
    affects_families: [],
    affects_consumer_docs: ['color'],
  });
  write(root, 'packages/core/src/TabList/TabList.tsx');
  writeRecord(root, 'packages/core/src/TabList/TabList.spec.md', {
    kind: 'component',
    id: 'component:TabList',
    review_triggers: ['behavior'],
    verified_by: [],
    families: [],
    architecture: [],
    system_specs: ['spec:AST-017/DEC-1'],
    modules: [],
  });
  writeRecord(root, 'docs/specs/AST-017/spec.md', {
    kind: 'system-spec',
    id: 'spec:AST-017',
    affects_architecture: [],
    affects_families: [],
    affects_consumer_docs: [],
  });
  write(
    root,
    'scripts/fixture-heavy.test.mjs',
    "const record = 'docs/specs/AST-013/spec.md';\nconst link = '../AST-013/spec.md';\n",
  );
  write(
    root,
    'packages/core/src/utils/plainDate.ts',
    '// Resolves wall time per AST-013 and docs/architecture/layer-runtime.md.\n// Day boundaries follow AST-017/DEC-1 and AST-020/FR15 (see AST-020 FR9). Not AST-0130 or XAST-020.\n',
  );
  return root;
}

function ids(entries) {
  return entries.map(entry => entry.id).sort();
}

describe('resolveSpecsForFile', () => {
  it('routes a component file to its record, family, inherited architecture, and deciding specs', () => {
    const index = loadKnowledgeIndex(popoverFixture());
    const result = resolveSpecsForFile(
      index,
      'packages/core/src/Popover/Popover.tsx',
    );
    expect(ids(result.records)).toEqual([
      'architecture:layer-runtime',
      'component:Popover',
      'family:overlay-dismissal',
    ]);
    const family = result.records.find(
      record => record.id === 'family:overlay-dismissal',
    );
    expect(family.routes).toEqual([
      {via: 'members', detail: 'component:Popover'},
      {via: 'inherited:families', detail: 'component:Popover'},
    ]);
    expect(ids(result.decidingSpecs)).toEqual(['spec:AST-003']);
    expect(result.component).toEqual({
      package: 'core',
      root: 'Popover',
      names: ['Popover', 'PopoverTrigger'],
    });
    expect(result.source).toBe('working-tree');
  });

  it('keeps draft records out unless asked', () => {
    const index = loadKnowledgeIndex(popoverFixture());
    const file = 'packages/core/src/Popover/Popover.tsx';
    expect(ids(resolveSpecsForFile(index, file).decidingSpecs)).not.toContain(
      'spec:AST-090',
    );
    expect(
      ids(resolveSpecsForFile(index, file, {includeDraft: true}).decidingSpecs),
    ).toContain('spec:AST-090');
  });

  it('routes a module by its same-stem sources and a dedicated module directory by subtree', () => {
    const index = loadKnowledgeIndex(popoverFixture());
    const header = resolveSpecsForFile(
      index,
      'packages/core/src/Dialog/modules/DialogHeader.test.tsx',
    );
    expect(ids(header.records)).toEqual(['module:Dialog/DialogHeader']);
    const footer = resolveSpecsForFile(
      index,
      'packages/core/src/Dialog/modules/DialogFooter.tsx',
    );
    expect(footer.records).toEqual([]);
    const plugin = resolveSpecsForFile(
      index,
      'packages/core/src/Table/plugins/activation/helpers/key.ts',
    );
    expect(ids(plugin.records)).toEqual([
      'family:data-display',
      'module:Table/useTableActivation',
    ]);
  });

  it('matches applies_to by path segment, never by string prefix', () => {
    const index = loadKnowledgeIndex(popoverFixture());
    expect(
      ids(
        resolveSpecsForFile(index, 'packages/core/src/Layer/Layer.tsx').records,
      ),
    ).toContain('architecture:layer-runtime');
    expect(
      resolveSpecsForFile(
        index,
        'packages/core/src/LayerProvider/LayerProvider.tsx',
      ).records,
    ).toEqual([]);
  });

  it('routes verified_by evidence to the record it verifies', () => {
    const index = loadKnowledgeIndex(popoverFixture());
    const result = resolveSpecsForFile(index, 'scripts/layer-check.mjs');
    expect(result.records[0]).toMatchObject({
      id: 'architecture:layer-runtime',
      routes: [{via: 'verified_by', detail: 'scripts/layer-check.mjs'}],
    });
  });

  it('routes consumer-doc ids to their topic files', () => {
    const index = loadKnowledgeIndex(popoverFixture());
    for (const file of [
      'packages/cli/assets/docs/browser-support.doc.mjs',
      'packages/cli/assets/docs/tree/browser-support.doc.mjs',
    ]) {
      expect(ids(resolveSpecsForFile(index, file).records)).toEqual([
        'spec:AST-013',
      ]);
    }
  });

  it('takes component names from docs and full component entries, never anatomy parts or partial entries', () => {
    const index = loadKnowledgeIndex(popoverFixture());
    const result = resolveSpecsForFile(
      index,
      'packages/core/src/Popover/Popover.tsx',
    );
    expect(ids(result.records)).not.toContain('family:data-display');
  });

  it('never lets a draft record steer the result unless drafts are asked for', () => {
    const index = loadKnowledgeIndex(popoverFixture());
    const file = 'packages/core/src/Drawer/Drawer.tsx';
    const current = resolveSpecsForFile(index, file);
    expect(current.records).toEqual([]);
    expect(current.decisions).toEqual([]);
    expect(current.triggers).not.toEqual(['motion']);
    const withDrafts = resolveSpecsForFile(index, file, {includeDraft: true});
    expect(ids(withDrafts.records)).toEqual([
      'architecture:container-padding',
      'component:Drawer',
    ]);
    expect(withDrafts.triggers).toEqual(['motion']);
  });

  it('lists a decision-scoped citation as that decision, not the whole record', () => {
    const index = loadKnowledgeIndex(popoverFixture());
    const result = resolveSpecsForFile(
      index,
      'packages/core/src/TabList/TabList.tsx',
    );
    expect(ids(result.records)).toEqual(['component:TabList']);
    expect(result.decisions).toEqual([
      expect.objectContaining({
        id: 'spec:AST-017/DEC-1',
        recordId: 'spec:AST-017',
        decision: 'DEC-1',
        routes: [{via: 'inherited:system_specs', detail: 'component:TabList'}],
      }),
    ]);
  });

  it('places a member component record only over its same-stem files', () => {
    const index = loadKnowledgeIndex(popoverFixture());
    const unrelated = resolveSpecsForFile(
      index,
      'packages/core/src/Chat/ChatMessageList.tsx',
    );
    expect(ids(unrelated.records)).toEqual([]);
    expect(unrelated.triggers).not.toEqual(['motion']);
    const own = resolveSpecsForFile(
      index,
      'packages/core/src/Chat/ChatComposerDrawer.test.tsx',
    );
    expect(ids(own.records)).toEqual(['component:ChatComposerDrawer']);
    expect(own.triggers).toEqual(['motion']);
    expect(
      ids(
        resolveSpecsForFile(
          index,
          'packages/core/src/Chat/__tests__/ChatComposerDrawer.a11y.states.ts',
        ).records,
      ),
    ).toEqual(['component:ChatComposerDrawer']);
  });

  it('names a member without its own consumer doc by its file stem', () => {
    const index = loadKnowledgeIndex(popoverFixture());
    expect(
      ids(
        resolveSpecsForFile(index, 'packages/core/src/Chat/ChatHeadingItem.tsx')
          .records,
      ),
    ).toEqual(['family:data-display']);
  });

  it('places a module record over its same-stem sources anywhere in its component root', () => {
    const index = loadKnowledgeIndex(popoverFixture());
    expect(
      ids(
        resolveSpecsForFile(
          index,
          'packages/core/src/Markdown/plugins/headingLinks.ts',
        ).records,
      ),
    ).toEqual(['component:Markdown', 'module:Markdown/headingLinks']);
    expect(
      ids(
        resolveSpecsForFile(index, 'packages/core/src/Markdown/Markdown.tsx')
          .records,
      ),
    ).toEqual(['component:Markdown']);
  });

  it('places a module record beside the same-stem verified_by evidence outside its root', () => {
    const index = loadKnowledgeIndex(popoverFixture());
    const source = resolveSpecsForFile(
      index,
      'packages/core/src/hooks/useMenuPress.ts',
    );
    expect(ids(source.records)).toEqual(['module:DropdownMenu/useMenuPress']);
    expect(source.records[0].routes[0].via).toBe('placement');
    expect(
      ids(
        resolveSpecsForFile(
          index,
          'packages/core/src/hooks/useEntryAnimation.ts',
        ).records,
      ),
    ).toEqual(['spec:AST-014']);
  });

  it('names a file in a shared directory by its own same-stem doc', () => {
    const index = loadKnowledgeIndex(popoverFixture());
    const result = resolveSpecsForFile(
      index,
      'packages/core/src/hooks/useMenuPress.ts',
    );
    expect(result.component.names).toEqual(['useMenuPress']);
    expect(
      resolveSpecsForFile(index, 'packages/core/src/Chat/ChatMessageList.tsx')
        .component.names,
    ).toEqual(['Chat', 'ChatMessageList']);
    expect(ids(result.records)).not.toContain('spec:AST-014');
  });

  it('matches declared paths with route-group segments, and skips prose entries', () => {
    const index = loadKnowledgeIndex(popoverFixture());
    const result = resolveSpecsForFile(
      index,
      'apps/sandbox/src/app/(fullscreen)/pages/perf/benchmark.test.ts',
    );
    expect(result.records[0]).toMatchObject({
      id: 'component:Markdown',
      routes: [
        {
          via: 'verified_by',
          detail:
            'apps/sandbox/src/app/(fullscreen)/pages/perf/benchmark.test.ts',
        },
      ],
    });
  });

  it('lists a claim-scoped reference as that claim, not the whole record', () => {
    const index = loadKnowledgeIndex(popoverFixture());
    const result = resolveSpecsForFile(
      index,
      'packages/core/src/Markdown/Markdown.tsx',
    );
    expect(ids(result.records)).toEqual(['component:Markdown']);
    expect(result.decisions).toEqual([
      expect.objectContaining({
        id: 'spec:AST-017/FR3',
        decision: 'FR3',
        routes: [{via: 'inherited:system_specs', detail: 'component:Markdown'}],
      }),
    ]);
  });

  it('keeps a consumer-doc topic id on its topic file, not on files sharing its stem', () => {
    const index = loadKnowledgeIndex(popoverFixture());
    expect(
      resolveSpecsForFile(index, 'packages/core/src/utils/color.ts').records,
    ).toEqual([]);
    expect(
      ids(
        resolveSpecsForFile(index, 'packages/cli/assets/docs/color.doc.mjs')
          .records,
      ),
    ).toEqual(['spec:AST-008']);
  });

  it('ignores spec numbers inside record paths', () => {
    const index = loadKnowledgeIndex(popoverFixture());
    const result = resolveSpecsForFile(index, 'scripts/fixture-heavy.test.mjs');
    expect(result.records).toEqual([]);
    expect(result.decisions).toEqual([]);
  });

  it('routes a file to the system specs it cites by number', () => {
    const index = loadKnowledgeIndex(popoverFixture());
    const result = resolveSpecsForFile(
      index,
      'packages/core/src/utils/plainDate.ts',
    );
    expect(
      result.records.map(record => [
        record.id,
        record.routes[0].via,
        record.routes[0].detail,
      ]),
    ).toEqual([['spec:AST-013', 'mentioned', 'AST-013']]);
    expect(result.decisions.map(decision => decision.id)).toEqual([
      'spec:AST-017/DEC-1',
      'spec:AST-020/FR15',
      'spec:AST-020/FR9',
    ]);
    expect(ids(result.records)).not.toContain('spec:AST-020');
  });

  it("routes a path matched by a record's path-applicability pattern", () => {
    const root = popoverFixture();
    writeRecord(
      root,
      'docs/specs/AST-033/spec.md',
      {
        kind: 'system-spec',
        id: 'spec:AST-033',
        affects_architecture: [],
        affects_families: [],
        affects_consumer_docs: [],
      },
      '\n<!-- path-applicability:v1 -->\n\n```json\n{"paths": ["apps/docsite/**"]}\n```\n',
    );
    const index = loadKnowledgeIndex(root);
    const result = resolveSpecsForFile(
      index,
      'apps/docsite/src/content/blog/posts/release.md',
    );
    expect(result.records).toEqual([
      expect.objectContaining({
        id: 'spec:AST-033',
        routes: [{via: 'path-applicability', detail: 'apps/docsite/**'}],
      }),
    ]);
    expect(
      resolveSpecsForFile(index, 'apps/docsite-legacy/index.md').records,
    ).toEqual([]);
  });

  it('reports a path no record reaches instead of guessing', () => {
    const index = loadKnowledgeIndex(popoverFixture());
    const result = resolveSpecsForFile(
      index,
      'apps/docsite/src/content/blog/posts/release.md',
    );
    expect(result.records).toEqual([]);
    expect(result.decidingSpecs).toEqual([]);
  });

  it('selects global claims exactly as the review baseline router does', () => {
    const root = popoverFixture();
    const index = loadKnowledgeIndex(root);
    const records = index.records.map(record => ({
      path: record.path,
      content: record.content,
    }));
    const project = matches =>
      matches.map(({recordId, path: recordPath, trigger, claimId, claim}) => ({
        recordId,
        path: recordPath,
        trigger,
        claimId,
        claim,
      }));

    const local = resolveSpecsForFile(
      index,
      'packages/core/src/Popover/Popover.tsx',
    );
    expect(local.triggers).toEqual(['behavior', 'layering']);
    expect(local.globalClaims).toEqual(
      project(collectGlobalReviewMatches(records, local.triggers, null)),
    );
    expect(local.globalClaims.map(claim => claim.claimId)).toEqual(['FR1']);

    const requested = resolveSpecsForFile(index, 'scripts/layer-check.mjs', {
      triggers: ['testing'],
    });
    expect(requested.globalClaims.map(claim => claim.claimId)).toEqual(['FR2']);

    const none = resolveSpecsForFile(
      index,
      'apps/docsite/src/content/blog/posts/release.md',
    );
    expect(none.triggers).toEqual([...GLOBAL_REVIEW_TRIGGERS].sort());
  });
});

describe('concern routing', () => {
  function concernFixture() {
    const root = popoverFixture();
    writeRecord(
      root,
      'docs/architecture/react-component-runtime.md',
      {kind: 'architecture', id: 'architecture:react-component-runtime'},
      [
        '',
        '<!-- review-applicability:v1 -->',
        '',
        '```json',
        JSON.stringify({
          scope: 'global',
          concerns: {
            'slot-presence': {
              names: ['isRenderable'],
              patterns: ["typeof [\\w.]+ !== 'boolean'"],
              claims: ['INV16'],
            },
          },
        }),
        '```',
        '',
        '## Requirements',
        '',
        '- **INV16 — A shared concern is extended in its owner.** Detail.',
        '',
      ].join('\n'),
    );
    return loadKnowledgeIndex(root);
  }
  const file = 'packages/core/src/Popover/Popover.tsx';
  const addedLines = [
    {
      file,
      line: 7,
      text: "  if (label != null && typeof label !== 'boolean') {",
    },
    {
      file: 'packages/core/src/Other/Other.tsx',
      line: 1,
      text: 'isRenderable(x)',
    },
  ];

  it("lists the claims a concern routes from the file's own added lines", () => {
    const result = resolveSpecsForFile(concernFixture(), file, {addedLines});
    expect(result.concernClaims).toEqual([
      {
        recordId: 'architecture:react-component-runtime',
        path: 'docs/architecture/react-component-runtime.md',
        concern: 'slot-presence',
        claimId: 'INV16',
        claim: 'A shared concern is extended in its owner.',
        utilities: ['isRenderable'],
        evidence: [
          {
            file,
            line: 7,
            text: "  if (label != null && typeof label !== 'boolean') {",
            matched: "typeof label !== 'boolean'",
            by: "typeof [\\w.]+ !== 'boolean'",
          },
        ],
      },
    ]);
    expect(resolveSpecsForFile(concernFixture(), file).concernClaims).toEqual(
      [],
    );
  });

  it('prints the concern claims first and lists the linked records by id', () => {
    const result = resolveSpecsForFile(concernFixture(), file, {addedLines});
    const short = formatResult(result).split('\n');
    expect(short[1]).toBe(
      '  Follow first (the change touches a shared concern):',
    );
    expect(short[2]).toBe(
      "    architecture:react-component-runtime  INV16  ← slot-presence (line 7: typeof label !== 'boolean'; shared: isRenderable)",
    );
    // Every linked record is still listed, by id (INV26).
    expect(
      short.some(line => /^ {2}Records: .*component:Popover/.test(line)),
    ).toBe(true);
    expect(short.join('\n')).not.toContain('via ');
    expect(formatResult(result, {records: true})).toContain('via ');
  });
});

describe('coverage audits', () => {
  it('lists current records only their own file reaches', () => {
    const root = popoverFixture();
    const index = loadKnowledgeIndex(root);
    const files = [
      'packages/core/src/Popover/Popover.tsx',
      'docs/specs/AST-020/spec.md',
      'docs/specs/AST-013/spec.md',
    ];
    expect(ids(findUnreachedRecords(index, files))).toEqual([
      'architecture:container-padding',
      'component:ChatComposerDrawer',
      'component:Markdown',
      'component:TabList',
      'family:data-display',
      'module:Dialog/DialogBody',
      'module:Dialog/DialogHeader',
      'module:DropdownMenu/useMenuPress',
      'module:Markdown/headingLinks',
      'module:Markdown/softBreaks',
      'module:Table/useTableActivation',
      'spec:AST-008',
      'spec:AST-013',
      'spec:AST-014',
      'spec:AST-017',
      'spec:AST-020',
    ]);
    expect(
      ids(
        findUnreachedRecords(index, [
          ...files,
          'packages/core/src/TabList/TabList.tsx',
        ]),
      ),
    ).not.toContain('spec:AST-017');
  });

  it('lists tracked files without a governing record', () => {
    const index = loadKnowledgeIndex(popoverFixture());
    expect(
      findUnroutedFiles(index, [
        'packages/core/src/Popover/Popover.tsx',
        'apps/docsite/src/content/blog/posts/release.md',
      ]),
    ).toEqual(['apps/docsite/src/content/blog/posts/release.md']);
  });
});

describe('repository records', () => {
  const index = loadKnowledgeIndex(repoRoot);

  it('routes every current component and module record from each same-stem source', () => {
    const tracked = execFileSync('git', ['-C', repoRoot, 'ls-files'], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    })
      .split('\n')
      .filter(Boolean);
    // A record with no same-stem source is not placed from any file. That is
    // allowed here: reachability of every current record is a separate check.
    const missing = [];
    for (const record of index.records) {
      if (record.authority !== 'current' || !record.classified) continue;
      const {packageName, componentRoot, publicName, layout} =
        record.classified;
      const root =
        layout === 'flat'
          ? `packages/${packageName}/src/`
          : `packages/${packageName}/src/${componentRoot}/`;
      const evidenceDirectories = new Set(
        (record.frontmatter.get('verified_by') ?? [])
          .filter(
            entry => path.posix.basename(entry).split('.')[0] === publicName,
          )
          .map(entry => `${path.posix.dirname(entry)}/`),
      );
      const candidates = tracked.filter(
        file =>
          !file.endsWith('.spec.md') &&
          path.posix.basename(file).split('.')[0] === publicName &&
          (file.startsWith(root) ||
            (record.kind === 'module' &&
              evidenceDirectories.has(`${path.posix.dirname(file)}/`))),
      );
      for (const file of candidates) {
        if (
          !ids(
            resolveSpecsForFile(index, file, {triggers: []}).records,
          ).includes(record.id)
        ) {
          missing.push(`${record.id} from ${file}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('routes every current architecture record from each applies_to path', () => {
    const missing = [];
    for (const record of index.records) {
      if (record.authority !== 'current' || record.kind !== 'architecture') {
        continue;
      }
      for (const entry of record.frontmatter.get('applies_to') ?? []) {
        const target = path.join(repoRoot, entry);
        if (!fs.existsSync(target)) continue;
        const file = fs.statSync(target).isDirectory()
          ? path.posix.join(entry.replace(/\/+$/, ''), '__probe__.ts')
          : entry;
        if (
          !ids(
            resolveSpecsForFile(index, file, {triggers: []}).records,
          ).includes(record.id)
        ) {
          missing.push(`${record.id} from ${file}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
