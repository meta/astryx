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
  isPlatformComponentSpecPath,
  locateComponentKnowledgePath,
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
