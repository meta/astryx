// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {docs} from '../docs.mjs';
import {index} from './index.mjs';
import {loadDocsCatalog, holdsOwnName, projectTree} from '../_adapter.mjs';

const SLOW = 60_000;

describe('docs.index leaf', () => {
  it('lists each section by key, title, and summary', async () => {
    const res = await index('theme');
    expect(res.type).toBe('docs.index');
    expect(res.data).toMatchObject({name: 'theme', title: expect.any(String)});
    const keys = res.data.sections.map(s => s.id);
    expect(new Set(keys).size).toBe(keys.length);
    for (const entry of res.data.sections) {
      expect(Object.keys(entry)).toEqual(['id', 'title', 'package', 'summary']);
      expect(entry.package).toBe(res.package);
      expect(entry.summary.length).toBeLessThanOrEqual(240);
    }
  }, SLOW);

  it('names the sections the full topic has, with the same keys', async () => {
    const full = await docs('theme');
    const {data} = await index('theme');
    expect(data.sections.map(s => [s.id, s.title])).toEqual(
      full.data.sections.map(s => [s.id, s.title]),
    );
  }, SLOW);

  it('keeps every key the same in every language', async () => {
    const english = (await index('theme')).data.sections.map(s => s.id);
    for (const lang of ['zh', 'dense']) {
      const localized = await index('theme', {lang});
      expect(localized.data.sections.map(s => s.id)).toEqual(english);
    }
  }, SLOW);

  it('lists keys every section can be read by', async () => {
    const catalog = await loadDocsCatalog();
    const tree = await projectTree(catalog);
    for (const entry of catalog.entries()) {
      // A flat topic whose name is now owned by a namespace (e.g. layout)
      // cannot be read as a topic — skip it.
      if (!holdsOwnName(tree, catalog, entry)) continue;
      const {data} = await index(entry.name);
      for (const {id, title} of data.sections) {
        const read = await docs(entry.name, id);
        expect(read.data.title).toBe(title);
      }
    }
  }, SLOW);
});

describe('docs() topic reads', () => {
  it('returns the whole topic by default', async () => {
    const res = await docs('theme');
    expect(res.type).toBe('docs.detail');
    expect(res.data.sections[0].content.length).toBeGreaterThan(0);
  }, SLOW);

  it('returns the section index on request', async () => {
    const res = await docs('theme', undefined, {index: true});
    expect(res.type).toBe('docs.index');
  }, SLOW);
});
