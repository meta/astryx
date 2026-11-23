// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.test.ts
 * @input The Lab DiffViewer entry and the Core component
 * @output Tests that the Lab entry re-exports the Core exports, deprecated
 * @position Testing; validates index.ts
 */

import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  DiffViewer as CoreDiffViewer,
  createDiffFile as coreCreateDiffFile,
  parseUnifiedDiff as coreParseUnifiedDiff,
} from '@astryxdesign/core/DiffViewer';
import {DiffViewer, createDiffFile, parseUnifiedDiff} from './index';

const EXPORTS = [
  'DiffViewer',
  'parseUnifiedDiff',
  'createDiffFile',
  'DiffViewerProps',
  'DiffViewerViewMode',
  'DiffViewerChangeIndicator',
  'DiffViewerInlineHighlight',
  'CreateDiffFileOptions',
  'DiffViewerFile',
  'DiffViewerFileStatus',
  'DiffViewerHunk',
  'DiffViewerLine',
  'DiffViewerLineKind',
  'DiffViewerLineRef',
  'DiffViewerSide',
];

describe('Lab DiffViewer', () => {
  it('is the Core component and utilities', () => {
    expect(DiffViewer).toBe(CoreDiffViewer);
    expect(parseUnifiedDiff).toBe(coreParseUnifiedDiff);
    expect(createDiffFile).toBe(coreCreateDiffFile);
  });

  it('marks each of its exports deprecated', () => {
    // Static metadata only: editors and type checkers show it, and nothing
    // warns at runtime.
    const source = readFileSync(path.join(__dirname, 'index.ts'), 'utf8');
    for (const name of EXPORTS) {
      // The doc comment right above the export, whatever it contains.
      const comment = new RegExp(
        String.raw`/\*\*((?:(?!\*/)[\s\S])*)\*/\nexport (?:const|type) ${name}\b`,
      ).exec(source);
      expect(comment?.[1], name).toContain('@deprecated');
    }
  });
});
