// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Component sidebar grouping: ready families stay unified, and canary-only
 * packages are grouped by package with their components marked not ready.
 */

import {describe, it, expect} from 'vitest';
import {components} from '../generated/componentRegistry';
import {packages} from '../generated/packageRegistry';
import {
  flattenComponentSidebarEntries,
  getComponentSidebarData,
} from '../components/componentSidebarData';

describe('component sidebar data', () => {
  it('marks canary-only package components not ready, and every other one ready', () => {
    const entries = flattenComponentSidebarEntries();
    const canaryPackages = new Set(
      packages.filter(pkg => pkg.canaryOnly).map(pkg => pkg.name),
    );
    const canaryEntries = entries.filter(entry =>
      canaryPackages.has(entry.packageName),
    );

    expect(canaryEntries.length).toBeGreaterThan(0);
    expect(canaryEntries.every(entry => !entry.isReady)).toBe(true);
    expect(
      entries
        .filter(entry => !canaryPackages.has(entry.packageName))
        .every(entry => entry.isReady),
    ).toBe(true);
  });

  it('keeps ready families unified and groups canary components by package', () => {
    const {componentItems, canaryCategories} = getComponentSidebarData();
    const readyGroups = componentItems.filter(item => item.type === 'group');

    expect(readyGroups.filter(group => group.label === 'Chat')).toHaveLength(1);
    expect(
      readyGroups
        .find(group => group.label === 'Chat')
        ?.entries.every(entry => entry.isReady),
    ).toBe(true);

    // One canary category per canary-only package with components; a
    // configured integration that is a stable release joins the ready view.
    expect(canaryCategories.map(category => category.displayName)).toEqual(
      packages
        .filter(pkg => pkg.canaryOnly && components[pkg.name]?.length)
        .map(pkg => pkg.displayName)
        .sort((a, b) => a.localeCompare(b)),
    );
    const chartEntries = canaryCategories.flatMap(category =>
      category.componentItems.flatMap(item =>
        item.type === 'entry' || item.label !== 'Charts' ? [] : item.entries,
      ),
    );
    expect(chartEntries.map(entry => entry.name)).toEqual(
      expect.arrayContaining(['Chart', 'ChartSwatch', 'ChartBar', 'ChartLine']),
    );
    expect(chartEntries.every(entry => !entry.isReady)).toBe(true);

    const lab = canaryCategories.find(
      category => category.displayName === 'Lab',
    );
    const threeD = lab?.componentItems.find(
      item => item.type === 'group' && item.label === '3D',
    );
    expect(threeD?.displayName).toBe('3D');
  });
});
