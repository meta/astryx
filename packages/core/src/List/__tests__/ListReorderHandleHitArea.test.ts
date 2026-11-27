// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListReorderHandleHitArea.test.ts
 * @input reorderHandleGrowth from ListReorderHandle.tsx
 * @output Checks that a finger's target on a reorder handle stays inside its
 *   list on the block axis
 * @position Unit test for the handle's touch hit area growth
 */

import {afterEach, describe, expect, it} from 'vitest';
import {reorderHandleGrowth} from '../ListReorderHandle';

const identity = <T>(rect: T) => rect;

/** A list from 300 to 380 px holding one row with a handle, in the page. */
function handleInList(): HTMLElement {
  const list = document.createElement('ul');
  const row = document.createElement('li');
  const handle = document.createElement('button');
  row.append(handle);
  list.append(row);
  document.body.append(list);
  list.getBoundingClientRect = () =>
    DOMRect.fromRect({x: 0, y: 300, width: 300, height: 80});
  return handle;
}

describe('reorderHandleGrowth', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("keeps the first row's 44 px target from reaching above the list", () => {
    // A 16 px grip 12 px below the list's top: it grows 14 px each way
    // toward 44 px, but only 12 px up.
    const growth = reorderHandleGrowth(
      {top: 312, bottom: 328, left: 270, right: 286},
      identity,
      handleInList(),
    );
    expect(growth).toEqual({top: 12, right: 14, bottom: 14, left: 14});
  });

  it("keeps the last row's 44 px target from reaching below the list", () => {
    const growth = reorderHandleGrowth(
      {top: 352, bottom: 368, left: 270, right: 286},
      identity,
      handleInList(),
    );
    expect(growth).toEqual({top: 14, right: 14, bottom: 12, left: 14});
  });

  it('grows the full 44 px where the list leaves room', () => {
    const growth = reorderHandleGrowth(
      {top: 332, bottom: 348, left: 270, right: 286},
      identity,
      handleInList(),
    );
    expect(growth).toEqual({top: 14, right: 14, bottom: 14, left: 14});
  });

  it('grows the full 44 px for a handle outside any list', () => {
    const handle = document.createElement('button');
    const growth = reorderHandleGrowth(
      {top: 0, bottom: 16, left: 0, right: 16},
      identity,
      handle,
    );
    expect(growth).toEqual({top: 14, right: 14, bottom: 14, left: 14});
  });
});
