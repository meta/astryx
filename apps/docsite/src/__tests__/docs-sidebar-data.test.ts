// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The Guide and Foundations groups of the docs sidebar: each page in its
 * group's order, with a page that names a parent nested under that parent's
 * item, in the parent's group.
 */

import {describe, expect, it} from 'vitest';
import {
  docsSidebarGroups,
  type DocsSidebarItem,
} from '../components/docsSidebarData';
import {docTopics, type DocTopic} from '../generated/docsRegistry';

const page = (
  topic: string,
  title: string,
  extra: Partial<DocTopic> = {},
): DocTopic => ({
  topic,
  title,
  description: '',
  category: 'guide',
  sections: [],
  ...extra,
});

const shape = (items: DocsSidebarItem[]) =>
  items.map(({page: p, children}) => [p.topic, children.map(c => c.topic)]);

describe('docs sidebar groups', () => {
  it('nests a page under its parent and keeps the rest flat, in group order', () => {
    const groups = docsSidebarGroups([
      page('migration', 'Migration'),
      page('kit-extras', 'Extras', {parent: 'kit'}),
      page('kit', 'Kit'),
      page('getting-started', 'Getting Started'),
      page('color', 'Color', {category: 'foundations'}),
      page('tokens', 'Tokens', {category: 'foundations'}),
    ]);
    expect(shape(groups.guide)).toEqual([
      ['kit', ['kit-extras']],
      ['migration', []],
    ]);
    expect(shape(groups.foundations)).toEqual([
      ['tokens', []],
      ['color', []],
    ]);
  });

  it("moves a page into its parent's group", () => {
    const groups = docsSidebarGroups([
      page('icon-files', 'Icon files', {parent: 'icons'}),
      page('layout', 'Layout'),
      page('icons', 'Icons', {category: 'foundations'}),
    ]);
    expect(shape(groups.guide)).toEqual([['layout', []]]);
    expect(shape(groups.foundations)).toEqual([['icons', ['icon-files']]]);
  });

  it('keeps a page at the top of its own group when its parent is not in the sidebar, or is nested', () => {
    const groups = docsSidebarGroups([
      page('orphan', 'Orphan', {parent: 'missing'}),
      page('start', 'Start', {parent: 'getting-started'}),
      page('getting-started', 'Getting Started'),
      page('a', 'A'),
      page('b', 'B', {parent: 'a'}),
      page('c', 'C', {parent: 'b'}),
    ]);
    expect(shape(groups.guide)).toEqual([
      ['a', ['b']],
      ['c', []],
      ['orphan', []],
      ['start', []],
    ]);
  });

  it('shows the site pages under their parents', () => {
    const groups = docsSidebarGroups(docTopics);
    const childrenOf = (items: DocsSidebarItem[], topic: string) =>
      items
        .find(({page: p}) => p.topic === topic)
        ?.children.map(c => [c.topic, c.title]);
    expect(childrenOf(groups.foundations, 'icons')).toEqual([
      ['cli-experimental-icon-set-files', 'Icon set files'],
      ['cli-experimental-icon-sets', 'Icon sets'],
    ]);
    expect(childrenOf(groups.guide, 'styling-overview')).toEqual([
      ['styling', 'Styling components'],
    ]);
    const topLevel = groups.guide.map(({page: p}) => p.topic);
    expect(topLevel).not.toContain('styling');
    expect(topLevel).not.toContain('cli-experimental-icon-set-files');
    expect(topLevel).not.toContain('cli-experimental-icon-sets');
  });
});
