// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file transientCopy.test.ts
 * @input vitest, inertCopy, keepInherited
 * @output Unit coverage for the inert copy's form and anchor-name exclusion,
 *   and for the inherited values it reads, by default or not at all
 * @position Unit coverage for transientCopy.ts; the exit copy's own cases
 *   are in Layer/layerExitCopy.test.ts
 */

import {afterEach, describe, expect, it} from 'vitest';
import {inertCopy, keepInherited} from './transientCopy';

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

  it('reads the inherited values keepInherited writes by default, and none for a copy that goes beside its element', () => {
    const sheet = document.createElement('style');
    sheet.textContent = '.toned { --tone: rgb(1, 2, 3); color-scheme: dark; }';
    document.head.append(sheet);
    const element = document.createElement('div');
    element.className = 'toned';
    element.textContent = 'Old';
    const elsewhere = document.createElement('section');
    document.body.append(element, elsewhere);
    const read = inertCopy(element);
    const beside = inertCopy(element, {isBesideElement: true});
    if (read == null || beside == null) {
      throw new Error('no copy');
    }
    // The copies carry no class rule's values of their own: inline values
    // are all keepInherited can write.
    read.className = '';
    beside.className = '';
    keepInherited(read, elsewhere);
    keepInherited(beside, elsewhere);
    sheet.remove();
    expect(read.style.getPropertyValue('--tone')).toBe('rgb(1, 2, 3)');
    expect(read.style.getPropertyValue('color-scheme')).toBe('dark');
    expect(beside.style.getPropertyValue('--tone')).toBe('');
    expect(beside.style.getPropertyValue('color-scheme')).toBe('');
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
