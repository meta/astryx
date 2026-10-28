// Copyright (c) Meta Platforms, Inc. and affiliates.

import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {
  SURFACES,
  classifyChanges,
  parseNameStatus,
} = require('./change-scope.cjs');

describe('spec-only change scope', () => {
  it('accepts system, family, design, theme, component, and plan records', () => {
    const result = classifyChanges([
      {filename: 'docs/specs/AST-001-overlay-policy/spec.md'},
      {filename: 'docs/specs/AST-001-overlay-policy/plan.md'},
      {filename: 'docs/families/input-fields.md'},
      {filename: 'docs/design/selection-inputs.md'},
      {filename: 'packages/themes/neutral/neutral.spec.md'},
      {filename: 'packages/core/src/Selector/Selector.spec.md'},
      {
        filename:
          'packages/core/src/Table/plugins/rowStatus/useTableRowStatus.spec.md',
      },
      {filename: 'packages/lab/src/FutureInput/FutureInput.spec.md'},
      {filename: 'packages/charts/src/Chart.spec.md'},
      {filename: 'packages/richtext/src/RichTextView.spec.md'},
      {filename: 'packages/vega/src/VegaChart.spec.md'},
    ]);
    expect(result.specOnly).toBe(true);
  });

  it('owner-gates architecture records without granting the spec-only fast path', () => {
    const result = classifyChanges([
      {filename: 'docs/architecture/knowledge-contracts.md'},
    ]);
    expect(result.touchesKnowledgeRecords).toBe(true);
    expect(result.specOnly).toBe(false);
  });

  it('owner-gates normative design assets without granting the spec-only fast path', () => {
    const result = classifyChanges([
      {filename: 'docs/design/assets/selector/alignment.png'},
    ]);
    expect(result.touchesDesignAssets).toBe(true);
    expect(result.touchesKnowledgeRecords).toBe(true);
    expect(result.specOnly).toBe(false);
  });

  it('rejects Changesets attached only to spec records', () => {
    const result = classifyChanges([
      {filename: 'docs/families/input-fields.md'},
      {filename: '.changeset/input-fields-docs.md'},
    ]);
    expect(result.specOnly).toBe(false);
    expect(result.specChangesetConflict).toBe(true);
  });

  it('allows an existing Changeset reclassification beside its governing spec', () => {
    const result = classifyChanges([
      {status: 'M', filename: 'docs/specs/AST-017/spec.md'},
      {status: 'M', filename: '.changeset/existing-release.md'},
    ]);
    expect(result.specChangesetConflict).toBe(false);
  });

  it.each([
    ['added', {status: 'A', filename: '.changeset/new-release.md'}],
    ['deleted', {status: 'D', filename: '.changeset/old-release.md'}],
    [
      'renamed in',
      {
        status: 'R100',
        filename: '.changeset/new-release.md',
        previous_filename: 'notes/release.md',
      },
    ],
    [
      'renamed out',
      {
        status: 'R100',
        filename: 'notes/release.md',
        previous_filename: '.changeset/old-release.md',
      },
    ],
    ['missing status', {filename: '.changeset/unknown-release.md'}],
    [
      'worktree/index status',
      {status: 'MM', filename: '.changeset/mixed-release.md'},
    ],
    [
      'rename-like M status',
      {status: 'M087', filename: '.changeset/odd-release.md'},
    ],
  ])('rejects a %s Changeset beside spec records', (_label, changeset) => {
    const result = classifyChanges([
      {status: 'M', filename: 'docs/specs/AST-017/spec.md'},
      changeset,
    ]);
    expect(result.specChangesetConflict).toBe(true);
  });

  it('does not let an unrelated file hide a spec-only Changeset', () => {
    const result = classifyChanges([
      {filename: 'docs/families/input-fields.md'},
      {filename: '.changeset/input-fields-docs.md'},
      {filename: 'docs/README.md'},
    ]);
    expect(result.specChangesetConflict).toBe(true);
  });

  it.each([
    'packages/core/src/Selector/Selector.test.tsx',
    'packages/core/src/Selector/Selector.audit.json',
    'packages/core/test/selector-fixture.ts',
    'packages/core/src/Selector/__fixtures__/options.ts',
    'packages/core/src/__tests__/TestIcon.tsx',
  ])(
    'does not let non-release package file %s hide a spec-only Changeset',
    filename => {
      const result = classifyChanges([
        {filename: 'docs/families/input-fields.md'},
        {filename: '.changeset/input-fields-docs.md'},
        {filename},
      ]);
      expect(result.specChangesetConflict).toBe(true);
    },
  );

  it('allows a Changeset when a package release surface also changes', () => {
    const result = classifyChanges([
      {filename: 'docs/families/input-fields.md'},
      {filename: 'packages/core/src/Selector/Selector.tsx'},
      {filename: '.changeset/selector-behavior.md'},
    ]);
    expect(result.specChangesetConflict).toBe(false);
  });

  it.each([
    'packages/core/src/Selector/Selector.tsx',
    'packages/core/src/Selector/Selector.audit.json',
    'packages/core/src/Table/__fixtures__/fake.spec.md',
    'packages/core/src/Table/generated/fake.spec.md',
    'packages/core/src/Table/plugins/fake.generated.spec.md',
    'docs/architecture/layers.md',
    'docs/templates/knowledge/component-spec.md',
    'docs/templates/knowledge/theme-spec.md',
    'docs/schemas/knowledge/v2.json',
    'docs/themes/neutral.md',
    'packages/themes/neutral/Theme.spec.md',
    'docs/themes/README.md',
    'docs/README.md',
    'docs/specs/README.md',
    '.github/workflows/ci.yml',
  ])('rejects %s', filename => {
    expect(classifyChanges([{filename}]).specOnly).toBe(false);
  });

  it.each([
    'docs/themes/neutral.md',
    'packages/themes/neutral/Theme.spec.md',
    'packages/themes/neutral/subdir/neutral.spec.md',
  ])('treats misplaced theme candidate %s as unsafe knowledge', filename => {
    const result = classifyChanges([{filename}]);
    expect(result.touchesKnowledgeRecords).toBe(true);
    expect(result.specOnly).toBe(false);
  });

  it.each([
    'packages/core/src/__tests__/TopLevel.spec.md',
    'packages/core/src/Selector/__fixtures__/fixture.spec.md',
    'packages/core/src/Selector/.hidden/Hidden.spec.md',
    'packages/core/src/Selector/.Hidden.spec.md',
    'packages/core/src/Selector/generated/fake.spec.md',
    'packages/core/src/Selector/plugins/fake.generated.spec.md',
  ])('ignores non-record component spec path %s consistently', filename => {
    const result = classifyChanges([{filename}]);
    expect(result.specOnly).toBe(false);
    expect(result.touchesKnowledgeRecords).toBe(false);
  });

  it('fails closed for an empty change set', () => {
    expect(classifyChanges([]).specOnly).toBe(false);
  });

  it('fails closed when the API file list is incomplete', () => {
    const result = classifyChanges(
      [{filename: 'docs/specs/AST-001-x/spec.md'}],
      {expectedCount: 3001},
    );
    expect(result.complete).toBe(false);
    expect(result.specOnly).toBe(false);
    expect(result.touchesKnowledgeRecords).toBe(true);
  });

  it('fails closed when an expected API file list is empty', () => {
    const result = classifyChanges([], {expectedCount: 1});
    expect(result.complete).toBe(false);
    expect(result.specOnly).toBe(false);
    expect(result.touchesKnowledgeRecords).toBe(true);
  });

  it('checks both sides of a rename', () => {
    expect(
      classifyChanges([
        {
          filename: 'packages/core/src/Selector/Selector.spec.md',
          previous_filename: 'packages/core/src/Selector/Selector.tsx',
        },
      ]).specOnly,
    ).toBe(false);
  });

  it('parses name-status renames without losing the previous path', () => {
    expect(
      parseNameStatus(
        'A\tdocs/specs/AST-001-x/spec.md\nR100\told.ts\tpackages/core/src/X/X.spec.md\n',
      ),
    ).toEqual([
      {filename: 'docs/specs/AST-001-x/spec.md', status: 'A'},
      {
        filename: 'packages/core/src/X/X.spec.md',
        previous_filename: 'old.ts',
        status: 'R100',
      },
    ]);
  });
});

