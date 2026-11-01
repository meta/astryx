// Copyright (c) Meta Platforms, Inc. and affiliates.

import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {
  classifyComponentKnowledgePath,
  isComponentSpecRecordPath,
} = require('./knowledge-paths.cjs');

describe('component knowledge paths', () => {
  it.each([
    [
      'directory-layout Core component record',
      'docs/specs/components/Button/Button.spec.md',
      'component',
    ],
    [
      'directory-layout public member record',
      'docs/specs/components/NavMenu/NavHeadingMenu.spec.md',
      'component',
    ],
    [
      'directory-layout module record',
      'docs/specs/components/Table/plugins/rowStatus/useTableRowStatus.spec.md',
      'module',
    ],
    [
      'flat Charts component record',
      'docs/specs/components/Chart/Chart.spec.md',
      'component',
    ],
    [
      'flat Rich Text component record',
      'packages/richtext/src/RichTextView.spec.md',
      'component',
    ],
    [
      'flat Vega component record',
      'packages/vega/src/VegaChart.spec.md',
      'component',
    ],
    [
      'flat-package module record',
      'packages/charts/src/Chart/plugins/useChartSelection.spec.md',
      'module',
    ],
  ])('classifies the %s', (_label, filePath, kind) => {
    expect(classifyComponentKnowledgePath(filePath)).toMatchObject({kind});
    expect(isComponentSpecRecordPath(filePath)).toBe(true);
  });

  it.each([
    'packages/core/src/__tests__/TopLevel.spec.md',
    'packages/core/src/Button/__fixtures__/Fixture.spec.md',
    'packages/core/src/Button/.hidden/Hidden.spec.md',
    'packages/core/src/Button/.Hidden.spec.md',
    'packages/core/src/Button/generated/Generated.spec.md',
    'packages/core/src/Button/plugins/Thing.generated.spec.md',
    'packages/core/src/Button/node_modules/pkg/Dependency.spec.md',
  ])('ignores %s on every consumer', filePath => {
    expect(classifyComponentKnowledgePath(filePath)).toBeNull();
    expect(isComponentSpecRecordPath(filePath)).toBe(false);
  });

  it.each([
    'packages/core/src/Button/Button.md',
    'packages/core/src/Button/not-kebab.spec.md',
    'packages/core/src/Button.spec.md',
    'packages/themes/neutral/src/Button.spec.md',
    'packages/cli/src/Prompt.spec.md',
  ])('rejects non-record path %s', filePath => {
    expect(classifyComponentKnowledgePath(filePath)).toBeNull();
  });
});
