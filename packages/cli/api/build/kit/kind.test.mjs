// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for ideaKind on a part noun whose head ends on "of": what
 * follows says what the idea is made of. Records make a page; components, or
 * a page family the part goes in, keep a part.
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

/** @param {string} name @param {string[]} [keywords] */
const component = (name, keywords = []) => ({name, keywords});

describe('ideaKind: what a part noun is made of', () => {
  const pages = [
    page('table', 'Table - Basic'),
    page('table-filter', 'Table - Filtering'),
    page('dashboard', 'Dashboard'),
    page('dashboard-progress', 'Dashboard - Progress'),
  ];
  const components = [
    component('List'),
    component('Toolbar'),
    component('Button'),
    component('Table'),
  ];
  /** @param {string} idea */
  const kind = idea => ideaKind(idea, pages, components);

  it('takes a part noun made of records as a page', () => {
    expect(kind('a list of orders with status badges')).toBe('page');
    expect(kind('a toolbar of recent orders')).toBe('page');
  });

  it('keeps a part noun made of components as a part', () => {
    expect(kind('a toolbar of buttons')).toBe('part');
  });

  it('keeps a part noun whose "of" names a page family as a part', () => {
    expect(kind('a toolbar of the progress dashboard')).toBe('part');
  });

  it('keeps a part noun without "of" as before', () => {
    expect(kind('a toolbar')).toBe('part');
    expect(kind('a list with status badges')).toBe('part');
  });

  it('keeps a family noun before "of" as a page', () => {
    expect(kind('a dashboard of weekly runs')).toBe('page');
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

  it('starts a single control made of details from the app shell', async () => {
    const {kind, start: s} = await start('a tooltip of order details');
    expect(kind).toBe('part');
    expect(s).toBeNull();
  });

  it('starts a list that names its page family from that page', async () => {
    const {kind, start: s} = await start('a list of settings toggles');
    expect(kind).toBe('part');
    expect(s?.name).toBe('settings');
  });

  it('starts a list of records from a page template', async () => {
    const {kind, start: s} = await start(
      'a list of planning jobs with status badges',
    );
    expect(kind).toBe('page');
    expect(s).not.toBeNull();
    expect(s?.family).not.toBe('Shell');
  });
});
