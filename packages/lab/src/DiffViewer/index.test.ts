// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.test.ts
 * @input The Lab DiffViewer entry and the Core component
 * @output Tests that the Lab entry re-exports the Core exports
 * @position Testing; validates index.ts
 */

import {describe, expect, it} from 'vitest';
import {
  DiffViewer as CoreDiffViewer,
  createDiffFile as coreCreateDiffFile,
  parseUnifiedDiff as coreParseUnifiedDiff,
  type DiffViewerProps as CoreDiffViewerProps,
} from '@astryxdesign/core/DiffViewer';
import {
  DiffViewer,
  createDiffFile,
  parseUnifiedDiff,
  type DiffViewerProps,
} from './index';

describe('Lab DiffViewer', () => {
  it('is the Core component and utilities', () => {
    expect(DiffViewer).toBe(CoreDiffViewer);
    expect(parseUnifiedDiff).toBe(coreParseUnifiedDiff);
    expect(createDiffFile).toBe(coreCreateDiffFile);
  });

  it('takes the Core props', () => {
    const file = coreCreateDiffFile({oldValue: 'a\n', newValue: 'b\n'});
    const props: CoreDiffViewerProps = {file} satisfies DiffViewerProps;
    expect(props.file).toBe(file);
  });
});
