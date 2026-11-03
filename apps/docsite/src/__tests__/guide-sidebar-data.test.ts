// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The Guide section of the docs sidebar: guide pages by title, with a
 * page that names a parent nested under that parent's item.
 */

import {describe, expect, it} from 'vitest';
import {guideSidebarItems} from '../components/guideSidebarData';
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

describe('guide sidebar items', () => {
  it('nests a page under its parent and keeps the rest flat, by title', () => {
    const items = guideSidebarItems([
      page('migration', 'Migration'),
      page('internationalization-calendars', 'Calendars', {
        parent: 'internationalization',
      }),
      page('internationalization', 'Internationalization'),
      page('getting-started', 'Getting Started'),
      page('tokens', 'Tokens', {category: 'foundations'}),
    ]);
    expect(
      items.map(({page: p, children}) => [p.topic, children.map(c => c.topic)]),
    ).toEqual([
      ['internationalization', ['internationalization-calendars']],
      ['migration', []],
    ]);
  });

  it('keeps a page whose parent is not a guide page at the top level', () => {
    const items = guideSidebarItems([
      page('orphan', 'Orphan', {parent: 'missing'}),
      page('layout', 'Layout'),
    ]);
    expect(items.map(({page: p}) => p.topic)).toEqual(['layout', 'orphan']);
    expect(items.every(({children}) => children.length === 0)).toBe(true);
  });

  it('shows Calendars under Internationalization on the site', () => {
    const i18n = guideSidebarItems(docTopics).find(
      ({page: p}) => p.topic === 'internationalization',
    );
    expect(i18n?.children.map(c => [c.topic, c.title])).toEqual([
      ['internationalization-calendars', 'Calendars'],
    ]);
  });
});
