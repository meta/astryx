// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for ideaKind on ideas that list pieces: a component and its
 * contents stay one part, and a component whose category declares a page
 * family holds that page's records.
 */

import {describe, it, expect} from 'vitest';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ideaKind} from './kind.mjs';
import {pickStart, rankPages} from './rank.mjs';
import {loadComponents, loadPageTemplates} from '../_adapter.mjs';

// api/build/kit/ -> up 5 = repo root (has packages/core and the templates).
const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../..',
);

/**
 * @param {string} name
 * @param {string} category
 */
const page = (name, category) => ({
  name,
  displayName: name,
  category,
  description: '',
  keywords: [],
  command: `astryx template ${name} --type page`,
});

/**
 * @param {string} name
 * @param {string} [category]
 */
const component = (name, category) => ({name, keywords: [], category});

describe('ideaKind: a component and the pieces it holds', () => {
  const pages = [
    page('table', 'Table - Basic'),
    page('table-filter', 'Table - Filtering'),
    page('settings', 'Settings'),
    page('settings-dialog', 'Settings - Dialog'),
  ];
  const components = [
    component('LayoutPanel', 'Layout'),
    component('Dialog', 'Overlay'),
    component('List', 'Table & List'),
    component('Button', 'Action'),
    component('Selector', 'Form Controls'),
  ];
  /** @param {string} idea */
  const kind = idea => ideaKind(idea, pages, components);

  it('keeps a component with its listed contents as one part', () => {
    expect(kind('a side panel with an owner, a status, and a history')).toBe(
      'part',
    );
  });

  it('reads a noun by the component whose whole name it is', () => {
    const withChat = [...components, component('ChatDictationButton', 'Chat')];
    expect(
      ideaKind(
        'a button with a product image, a price, and a rating',
        pages,
        withChat,
      ),
    ).toBe('part');
  });

  it('takes a list of peers after a comma as a page', () => {
    expect(kind('a side panel, an owner chart, and a history')).toBe('page');
  });

  it('takes pieces that name a page family as a page', () => {
    expect(kind('a dialog with a filter table, an owner, and a history')).toBe(
      'page',
    );
  });

  it('takes a component that holds records with listed pieces as a page', () => {
    expect(
      kind('a todo list with an add input, checkbox rows, and a priority'),
    ).toBe('page');
  });

  it('takes a component that holds records, made of records, as a page', () => {
    expect(kind('a list of planning jobs with status badges')).toBe('page');
  });

  it('keeps a component made of components, or placed in a family, a part', () => {
    expect(kind('a list of buttons')).toBe('part');
    expect(kind('a list of settings toggles')).toBe('part');
    expect(kind('a dialog of planning jobs')).toBe('part');
  });

  it('reads a category with no page family, or no category, as a control', () => {
    const noCategory = [component('List'), component('LayoutPanel')];
    expect(ideaKind('a list of planning jobs', pages, noCategory)).toBe('part');
  });
});

describe('ideaKind and pickStart on the shipped catalog', () => {
  const shipped = Promise.all([loadPageTemplates(REPO), loadComponents(REPO)]);
  /** @param {string} query */
  const start = async query => {
    const [catalog, components] = await shipped;
    const kind = ideaKind(query, catalog, components);
    return {kind, start: pickStart(rankPages(query, catalog), kind)};
  };

  it('starts a panel with its contents from the app shell', async () => {
    const {kind, start: s} = await start(
      'a side panel with an assignee selector, explicit save, and an approval history',
    );
    expect(kind).toBe('part');
    expect(s).toBeNull();
  });

  it('starts a list of records from a page template', async () => {
    const {kind, start: s} = await start(
      'a list of planning jobs with status badges',
    );
    expect(kind).toBe('page');
    expect(s).not.toBeNull();
    expect(s?.family).not.toBe('Shell');
  });

  it('starts a single control made of records from the app shell', async () => {
    for (const idea of [
      'a dropdown of course lessons',
      'a section of products',
    ]) {
      const {kind} = await start(idea);
      expect(kind).toBe('part');
    }
  });
});
