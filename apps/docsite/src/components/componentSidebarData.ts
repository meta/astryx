// Copyright (c) Meta Platforms, Inc. and affiliates.

import {components} from '../generated/componentRegistry';
import {groupedComponents} from '../generated/groupedComponentRegistry';
import {packages} from '../generated/packageRegistry';
import type {
  ComponentItem,
  GroupedEntry,
  GroupedGroup,
} from '../generated/groupedComponentRegistry';

export interface ComponentSidebarEntry extends GroupedEntry {
  packageName: string;
  isReady: boolean;
}

export interface ComponentSidebarGroup extends Omit<GroupedGroup, 'entries'> {
  packageName: string;
  isReady: boolean;
  entries: ComponentSidebarEntry[];
}

export type ComponentSidebarItem =
  ComponentSidebarEntry | ComponentSidebarGroup;

export interface CanaryComponentCategory {
  packageName: string;
  displayName: string;
  componentItems: ComponentSidebarItem[];
  utilities: ComponentSidebarEntry[];
}

export interface ComponentSidebarData {
  componentItems: ComponentSidebarItem[];
  utilities: ComponentSidebarEntry[];
  canaryCategories: CanaryComponentCategory[];
}

const componentReadiness = new Map(
  Object.entries(components).flatMap(([packageName, entries]) =>
    entries.map(entry => [`${packageName}:${entry.name}`, entry.isReady]),
  ),
);

const packageDisplayNames = new Map(
  packages.map(pkg => [pkg.name, pkg.displayName]),
);

function enrichEntry(
  entry: GroupedEntry,
  packageName: string,
): ComponentSidebarEntry {
  return {
    ...entry,
    packageName,
    isReady: componentReadiness.get(`${packageName}:${entry.name}`) ?? true,
  };
}

function enrichItem(
  item: ComponentItem,
  packageName: string,
): ComponentSidebarItem {
  if (item.type === 'entry') {
    return enrichEntry(item, packageName);
  }
  const entries = item.entries.map(entry =>
    enrichEntry({...entry, type: 'entry', description: ''}, packageName),
  );
  return {
    ...item,
    packageName,
    isReady: entries.every(entry => entry.isReady),
    entries,
  };
}

function sortItems(items: ComponentSidebarItem[]) {
  items.sort((a, b) => {
    const aKey = a.type === 'entry' ? a.name : a.label;
    const bKey = b.type === 'entry' ? b.name : b.label;
    return aKey.localeCompare(bKey);
  });
}

function addMergedItem(
  items: ComponentSidebarItem[],
  groups: Map<string, ComponentSidebarGroup>,
  item: ComponentSidebarItem,
) {
  if (item.type === 'entry') {
    items.push(item);
    return;
  }
  const existing = groups.get(item.label);
  if (!existing) {
    groups.set(item.label, item);
    return;
  }
  existing.entries.push(...item.entries);
  existing.entries.sort((a, b) => a.name.localeCompare(b.name));
  if (existing.packageName !== item.packageName) {
    existing.packageName = 'multiple';
  }
}

function packageItems(
  packageName: string,
  isReady: boolean,
): {
  componentItems: ComponentSidebarItem[];
  utilities: ComponentSidebarEntry[];
} {
  const grouped = groupedComponents[packageName];
  const componentItems: ComponentSidebarItem[] = [];
  const utilities = grouped.utilities
    .map(entry =>
      enrichEntry({...entry, type: 'entry', description: ''}, packageName),
    )
    .filter(entry => entry.isReady === isReady);

  for (const rawItem of grouped.items) {
    const item = enrichItem(rawItem, packageName);
    if (item.type === 'entry') {
      if (item.isReady === isReady) {
        componentItems.push(item);
      }
      continue;
    }
    const entries = item.entries.filter(entry => entry.isReady === isReady);
    if (entries.length > 0) {
      componentItems.push({...item, entries, isReady});
    }
  }

  sortItems(componentItems);
  utilities.sort((a, b) => a.name.localeCompare(b.name));
  return {componentItems, utilities};
}

/**
 * Single source of truth for the component sidebar. Ready components retain
 * the unified family view. Components that are not ready are separated by
 * their owning package, so the canary category carries their release status
 * once instead of repeating it on every child.
 */
export function getComponentSidebarData(): ComponentSidebarData {
  const componentItems: ComponentSidebarItem[] = [];
  const componentGroups = new Map<string, ComponentSidebarGroup>();
  const utilities: ComponentSidebarEntry[] = [];
  const canaryCategories: CanaryComponentCategory[] = [];

  const groupedPackages = Object.keys(groupedComponents).sort(
    (a, b) =>
      Number(b === '@astryxdesign/core') - Number(a === '@astryxdesign/core'),
  );

  for (const packageName of groupedPackages) {
    const ready = packageItems(packageName, true);
    for (const item of ready.componentItems) {
      addMergedItem(componentItems, componentGroups, item);
    }
    utilities.push(...ready.utilities);

    const canary = packageItems(packageName, false);
    if (canary.componentItems.length > 0 || canary.utilities.length > 0) {
      canaryCategories.push({
        packageName,
        displayName: packageDisplayNames.get(packageName) ?? packageName,
        ...canary,
      });
    }
  }

  componentItems.push(...componentGroups.values());
  sortItems(componentItems);
  utilities.sort((a, b) => a.name.localeCompare(b.name));
  canaryCategories.sort((a, b) => a.displayName.localeCompare(b.displayName));

  return {componentItems, utilities, canaryCategories};
}

export function flattenComponentSidebarEntries(
  {
    componentItems,
    utilities,
    canaryCategories,
  }: ComponentSidebarData = getComponentSidebarData(),
): ComponentSidebarEntry[] {
  const entries: ComponentSidebarEntry[] = [];

  const appendItems = (items: ComponentSidebarItem[]) => {
    for (const item of items) {
      if (item.type === 'entry') {
        entries.push(item);
      } else {
        entries.push(...item.entries);
      }
    }
  };

  appendItems(componentItems);
  entries.push(...utilities);
  for (const category of canaryCategories) {
    appendItems(category.componentItems);
    entries.push(...category.utilities);
  }
  return entries;
}
