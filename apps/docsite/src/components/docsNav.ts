// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file docsNav.ts
 * @input Generated package and docs registries, component sidebar data
 * @output The docs sidebar model with only the fields DocsShell reads
 * @position Server-side projection that the (docs) layout passes to DocsShell
 *
 * SYNC: When DocsShell reads another registry field, add it here.
 */

import {packages, type PackageMeta} from '../generated/packageRegistry';
import {docTopics, type DocTopic} from '../generated/docsRegistry';
import {
  getComponentSidebarData,
  type ComponentSidebarEntry,
  type ComponentSidebarGroup,
  type ComponentSidebarItem,
} from './componentSidebarData';

export type DocsNavPackage = Pick<
  PackageMeta,
  'name' | 'displayName' | 'canaryOnly'
>;

export type DocsNavTopic = Pick<DocTopic, 'topic' | 'title' | 'category'>;

export type DocsNavEntry = Pick<
  ComponentSidebarEntry,
  'type' | 'name' | 'displayName' | 'href' | 'packageName'
>;

export interface DocsNavGroup extends Pick<
  ComponentSidebarGroup,
  'type' | 'label' | 'displayName' | 'packageName'
> {
  entries: DocsNavEntry[];
}

export type DocsNavItem = DocsNavEntry | DocsNavGroup;

export interface DocsNavCanaryCategory {
  packageName: string;
  displayName: string;
  componentItems: DocsNavItem[];
  utilities: DocsNavEntry[];
}

export interface DocsNav {
  packages: DocsNavPackage[];
  docTopics: DocsNavTopic[];
  componentItems: DocsNavItem[];
  utilities: DocsNavEntry[];
  canaryCategories: DocsNavCanaryCategory[];
}

function toNavEntry({
  type,
  name,
  displayName,
  href,
  packageName,
}: ComponentSidebarEntry): DocsNavEntry {
  return {type, name, displayName, href, packageName};
}

function toNavItem(item: ComponentSidebarItem): DocsNavItem {
  if (item.type === 'entry') {
    return toNavEntry(item);
  }
  const {type, label, displayName, packageName, entries} = item;
  return {
    type,
    label,
    displayName,
    packageName,
    entries: entries.map(toNavEntry),
  };
}

/**
 * React serializes the props of a client component into every page that
 * renders it. The registries hold full readmes, changelogs, and doc sections,
 * so the shell gets this small projection and not the registries.
 */
export function getDocsNav(): DocsNav {
  const {componentItems, utilities, canaryCategories} =
    getComponentSidebarData();
  return {
    packages: packages.map(({name, displayName, canaryOnly}) => ({
      name,
      displayName,
      canaryOnly,
    })),
    docTopics: docTopics.map(({topic, title, category}) => ({
      topic,
      title,
      category,
    })),
    componentItems: componentItems.map(toNavItem),
    utilities: utilities.map(toNavEntry),
    canaryCategories: canaryCategories.map(category => ({
      packageName: category.packageName,
      displayName: category.displayName,
      componentItems: category.componentItems.map(toNavItem),
      utilities: category.utilities.map(toNavEntry),
    })),
  };
}