describe('positive CI surfaces', () => {
  const scoreLedger = 'scripts/score-ledger.mjs';
  const scoreLedgerTest = 'scripts/score-ledger.test.mjs';

  it('admits only the complete score-ledger tooling group', () => {
    const result = classifyChanges([
      {filename: scoreLedger},
      {filename: scoreLedgerTest},
    ]);
    expect(result.toolingOnly).toBe(true);
    expect(result.surfaces).toEqual([SURFACES.NODE_TOOLING]);
  });

  it('admits internal scripts and their upload workflow', () => {
    const result = classifyChanges([
      {filename: '.github/workflows/crowdin-upload.yml'},
      {filename: 'internal/scripts/lib/a-future-strategy.mjs'},
    ]);
    expect(result.toolingOnly).toBe(true);
  });

  it('keeps root scripts on broad CI', () => {
    expect(
      classifyChanges([{filename: 'scripts/build-css.mjs'}]).toolingOnly,
    ).toBe(false);
  });

  it('keeps pure specification records in the knowledge singleton', () => {
    const result = classifyChanges([
      {filename: 'packages/core/src/Button/Button.spec.md'},
    ]);
    expect(result.specOnly).toBe(true);
    expect(result.toolingOnly).toBe(false);
    expect(result.surfaces).toEqual([SURFACES.KNOWLEDGE]);
  });

  it.each([
    {
      name: 'component spec plus component code',
      files: [
        'packages/core/src/Button/Button.spec.md',
        'packages/core/src/Button/Button.tsx',
      ],
      surfaces: [SURFACES.KNOWLEDGE, 'runtime:core'],
    },
    {
      name: 'module spec plus Table plugin code',
      files: [
        'packages/core/src/Table/plugins/rowStatus/useTableRowStatus.spec.md',
        'packages/core/src/Table/plugins/rowStatus/useTableRowStatus.tsx',
      ],
      surfaces: [SURFACES.KNOWLEDGE, 'runtime:core'],
    },
    {
      name: 'tooling plus component code',
      files: [scoreLedger, 'packages/core/src/Button/Button.tsx'],
      surfaces: [SURFACES.NODE_TOOLING, 'runtime:core'],
    },
    {
      name: 'workflow self-change',
      files: ['.github/workflows/ci.yml'],
    },
    {
      name: 'classifier self-change',
      files: ['.github/scripts/change-scope.cjs'],
    },
    {
      name: 'unknown path',
      files: ['new-surface/unknown.file'],
    },
    {
      name: 'shared infrastructure',
      files: ['pnpm-lock.yaml'],
    },
  ])('fails closed for $name', ({files, surfaces}) => {
    const result = classifyChanges(files.map(filename => ({filename})));
    expect(result.toolingOnly).toBe(false);
    if (surfaces) {
      expect(result.surfaces).toEqual(surfaces);
    } else {
      expect(result.surfaces).toContain(SURFACES.SHARED_OR_UNKNOWN);
    }
  });

  it.each([
    ['packages/core/src/Button/Button.tsx', ['runtime:core']],
    ['packages/lab/src/TransferList/TransferList.tsx', ['runtime:lab']],
    ['packages/charts/src/Chart.tsx', ['runtime:charts']],
    ['packages/richtext/src/RichTextView.tsx', ['runtime:richtext']],
    ['packages/vega/src/VegaChart.tsx', ['runtime:vega']],
    ['packages/cli/api/build/build.mjs', ['runtime:cli']],
    ['packages/build/src/vite.ts', ['runtime:build', 'theme-build']],
    ['packages/themes/neutral/src/neutralTheme.ts', ['theme-build']],
    ['apps/storybook/stories/Button.stories.tsx', ['storybook-visual']],
  ])('routes public surface %s through broad CI', (filename, surfaces) => {
    const result = classifyChanges([{filename}]);
    expect(result.toolingOnly).toBe(false);
    expect(result.surfaces).toEqual(surfaces);
  });

  it('fails closed when a tooling path was renamed from an unknown path', () => {
    const result = classifyChanges([
      {
        filename: scoreLedger,
        previous_filename: 'scripts/legacy-score-tool.mjs',
      },
    ]);
    expect(result.toolingOnly).toBe(false);
    expect(result.surfaces).toEqual([
      SURFACES.NODE_TOOLING,
      SURFACES.SHARED_OR_UNKNOWN,
    ]);
  });

  it('fails every specialized lane when the changed-file list is incomplete', () => {
    for (const filename of [
      scoreLedger,
      'apps/docsite/src/app/page.tsx',
      'docs/specs/AST-030/spec.md',
    ]) {
      const result = classifyChanges([{filename}], {expectedCount: 2});
      expect(result.complete).toBe(false);
      expect(result.toolingOnly).toBe(false);
      expect(result.docsiteOnly).toBe(false);
      expect(result.specOnly).toBe(false);
      expect(result.surfaces).toContain(SURFACES.SHARED_OR_UNKNOWN);
    }
  });
});

