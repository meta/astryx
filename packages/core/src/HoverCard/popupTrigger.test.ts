// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file popupTrigger.test.ts
 * @input popupTriggerSupport and labelledTriggerAttributes
 * @output Which triggers take aria-haspopup and aria-expanded, and the
 *   attributes a labelled trigger gets
 * @position Unit tests for the HoverCard trigger popup attributes
 */

import {describe, expect, it} from 'vitest';
import {
  ROLELESS_TRIGGER,
  labelledTriggerAttributes,
  popupTriggerSupport,
} from './popupTrigger';

function element(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host.firstElementChild as HTMLElement;
}

describe('popupTriggerSupport', () => {
  it.each([
    ['<button>x</button>', true, true],
    ['<a href="#x">x</a>', true, true],
    ['<a>x</a>', false, false],
    ['<input type="submit">', true, true],
    ['<input type="text">', true, false],
    ['<input type="checkbox">', false, false],
    ['<textarea></textarea>', true, false],
    ['<select></select>', true, true],
    ['<select multiple></select>', false, true],
    ['<summary>x</summary>', false, true],
    ['<span>x</span>', false, false],
    ['<time>x</time>', false, false],
    ['<span role="button">x</span>', true, true],
    ['<span role="checkbox">x</span>', false, true],
    ['<span role="note">x</span>', false, false],
  ])(
    '%s takes aria-haspopup %s and aria-expanded %s',
    (html, haspopup, expanded) => {
      expect(popupTriggerSupport(element(html))).toEqual({haspopup, expanded});
    },
  );
});

describe('labelledTriggerAttributes', () => {
  it('advertises the dialog on a supporting role, replacing its own value', () => {
    expect(
      labelledTriggerAttributes(
        {haspopup: true, expanded: true},
        {haspopup: 'menu', controls: 'menu-id', expanded: 'true'},
        {id: 'card', isOpen: true},
      ),
    ).toEqual({
      'aria-haspopup': 'dialog',
      'aria-controls': 'menu-id card',
      'aria-expanded': 'true',
    });
  });

  it('gives a role-less trigger only aria-controls, and only while open', () => {
    expect(
      labelledTriggerAttributes(
        ROLELESS_TRIGGER,
        {},
        {id: 'card', isOpen: true},
      ),
    ).toEqual({'aria-controls': 'card'});
    expect(
      labelledTriggerAttributes(
        ROLELESS_TRIGGER,
        {},
        {id: 'card', isOpen: false},
      ),
    ).toEqual({});
  });

  it("keeps a role-less trigger's own attributes", () => {
    expect(
      labelledTriggerAttributes(
        ROLELESS_TRIGGER,
        {haspopup: 'true', controls: 'own', expanded: 'false'},
        {id: 'card', isOpen: false},
      ),
    ).toEqual({
      'aria-haspopup': 'true',
      'aria-controls': 'own',
      'aria-expanded': 'false',
    });
  });
});
