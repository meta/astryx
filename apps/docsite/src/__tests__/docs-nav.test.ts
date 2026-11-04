// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Docs nav model: the (docs) layout gives DocsShell a small projection of
 * the registries. DocsShell is a client component, so React serializes its
 * props into every docs page, and the modules it imports ship to the browser.
 */

import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, it, expect} from 'vitest';
import {packages} from '../generated/packageRegistry';
import {docTopics} from '../generated/docsRegistry';
import {flattenComponentSidebarEntries} from '../components/componentSidebarData';
import {getDocsNav, type DocsNavItem} from '../components/docsNav';

function flattenNavEntries(items: DocsNavItem[]) {
  return items.flatMap(item => (item.type === 'entry' ? [item] : item.entries));
}

describe('docs nav model', () => {
  const nav = getDocsNav();

  it('keeps every package and doc topic, in registry order', () => {
    expect(nav.packages).toEqual(
      packages.map(({name, displayName, canaryOnly}) => ({
        name,
        displayName,
        canaryOnly,
      })),
    );
    expect(nav.docTopics).toEqual(
      docTopics.map(({topic, title, category}) => ({topic, title, category})),
    );
  });

  it('keeps every component sidebar entry, in sidebar order', () => {
    const navEntries = [
      ...flattenNavEntries(nav.componentItems),
      ...nav.utilities,
      ...nav.canaryCategories.flatMap(category => [
        ...flattenNavEntries(category.componentItems),
        ...category.utilities,
      ]),
    ];
    expect(navEntries).toEqual(
      flattenComponentSidebarEntries().map(
        ({type, name, displayName, href, packageName}) => ({
          type,
          name,
          displayName,
          href,
          packageName,
        }),
      ),
    );
  });

  it('stays small enough to inline into every docs page', () => {
    // The full registries are megabytes. The nav model is a few tens of KB.
    expect(JSON.stringify(nav).length).toBeLessThan(100_000);
  });

  it('keeps registry modules out of the DocsShell client bundle', () => {
    const source = readFileSync(
      join(__dirname, '../components/DocsShell.tsx'),
      'utf8',
    );
    const dataImports = [
      ...source.matchAll(
        /^import\s+(type\s+)?[^;]*?from\s+'(\.\.\/generated\/[^']+|\.\/componentSidebarData|\.\/docsNav)';/gm,
      ),
    ];
    expect(dataImports.length).toBeGreaterThan(0);
    for (const [statement, typeOnly] of dataImports) {
      expect(typeOnly, statement).toBeTruthy();
    }
  });
});
