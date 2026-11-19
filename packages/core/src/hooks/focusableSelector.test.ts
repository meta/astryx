// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {isTabStop} from './focusableSelector';

function buttonWith(tabindex: string | null): HTMLButtonElement {
  const button = document.createElement('button');
  if (tabindex != null) {
    button.setAttribute('tabindex', tabindex);
  }
  return button;
}

describe('isTabStop', () => {
  it('counts an element without tabindex, or with zero or a positive one', () => {
    expect(isTabStop(buttonWith(null))).toBe(true);
    expect(isTabStop(buttonWith('0'))).toBe(true);
    expect(isTabStop(buttonWith('2'))).toBe(true);
  });

  it('leaves out an element with any negative tabindex', () => {
    expect(isTabStop(buttonWith('-1'))).toBe(false);
    expect(isTabStop(buttonWith('-2'))).toBe(false);
  });

  it('counts an element whose tabindex is not a number, as the browser does', () => {
    expect(isTabStop(buttonWith('none'))).toBe(true);
  });
});
