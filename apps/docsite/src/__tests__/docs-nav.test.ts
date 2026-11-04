// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Client data models: the (docs) layout gives DocsShell, and the /themes
 * page gives ThemePackagePage, a small projection of the registries. Both are
 * client components, so React serializes their props into the page, and the
 * modules they import ship to the browser.
 */

import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, it, expect} from 'vitest';
import {packages} from '../generated/packageRegistry';
import {docTopics} from '../generated/docsRegistry';
import {templates} from '../generated/templateRegistry';
import {flattenComponentSidebarEntries} from '../components/componentSidebarData';
import {getDocsNav, type DocsNavItem} from '../components/docsNav';
import {
  getThemeExplorerPackages,
  getThemeShowcaseSource,
} from '../components/themeExplorerData';

function expectOnlyTypeImports(file: string, dataImportPattern: RegExp) {
  const source = readFileSync(join(__dirname, '..', file), 'utf8');
  const dataImports = [...source.matchAll(dataImportPattern)];
  expect(dataImports.length).toBeGreaterThan(0);
  for (const [statement, typeOnly] of dataImports) {
    expect(typeOnly, statement).toBeTruthy();
  }
}

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
    expectOnlyTypeImports(
      'components/DocsShell.tsx',
      /^import\s+(type\s+)?[^;]*?from\s+'(\.\.\/generated\/[^']+|\.\/componentSidebarData|\.\/docsNav)';/gm,
    );
  });
});

describe('theme explorer model', () => {
  const themePackages = getThemeExplorerPackages();

  it('keeps every theme package with only the fields the explorer reads', () => {
    const registryThemes = packages.filter(p =>
      p.name.startsWith('@astryxdesign/theme-'),
    );
    expect(themePackages).toHaveLength(registryThemes.length);
    expect(themePackages).toEqual(
      expect.arrayContaining(
        registryThemes.map(({name, displayName}) => ({name, displayName})),
      ),
    );
  });

  it('lists themes in gallery order, then the rest alphabetically', () => {
    const galleryOrder = [
      '@astryxdesign/theme-neutral',
      '@astryxdesign/theme-stone',
      '@astryxdesign/theme-gothic',
      '@astryxdesign/theme-matcha',
      '@astryxdesign/theme-y2k',
      '@astryxdesign/theme-butter',
    ];
    const names = themePackages.map(p => p.name);
    const ordered = names.filter(name => galleryOrder.includes(name));
    const rest = names.filter(name => !galleryOrder.includes(name));
    expect(ordered).toEqual(galleryOrder.filter(name => names.includes(name)));
    expect(names).toEqual([...ordered, ...rest]);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b)));
  });

  it('gives the theme-showcase template source to Open in Playground', () => {
    const showcase = templates.find(t => t.slug === 'theme-showcase');
    expect(showcase?.source).toBeTruthy();
    expect(getThemeShowcaseSource()).toBe(showcase?.source);
  });

  it('keeps package and template registries out of the ThemePackagePage client bundle', () => {
    // The theme objects render every theme preview, so they stay in the bundle.
    expectOnlyTypeImports(
      'components/ThemePackagePage.tsx',
      /^import\s+(type\s+)?[^;]*?from\s+'(\.\.\/generated\/(?!themeRegistry')[^']+|\.\/themeExplorerData)';/gm,
    );
  });
});
