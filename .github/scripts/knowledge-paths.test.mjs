// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {afterEach, describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {
  classifyComponentKnowledgePath,
  classifyPlatformComponentSpecPath,
  componentSpecPathForSource,
  isComponentSpecRecordPath,
  isLegacyComponentSpecPath,
  isPackageArchitectureRecordPath,
  classifyPackageArchitectureRecordPath,
  isPlatformComponentSpecPath,
  locateComponentKnowledgePath,
  locatePlatformComponentSource,
} = require('./knowledge-paths.cjs');

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

function fixtureRoot(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-paths-'));
  roots.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    fs.mkdirSync(path.dirname(absolute), {recursive: true});
    fs.writeFileSync(absolute, content);
  }
  return root;
}

describe('component knowledge paths', () => {
  it.each([
    [
      'component record',
      'docs/specs/components/Button/Button.spec.md',
      'component',
    ],
    [
      'public member record',
      'docs/specs/components/NavMenu/NavHeadingMenu.spec.md',
      'component',
    ],
    [
      'module record',
      'docs/specs/components/Table/plugins/rowStatus/useTableRowStatus.spec.md',
      'module',
    ],
    [
      'flat-package component record',
      'docs/specs/components/Chart/Chart.spec.md',
      'component',
    ],
  ])('classifies a %s', (_label, filePath, kind) => {
    expect(classifyComponentKnowledgePath(filePath)).toMatchObject({kind});
    expect(isComponentSpecRecordPath(filePath)).toBe(true);
    expect(isPlatformComponentSpecPath(filePath)).toBe(false);
  });

  it.each([
    'docs/specs/components/__tests__/TopLevel.spec.md',
    'docs/specs/components/Button/__fixtures__/Fixture.spec.md',
    'docs/specs/components/Button/.hidden/Hidden.spec.md',
    'docs/specs/components/Button/.Hidden.spec.md',
    'docs/specs/components/Button/generated/Generated.spec.md',
    'docs/specs/components/Button/plugins/Thing.generated.spec.md',
    'docs/specs/components/Button/node_modules/pkg/Dependency.spec.md',
  ])('ignores %s on every consumer', filePath => {
    expect(classifyComponentKnowledgePath(filePath)).toBeNull();
    expect(isComponentSpecRecordPath(filePath)).toBe(false);
  });

  it.each([
    'docs/specs/components/Button/Button.md',
    'docs/specs/components/Button/not-kebab.spec.md',
    'docs/specs/components/Button.spec.md',
    'docs/specs/components/Button/Button.swift.spec.md',
    'docs/specs/AST-001/spec.md',
    'packages/core/src/Button/Button.spec.md',
    'packages/charts/src/Chart.spec.md',
    'packages/themes/neutral/neutral.spec.md',
  ])('rejects non-record path %s', filePath => {
    expect(classifyComponentKnowledgePath(filePath)).toBeNull();
  });

  it('classifies a platform record beside the core record', () => {
    expect(
      classifyPlatformComponentSpecPath(
        'docs/specs/components/Avatar/AvatarStatusDot.swift.spec.md',
      ),
    ).toEqual({
      componentRoot: 'Avatar',
      fileName: 'AvatarStatusDot.swift.spec.md',
      language: 'swift',
      publicName: 'AvatarStatusDot',
    });
    for (const filePath of [
      'docs/specs/components/Avatar/Avatar.klingon.spec.md',
      'docs/specs/components/Avatar/modules/Avatar.swift.spec.md',
      'docs/specs/components/Avatar.swift.spec.md',
    ]) {
      expect(isPlatformComponentSpecPath(filePath)).toBe(false);
    }
  });

  it("locates a platform language's component code by its component root", () => {
    expect(
      locatePlatformComponentSource(
        'packages/native/apple/Sources/Astryx/Avatar/AvatarStatusDot.swift',
      ),
    ).toEqual({
      language: 'swift',
      componentRoot: 'Avatar',
      stem: 'AvatarStatusDot',
    });
    for (const filePath of [
      'packages/native/apple/Sources/Astryx/Astryx.swift',
      'packages/native/apple/Sources/Astryx/Avatar/Avatar.spec.md',
      'packages/native/apple/Sources/Astryx/Avatar/tests/Avatar.swift',
      'packages/native/apple/Tests/AstryxTests/AvatarTests.swift',
      'packages/core/src/Avatar/Avatar.tsx',
    ]) {
      expect(locatePlatformComponentSource(filePath)).toBeNull();
    }
  });

  it('derives a package architecture record id from its path', () => {
    expect(
      classifyPackageArchitectureRecordPath(
        'packages/native/specs/swift/accessibility.spec.md',
      ),
    ).toEqual({
      packageName: 'native',
      id: 'architecture:native-swift-accessibility',
    });
    expect(
      classifyPackageArchitectureRecordPath(
        'packages/native/specs/swift/library/tooltip.spec.md',
      ).id,
    ).toBe('architecture:native-swift-library-tooltip');
    for (const filePath of [
      'packages/native/specs/README.md',
      'packages/native/specs/swift/library/styles.md',
      'packages/native/specs/swift/__fixtures__/x.spec.md',
      'packages/native/specs/swift/x.generated.spec.md',
      'packages/native/specs/swift/Button.spec.md',
      'packages/native/src/specs/x.spec.md',
      'docs/specs/components/Button/Button.spec.md',
    ]) {
      expect(isPackageArchitectureRecordPath(filePath)).toBe(false);
    }
  });

  it('recognizes a spec left at a pre-move record location', () => {
    for (const filePath of [
      'packages/core/src/Button/Button.spec.md',
      'packages/core/src/Dialog/modules/DialogHeader.spec.md',
      'packages/charts/src/ChartAxis.spec.md',
      'packages/native/apple/Sources/Astryx/Button/Button.spec.md',
    ]) {
      expect(isLegacyComponentSpecPath(filePath), filePath).toBe(true);
    }
    for (const filePath of [
      'docs/specs/components/Button/Button.spec.md',
      'packages/core/src/__tests__/TopLevel.spec.md',
      'packages/core/src/Button/Thing.generated.spec.md',
      'packages/core/src/Button/Button.a11y.chromium.spec.ts',
      'packages/cli/src/Prompt.spec.md',
      'packages/native/specs/swift/library/tooltip.spec.md',
    ]) {
      expect(isLegacyComponentSpecPath(filePath), filePath).toBe(false);
    }
  });

  it('maps a source-tree record path to its docs location', () => {
    expect(componentSpecPathForSource('core', 'Button/Button.spec.md')).toBe(
      'docs/specs/components/Button/Button.spec.md',
    );
    expect(
      componentSpecPathForSource('core', 'Dialog/modules/DialogHeader.spec.md'),
    ).toBe('docs/specs/components/Dialog/modules/DialogHeader.spec.md');
    expect(componentSpecPathForSource('charts', 'ChartAxis.spec.md')).toBe(
      'docs/specs/components/ChartAxis/ChartAxis.spec.md',
    );
    expect(componentSpecPathForSource('cli', 'Prompt.spec.md')).toBeNull();
  });
});

