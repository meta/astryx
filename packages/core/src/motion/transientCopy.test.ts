// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file transientCopy.test.ts
 * @input vitest, inertCopy
 * @output Unit coverage for the inert copy's form and anchor-name exclusion
 * @position Unit coverage for transientCopy.ts; the exit copy's own cases
 *   are in Layer/layerExitCopy.test.ts
 */

import {afterEach, describe, expect, it} from 'vitest';
import {inertCopy} from './transientCopy';

class CopyField extends HTMLElement {
  static formAssociated = true;
}
customElements.define('copy-field', CopyField);

afterEach(() => {
  document.body.replaceChildren();
});

describe('inertCopy', () => {
  it('gives no copied element an anchor name, so no live anchor has a second element', () => {
    const sheet = document.createElement('style');
    sheet.textContent = '.anchored { anchor-name: --row-anchor; }';
    document.head.append(sheet);
    const element = document.createElement('div');
    element.style.setProperty('anchor-name', '--menu-anchor');
    element.innerHTML =
      '<input style="anchor-name: --field-anchor"><b class="anchored"></b><span></span>';
    document.body.append(element);
    const copy = inertCopy(element);
    sheet.remove();
    if (copy == null) {
      throw new Error('no copy');
    }
    for (const node of [
      copy,
      copy.querySelector('input'),
      copy.querySelector('b'),
    ]) {
      expect(node?.style.getPropertyValue('anchor-name')).toBe('none');
    }
    // A copied element with no anchor name gets no style written.
    expect(copy.querySelector('span')?.getAttribute('style')).toBeNull();
    expect(element.style.getPropertyValue('anchor-name')).toBe('--menu-anchor');
    expect(
      element.querySelector('input')?.style.getPropertyValue('anchor-name'),
    ).toBe('--field-anchor');
  });

  it('joins no form when it is laid inside one, nor does a form-associated custom element', () => {
    const form = document.createElement('form');
    document.body.append(form);
    const element = document.createElement('div');
    element.innerHTML =
      '<input name="note" required><button>Send</button><copy-field></copy-field>';
    form.append(element);
    const copy = inertCopy(element);
    if (copy == null) {
      throw new Error('no copy');
    }
    form.append(copy);
    expect(copy.querySelector('input')?.form).toBeNull();
    expect(copy.querySelector('button')?.form).toBeNull();
    expect(copy.querySelector('copy-field')?.getAttribute('form')).toBe('');
    expect(form.checkValidity()).toBe(false);
    element.remove();
    // Only the copy's empty required field is left: it must not count.
    expect(form.checkValidity()).toBe(true);
  });
});
