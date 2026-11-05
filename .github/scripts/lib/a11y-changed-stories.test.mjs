// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file a11y-changed-stories.test.mjs
 * Tests for the selection of changed stories no component owns, the ones the
 * touched-components check audits on their own (spec:AST-030 FR12).
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {changedUnownedStoryIds, storyFilePath} from './a11y-changed-stories.js';
import {STORY_FILE} from '../touched-components.mjs';

const root = path.resolve(import.meta.dirname, '../../..');
const story = importPath => ({type: 'story', importPath});

// #9985's shape: an `a11y/` story file whose stories route to an unknown
// owner, beside a component's own story file.
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
  'core-alertdialog--delete': story('./stories/AlertDialog.stories.tsx'),
  'core-chip--default': story('../../packages/core/src/Chip/Chip.stories.tsx'),
  'pattern-x--unrouted': story('./stories/Unrouted.stories.tsx'),
};
const routes = [
  {
    id: 'a11y-scroll-region-name--content-scrolls',
    component: 'unknown/a11y-scroll-region-name',
  },
  {
    id: 'a11y-scroll-region-name--panel-scrolls',
    component: 'unknown/a11y-scroll-region-name',
  },
  {id: 'core-alertdialog--delete', component: 'core/AlertDialog'},
  {id: 'core-chip--default', component: 'core/Chip'},
];

describe('changed stories no component owns', () => {
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
      changedUnownedStoryIds(stories, routes, [
        'apps/storybook/stories/ScrollRegionA11y.stories.tsx',
      ]),
    ).toEqual([
      'a11y-scroll-region-name--content-scrolls',
      'a11y-scroll-region-name--panel-scrolls',
    ]);
  });

  it("leaves a component's own stories to its touched-component audit", () => {
    expect(
      changedUnownedStoryIds(stories, routes, [
        'apps/storybook/stories/AlertDialog.stories.tsx',
        'packages/core/src/Chip/Chip.stories.tsx',
      ]),
    ).toEqual([]);
  });

  it('audits a story with no route rather than dropping it', () => {
    expect(
      changedUnownedStoryIds(stories, routes, [
        'apps/storybook/stories/Unrouted.stories.tsx',
      ]),
    ).toEqual(['pattern-x--unrouted']);
  });

  it('selects nothing for unchanged story files or an empty list', () => {
    expect(
      changedUnownedStoryIds(stories, routes, [
        'packages/core/src/Chip/Chip.tsx',
        '',
      ]),
    ).toEqual([]);
    expect(changedUnownedStoryIds(stories, routes, [])).toEqual([]);
  });

  it('selects the six #9985 stories from the real Storybook index, when one is built', () => {
    const index = path.join(root, 'apps/storybook/dist/index.json');
    if (!fs.existsSync(index)) return;
    const entries = JSON.parse(fs.readFileSync(index, 'utf8')).entries;
    const unknown = Object.keys(entries)
      .filter(id => id.startsWith('a11y-scroll-region-name--'))
      .map(id => ({id, component: 'unknown/a11y-scroll-region-name'}));
    const ids = changedUnownedStoryIds(entries, unknown, [
      'apps/storybook/stories/ScrollRegionA11y.stories.tsx',
    ]);
    expect(ids.length).toBeGreaterThanOrEqual(6);
    expect(ids.every(id => id.startsWith('a11y-scroll-region-name--'))).toBe(
      true,
    );
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
