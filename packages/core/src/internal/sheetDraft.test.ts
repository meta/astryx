// Copyright (c) Meta Platforms, Inc. and affiliates.
import {describe, expect, it} from 'vitest';
import {hasSameSelection, nameSheetDraftChange} from './sheetDraft';

const a = {id: 'a', label: 'A'};
const b = {id: 'b', label: 'B'};
const c = {id: 'c', label: 'C'};

describe('hasSameSelection', () => {
  it('ignores order, so a row unchecked and checked again is no change', () => {
    expect(hasSameSelection([a, b], [b, a])).toBe(true);
    expect(hasSameSelection([a, b], [a])).toBe(false);
    expect(hasSameSelection([a], [a, b])).toBe(false);
    expect(hasSameSelection([], [])).toBe(true);
  });
});

describe('nameSheetDraftChange', () => {
  it('returns null for an unchanged draft', () => {
    expect(nameSheetDraftChange([a], [a], {item: b, type: 'add'})).toBeNull();
  });

  it('names the last edit while it still holds', () => {
    expect(
      nameSheetDraftChange([a], [a, b, c], {item: c, type: 'add'}),
    ).toEqual({item: c, type: 'add'});
    expect(
      nameSheetDraftChange([a], [a, c], {item: c, type: 'create'}),
    ).toEqual({item: c, type: 'create'});
    expect(
      nameSheetDraftChange([a, b], [a], {item: b, type: 'remove'}),
    ).toEqual({item: b, type: 'remove'});
  });

  it('after an undone edit, falls back to a removal when the last edit removed, else to the net add, else to the net removal', () => {
    // Removed a, added b, removed b again: the last edit (remove b) does not
    // hold, b was never selected at open; the net removal of a does.
    expect(nameSheetDraftChange([a], [], {item: b, type: 'remove'})).toEqual({
      item: a,
      type: 'remove',
    });
    // Added c, then re-added a after unchecking it: a was selected at open,
    // so that add does not hold; c is the net add.
    expect(nameSheetDraftChange([a], [c, a], {item: a, type: 'add'})).toEqual({
      item: c,
      type: 'add',
    });
    // The create of c is the net add; a later add that no longer holds keeps
    // the create type for c only when the last edit was that create.
    expect(nameSheetDraftChange([a], [a, c], {item: a, type: 'add'})).toEqual({
      item: c,
      type: 'add',
    });
    // Nothing added; a removal that is not the last edit.
    expect(nameSheetDraftChange([a, b], [b], {item: b, type: 'add'})).toEqual({
      item: a,
      type: 'remove',
    });
  });
});
