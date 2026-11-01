// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, describe, expect, it, vi} from 'vitest';
import {lockSheetSelection} from './sheetSelectionLock';

/** A sheet with a row of text in it. */
function sheetWithRow() {
  const sheet = document.createElement('div');
  const row = document.createElement('span');
  row.textContent = 'Place 3';
  sheet.appendChild(row);
  document.body.appendChild(sheet);
  return {sheet, row};
}

/** What a long press on `node` does: Chromium fires `selectstart` first. */
function longPressSelects(node: Node): boolean {
  const event = new Event('selectstart', {bubbles: true, cancelable: true});
  node.dispatchEvent(event);
  return !event.defaultPrevented;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('lockSheetSelection', () => {
  it('elsewhere, cancels the selection a long press would start and changes no style', () => {
    vi.stubGlobal('CSS', {supports: () => false});
    const {sheet, row} = sheetWithRow();
    const release = lockSheetSelection([sheet], row);
    expect(longPressSelects(row)).toBe(false);
    expect(sheet.getAttribute('style')).toBeNull();
    expect(row.getAttribute('style')).toBeNull();
    release();
    expect(longPressSelects(row)).toBe(true);
    // Idempotent: a second release changes nothing.
    release();
    expect(longPressSelects(row)).toBe(true);
  });

  it('elsewhere, leaves a text field its selection, as the gesture system does: a held finger places its caret', () => {
    vi.stubGlobal('CSS', {supports: () => false});
    const {sheet, row} = sheetWithRow();
    const field = document.createElement('input');
    const notes = document.createElement('textarea');
    sheet.append(field, notes);
    const release = lockSheetSelection([sheet], field);
    expect(longPressSelects(field)).toBe(true);
    expect(longPressSelects(notes)).toBe(true);
    // The row's own text is still refused, from its text node too.
    expect(longPressSelects(row)).toBe(false);
    expect(longPressSelects(row.firstChild as Text)).toBe(false);
    release();
  });

  it('on iOS WebKit, turns user-select and the callout off on the whole sheet until the release', () => {
    vi.stubGlobal('CSS', {
      supports: (condition: string) =>
        condition.includes('-webkit-touch-callout'),
    });
    const {sheet, row} = sheetWithRow();
    sheet.style.setProperty('user-select', 'text');
    const release = lockSheetSelection([sheet], row);
    expect(sheet.style.getPropertyValue('user-select')).toBe('none');
    // On the whole sheet, not the row: on the element under the finger alone,
    // iOS selected a word beside it.
    expect(row.getAttribute('style')).toBeNull();
    release();
    expect(sheet.style.getPropertyValue('user-select')).toBe('text');
  });
});
