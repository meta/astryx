// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {isDisabledControl} from './pressDisabled';

function element(html: string): Element {
  const host = document.createElement('div');
  host.innerHTML = html;
  const found = host.querySelector('[data-subject]');
  if (found == null) {
    throw new Error('no [data-subject] element');
  }
  return found;
}

describe('isDisabledControl', () => {
  it.each([
    ['<button data-subject aria-disabled="true">Publish</button>'],
    ['<button data-subject disabled>Publish</button>'],
    ['<input data-subject disabled />'],
    ['<div data-subject role="menuitem" aria-disabled="true">Delete</div>'],
    // A disabled fieldset disables the controls inside it.
    ['<fieldset disabled><input data-subject /></fieldset>'],
  ])('is true for %s', html => {
    expect(isDisabledControl(element(html))).toBe(true);
  });

  it.each([
    ['<button data-subject>Publish</button>'],
    ['<button data-subject aria-disabled="false">Publish</button>'],
    // `disabled` means nothing on an element that is not a form control.
    ['<div data-subject disabled>Owner</div>'],
    ['<span data-subject>Owner</span>'],
  ])('is false for %s', html => {
    expect(isDisabledControl(element(html))).toBe(false);
  });
});