describe('component record location', () => {
  it('resolves the package and the code directory a record mirrors', () => {
    const root = fixtureRoot({
      'packages/core/src/Table/Table.tsx': '',
      'packages/core/src/Table/plugins/rowStatus/useTableRowStatus.ts': '',
      'packages/charts/src/ChartAxis.tsx': '',
    });
    expect(
      locateComponentKnowledgePath(
        root,
        'docs/specs/components/Table/plugins/rowStatus/useTableRowStatus.spec.md',
      ),
    ).toMatchObject({
      packageName: 'core',
      layout: 'nested',
      kind: 'module',
      codeDirectory: 'packages/core/src/Table/plugins/rowStatus',
    });
    expect(
      locateComponentKnowledgePath(
        root,
        'docs/specs/components/ChartAxis/ChartAxis.spec.md',
      ),
    ).toMatchObject({
      packageName: 'charts',
      layout: 'flat',
      codeDirectory: 'packages/charts/src',
    });
  });

  it('picks the package that holds the record when two packages share a root', () => {
    const root = fixtureRoot({
      'packages/core/src/Chat/ChatMessage.tsx': '',
      'packages/core/src/Chat/ChatMessage.doc.mjs': '',
      'packages/lab/src/Chat/ChatEmojiPicker.tsx': '',
      'packages/lab/src/Chat/ChatEmojiPicker.doc.mjs': '',
      'packages/lab/src/Chart/Chart.tsx': '',
      'packages/charts/src/Chart.tsx': '',
      'packages/charts/src/Chart.doc.mjs': '',
    });
    const owner = filePath =>
      locateComponentKnowledgePath(root, filePath)?.packageName ?? null;
    expect(owner('docs/specs/components/Chat/ChatMessage.spec.md')).toBe(
      'core',
    );
    expect(owner('docs/specs/components/Chat/ChatEmojiPicker.spec.md')).toBe(
      'lab',
    );
    expect(owner('docs/specs/components/Chart/Chart.spec.md')).toBe('charts');
    // A module record kept in modules/ belongs to the package holding its code.
    fs.mkdirSync(path.join(root, 'packages/lab/src/Chat/hooks'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(root, 'packages/lab/src/Chat/hooks/useReactionPicker.ts'),
      '',
    );
    expect(
      owner('docs/specs/components/Chat/modules/useReactionPicker.spec.md'),
    ).toBe('lab');
    expect(
      owner('docs/specs/components/Chat/modules/useNowhere.spec.md'),
    ).toBeNull();
    // Charts keeps its code flat in src/, beside Lab's Chart/ folder.
    fs.writeFileSync(path.join(root, 'packages/charts/src/markColor.ts'), '');
    expect(owner('docs/specs/components/Chart/modules/markColor.spec.md')).toBe(
      'charts',
    );
    // No same-stem code anywhere: the parent component record's package.
    expect(
      owner('docs/specs/components/Chart/modules/chartLegendLayout.spec.md'),
    ).toBe('charts');
    // Neither package holds a consumer doc for it, so no package owns it.
    expect(owner('docs/specs/components/Chat/ChatGhost.spec.md')).toBeNull();
  });

  it('matches component roots by exact case', () => {
    const root = fixtureRoot({'packages/core/src/Button/Button.tsx': ''});
    expect(
      locateComponentKnowledgePath(
        root,
        'docs/specs/components/button/button.spec.md',
      ),
    ).toBeNull();
  });
});

describe('record paths: one list for check:knowledge, change classification and the owner gate', () => {
  const {
    isKnowledgeRecordPath,
    isOwnerGatedPath,
  } = require('./knowledge-paths.cjs');
  const {
    classifyPaths,
    isKnowledgeRecordPath: gatedByScope,
  } = require('./change-scope.cjs');
  const root = path.resolve(import.meta.dirname, '../..');
  const tracked = require('node:child_process')
    .execFileSync('git', ['ls-files', '-z'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    })
    .split('\0')
    .filter(Boolean);
  const relative = files =>
    files.map(file => path.relative(root, file).split(path.sep).join('/'));

  it('names exactly the records check:knowledge discovers, and gates every one', async () => {
    const {discoverKnowledgeRecords, discoverPlatformComponentRecords} =
      await import('../../scripts/check-knowledge.mjs');
    const discovered = relative(discoverKnowledgeRecords(root)).sort();
    expect(tracked.filter(file => isKnowledgeRecordPath(file)).sort()).toEqual(
      discovered,
    );
    const platform = relative(discoverPlatformComponentRecords(root)).sort();
    expect(
      tracked.filter(file => isPlatformComponentSpecPath(file)).sort(),
    ).toEqual(platform);
    for (const record of [...discovered, ...platform]) {
      expect(isOwnerGatedPath(record), record).toBe(true);
    }
  });

  it('the spec-owner gate decides exactly the owner-gated paths', () => {
    for (const file of tracked) {
      expect(gatedByScope(file), file).toBe(isOwnerGatedPath(file));
    }
  });

  it.each([
    // A generated record table beside a spec, with the code that writes it.
    [
      'a generated table beside a spec',
      [
        'docs/specs/AST-094-touch-presentations/motion-roles.md',
        'package.json',
        'packages/core/src/motion/roles.test.ts',
        'scripts/generate-motion-roles.mjs',
        'scripts/motion-roles-table.d.mts',
        'scripts/motion-roles-table.mjs',
      ],
      {
        'docs/specs/AST-094-touch-presentations/motion-roles.md': {
          specRecord: false,
          ownerGatedRecord: true,
        },
      },
    ],
    // A platform record with its Swift view and tests.
    [
      'a platform record',
      [
        'docs/specs/components/Avatar/Avatar.swift.spec.md',
        'packages/native/apple/Sources/Astryx/Avatar/Avatar.swift',
        'packages/native/apple/Tests/AstryxTests/AvatarTests.swift',
      ],
      {
        'docs/specs/components/Avatar/Avatar.swift.spec.md': {
          specRecord: true,
          ownerGatedRecord: true,
        },
      },
    ],
  ])('%s needs a spec owner, and its code does not', (_, files, records) => {
    const classified = classifyPaths(files);
    for (const file of files) {
      expect(classified[file], file).toEqual(
        records[file] ?? {specRecord: false, ownerGatedRecord: false},
      );
    }
  });

  it.each([
    'docs/specs/AST-030/spec.md',
    'docs/specs/AST-030/plan.md',
    'docs/specs/AST-094-touch-presentations/motion-roles.md',
    'docs/specs/README.md',
    'docs/specs/components/Button/Button.spec.md',
    'docs/specs/components/Button/notes.md',
    'docs/families/action-groups.md',
    'docs/design/motion.md',
    'docs/design/assets/selector/alignment.png',
    'docs/architecture/knowledge-contracts.md',
    'docs/themes/neutral.md',
    'packages/themes/neutral/neutral.spec.md',
    'packages/themes/neutral/subdir/neutral.spec.md',
    'packages/native/specs/README.md',
    'packages/native/specs/TEMPLATE.md',
    'packages/native/specs/swift/library/accessibility.md',
    'packages/native/specs/swift/library/tooltip.spec.md',
    'packages/core/docs/architecture/runtime.md',
    'packages/core/src/Selector/Selector.spec.md',
  ])('gates %s', file => {
    expect(isOwnerGatedPath(file)).toBe(true);
  });

  it.each([
    'docs/architecture/README.md',
    'docs/families/README.md',
    'docs/design/README.md',
    'docs/themes/README.md',
    'docs/specs/components/__tests__/TopLevel.spec.md',
    'docs/specs/components/Selector/__fixtures__/fixture.spec.md',
    'docs/specs/components/Selector/.hidden/Hidden.spec.md',
    'docs/specs/components/Selector/generated/fake.spec.md',
    'docs/specs/components/Selector/plugins/fake.generated.spec.md',
    'docs/contributing/spec-writing.md',
    'docs/schemas/knowledge/component.schema.json',
    'packages/core/src/Button/Button.tsx',
  ])('leaves %s ungated', file => {
    expect(isOwnerGatedPath(file)).toBe(false);
  });

  it('classifies paths from the command line for callers outside the workflow', () => {
    const output = require('node:child_process').execFileSync(
      process.execPath,
      [path.join(root, '.github/scripts/change-scope.cjs'), '--classify-paths'],
      {
        input:
          'docs/specs/AST-094-touch-presentations/motion-roles.md\npackage.json\n',
        encoding: 'utf8',
      },
    );
    expect(JSON.parse(output)).toEqual({
      'docs/specs/AST-094-touch-presentations/motion-roles.md': {
        specRecord: false,
        ownerGatedRecord: true,
      },
      'package.json': {specRecord: false, ownerGatedRecord: false},
    });
  });
});
