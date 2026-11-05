// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file a11y-changed-stories.test.mjs
 * Tests for the selection of changed stories no other audit covers, the ones
 * the touched-components check audits on their own (spec:AST-030 FR12).
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  changedUncoveredStoryIds,
  storyFilePath,
} from './a11y-changed-stories.js';
import {STORY_FILE} from '../touched-components.mjs';

const root = path.resolve(import.meta.dirname, '../../..');
const story = importPath => ({type: 'story', importPath});

// #9985's shape: an `a11y/` story file no component owns. #9992's shape: a
// story added to an untouched component's file (Resizable) while the change
// touched another component (LayoutPanel).
const stories = {
  'a11y-scroll-region-name--content-scrolls': story(
    './stories/ScrollRegionA11y.stories.tsx',
  ),
  'a11y-scroll-region-name--panel-scrolls': story(
    './stories/ScrollRegionA11y.stories.tsx',
  ),
  'a11y-scroll-region-name--docs': {
    type: 'docs',
    importPath: './stories/ScrollRegionA11y.stories.tsx',
  },
  'core-resizable--collapsing-scroll-panel-fixture': story(
    './stories/Resizable.stories.tsx',
  ),
  'core-resizable--default': story('./stories/Resizable.stories.tsx'),
  'core-layoutpanel--default': story('./stories/LayoutPanel.stories.tsx'),
  'core-chip--default': story('../../packages/core/src/Chip/Chip.stories.tsx'),
};

describe('changed stories no other audit covers', () => {
  it('reads an index import path as a repository path', () => {
    expect(storyFilePath('./stories/X.stories.tsx')).toBe(
      'apps/storybook/stories/X.stories.tsx',
    );
    expect(storyFilePath('../../packages/core/src/Chip/Chip.stories.tsx')).toBe(
      'packages/core/src/Chip/Chip.stories.tsx',
    );
  });

  it("selects a changed `a11y/` story file's stories, not its docs page", () => {
    expect(
      changedUncoveredStoryIds(stories, [
        'apps/storybook/stories/ScrollRegionA11y.stories.tsx',
      ]),
    ).toEqual([
      'a11y-scroll-region-name--content-scrolls',
      'a11y-scroll-region-name--panel-scrolls',
    ]);
  });

  it("selects a changed story an untouched component owns (#9992's fixture)", () => {
    expect(
      changedUncoveredStoryIds(
        stories,
        [
          'apps/storybook/stories/Resizable.stories.tsx',
          'apps/storybook/stories/LayoutPanel.stories.tsx',
        ],
        ['core-layoutpanel--default'],
      ),
    ).toEqual([
      'core-resizable--collapsing-scroll-panel-fixture',
      'core-resizable--default',
    ]);
  });

  it("leaves a touched component's stories to its own audit", () => {
    expect(
      changedUncoveredStoryIds(
        stories,
        ['packages/core/src/Chip/Chip.stories.tsx'],
        ['core-chip--default'],
      ),
    ).toEqual([]);
  });

  it('selects nothing for unchanged story files or an empty list', () => {
    expect(
      changedUncoveredStoryIds(stories, [
        'packages/core/src/Chip/Chip.tsx',
        '',
      ]),
    ).toEqual([]);
    expect(changedUncoveredStoryIds(stories, [])).toEqual([]);
  });

  it("selects #9992's fixture from the real Storybook index, when one is built", () => {
    const index = path.join(root, 'apps/storybook/dist/index.json');
    if (!fs.existsSync(index)) return;
    const entries = JSON.parse(fs.readFileSync(index, 'utf8')).entries;
    if (!entries['core-resizable--collapsing-scroll-panel-fixture']) return;
    const layoutPanel = Object.keys(entries).filter(id =>
      id.startsWith('core-layoutpanel--'),
    );
    const ids = changedUncoveredStoryIds(
      entries,
      ['apps/storybook/stories/Resizable.stories.tsx'],
      layoutPanel,
    );
    expect(ids).toContain('core-resizable--collapsing-scroll-panel-fixture');
    expect(ids.every(id => id.startsWith('core-resizable--'))).toBe(true);
  });

  it('knows a story file when it sees one', () => {
    for (const file of [
      'apps/storybook/stories/A.stories.tsx',
      'packages/lab/src/X/X.stories.ts',
      'a/B.stories.mdx',
    ]) {
      expect(STORY_FILE.test(file), file).toBe(true);
    }
    for (const file of [
      'packages/core/src/A.tsx',
      'apps/storybook/stories/README.md',
      'a/stories.tsx',
    ]) {
      expect(STORY_FILE.test(file), file).toBe(false);
    }
  });
});
