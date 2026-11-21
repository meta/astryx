// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file listLayoutUpdates.shared.test.tsx
 * @input Two loads of listLayoutUpdates, as the package's List and a swizzled
 *   ListItem (or the reverse) each carry one
 * @output Proves a row reported by one load's List reads as reported in the
 *   other load, and a leaving row's kept presentation lands where every load
 *   reads it
 * @position Shared-state tests for listLayoutUpdates.ts (spec:AST-110 FR3)
 */

import {act, renderHook} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

/** One load of the module, as the package or a copy has. */
async function load() {
  vi.resetModules();
  return import('./listLayoutUpdates');
}

afterEach(async () => {
  (await import('../utils/sharedRealm')).resetSharedStateForTest('list/');
  vi.resetModules();
});

describe('List layout state shared by the package and a swizzled copy', () => {
  it("reads a row the other load's List reported", async () => {
    const pkg = await load();
    const copy = await load();
    const {useAnimatedLayout} = await import('../hooks/useAnimatedLayout');
    const list = document.createElement('ul');
    const row = document.createElement('li');
    list.append(row);
    document.body.append(list);
    const listRef = {current: list};
    const {result} = renderHook(() =>
      pkg.useListLayoutUpdates(
        listRef,
        useAnimatedLayout({containerRef: listRef}),
      ),
    );
    // The List measures before a commit; a leaving ListItem then asks
    // whether its row was reported.
    act(() => {
      result.current();
    });
    expect(copy.isReportedRow(row)).toBe(true);
    list.remove();
  });

  it("keeps a leaving row's presentation where every load reads it", async () => {
    const copy = await load();
    const {sharedWeakMap} = await import('../utils/sharedRealm');
    const row = document.createElement('li');
    row.style.transform = 'translateX(40px)';
    Object.assign(row, {getAnimations: () => []});
    document.body.append(row);
    copy.keepPresentation(row);
    // The package's List writes the record back as the row exits.
    expect(
      sharedWeakMap<HTMLElement, unknown>(
        'list/list-layout-updates/kept-styles',
        1,
      ).get(row),
    ).toBeDefined();
    row.remove();
  });
});