describe('full-suite scope', () => {
  const full = files =>
    classifyChanges(files.map(filename => ({filename}))).fullSuite;

  it('scopes component, shared-module, docs and spec changes to the import graph', () => {
    expect(full(['packages/core/src/Button/Button.tsx'])).toBe(false);
    expect(full(['packages/core/src/motion/animator.ts'])).toBe(false);
    expect(full(['packages/lab/src/Sketch/Sketch.tsx'])).toBe(false);
    expect(full(['apps/docsite/src/app/page.tsx'])).toBe(false);
    expect(full(['docs/specs/AST-001-overlay-policy/spec.md'])).toBe(false);
    expect(full(['apps/storybook/stories/Button.stories.tsx'])).toBe(false);
    // A Changeset beside the change is release notes, not infrastructure.
    expect(
      full([
        'packages/core/src/Layer/useLayer.tsx',
        '.changeset/layer-slot-second-render.md',
      ]),
    ).toBe(false);
  });

  it('runs everything for shared infrastructure', () => {
    for (const file of [
      'package.json',
      'pnpm-lock.yaml',
      'vitest.config.ts',
      '.github/workflows/ci.yml',
      '.github/scripts/change-scope.cjs',
      'internal/interaction-harness/src/busy.ts',
      'scripts/build-css.mjs',
      'packages/themes/neutral/src/index.ts',
      'packages/build/src/index.ts',
      'packages/core/src/theme/tokens.stylex.ts',
      'packages/core/package.json',
      'packages/core/tsconfig.json',
      'packages/core/vite.config.ts',
      'packages/core/src/test-utils/render.tsx',
      'packages/core/src/testing/fixtures.ts',
      'packages/core/src/__mocks__/matchMedia.ts',
      'packages/core/src/setupTests.ts',
      'packages/lab/src/vitest.setup.ts',
      'packages/core/babel-plugin-add-extensions.cjs',
      'packages/lab/babel-plugin-add-extensions.cjs',
      'apps/storybook/.storybook/preview.tsx',
      // Node tooling keeps its whole Node project (FR8), internal/ included.
      'internal/scripts/lib/a-future-strategy.mjs',
      'scripts/score-ledger.mjs',
    ]) {
      expect(full(['packages/core/src/Button/Button.tsx', file]), file).toBe(
        true,
      );
    }
  });

  it('runs everything when the changed-file list is incomplete', () => {
    expect(
      classifyChanges([{filename: 'packages/core/src/Button/Button.tsx'}], {
        expectedCount: 2,
      }).fullSuite,
    ).toBe(true);
    expect(classifyChanges([], {expectedCount: 1}).fullSuite).toBe(true);
  });

  it('runs everything when there are no paths to scope from', () => {
    expect(classifyChanges([]).fullSuite).toBe(true);
    expect(classifyChanges([], {expectedCount: 0}).fullSuite).toBe(true);
  });
});
