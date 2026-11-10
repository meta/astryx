// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file popupTrigger.ts
 * @input A labelled hover card's trigger element or its known role support,
 *   the trigger's own popup attributes, and the card's id and open state
 * @output The popup attributes a labelled trigger carries, and a reader of
 *   which of them the trigger's role supports
 * @position Shared by HoverCard and Timestamp so that a labelled card's
 *   trigger gets one set of popup attributes
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/HoverCard/HoverCard.tsx
 * - /packages/core/src/Timestamp/Timestamp.tsx
 * - /packages/core/src/HoverCard/popupTrigger.test.ts
 */

import type {AriaAttributes} from 'react';
import {mergeIds} from './mergeIds';

/** The popup states a trigger's role supports. */
export interface PopupTriggerSupport {
  readonly haspopup: boolean;
  readonly expanded: boolean;
}

/** A role-less trigger, such as a `span` or a `time`, supports neither. */
export const ROLELESS_TRIGGER: PopupTriggerSupport = {
  haspopup: false,
  expanded: false,
};

/** The popup attributes the trigger carries without the card. */
export interface OwnPopupAttributes {
  readonly haspopup?: string | null;
  readonly controls?: string | null;
  readonly expanded?: string | null;
}

/** A labelled trigger's popup attributes; a missing key means no attribute. */
export interface PopupTriggerAttributes {
  'aria-haspopup'?: AriaAttributes['aria-haspopup'];
  'aria-controls'?: string;
  'aria-expanded'?: AriaAttributes['aria-expanded'];
}

// The ARIA 1.2 "Supported States and Properties" lists for each attribute,
// with the subclass roles that inherit it. Both are the narrow reading: a
// role outside a set is not always unsupported, but an attribute on a role
// that does not support it can be ignored by assistive technology, while
// dropping one costs a user only a state they can still infer. Widening a set
// is safe. Chat/useTriggerMenu.tsx applies the same rule to aria-expanded.
const HASPOPUP_ROLES = new Set([
  'application',
  'button',
  'combobox',
  'gridcell',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'searchbox',
  'slider',
  'tab',
  'textbox',
  'treeitem',
]);

const EXPANDABLE_ROLES = new Set([
  'application',
  'button',
  'checkbox',
  'columnheader',
  'combobox',
  'gridcell',
  'link',
  'listbox',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'row',
  'rowheader',
  'switch',
  'tab',
  'treeitem',
]);

const BUTTON_INPUT_TYPES = new Set(['button', 'submit', 'reset', 'image']);

// Input types whose implicit role is textbox, searchbox or combobox.
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'tel', 'url']);

/**
 * Which popup states `el`'s role supports. An element this does not list is
 * read as role-less.
 */
export function popupTriggerSupport(el: HTMLElement): PopupTriggerSupport {
  const explicit = el.getAttribute('role')?.trim().split(/\s+/)[0];
  if (explicit) {
    return {
      haspopup: HASPOPUP_ROLES.has(explicit),
      expanded: EXPANDABLE_ROLES.has(explicit),
    };
  }
  switch (el.tagName) {
    case 'BUTTON':
      return {haspopup: true, expanded: true};
    case 'SUMMARY':
      // No implicit role takes aria-haspopup, but a disclosure summary
      // supports aria-expanded.
      return {haspopup: false, expanded: true};
    case 'A':
    case 'AREA':
      // A link only with an href; otherwise the element is generic.
      return el.hasAttribute('href')
        ? {haspopup: true, expanded: true}
        : ROLELESS_TRIGGER;
    case 'INPUT': {
      const type = (el as HTMLInputElement).type?.toLowerCase() ?? 'text';
      if (BUTTON_INPUT_TYPES.has(type)) {
        return {haspopup: true, expanded: true};
      }
      if (TEXT_INPUT_TYPES.has(type)) {
        return {haspopup: true, expanded: false};
      }
      return ROLELESS_TRIGGER;
    }
    case 'TEXTAREA':
      return {haspopup: true, expanded: false};
    case 'SELECT':
      // A single-line select is a combobox, which takes both. A multiple or
      // tall select is a listbox, which takes aria-expanded only.
      return {
        haspopup:
          !(el as HTMLSelectElement).multiple &&
          (el as HTMLSelectElement).size <= 1,
        expanded: true,
      };
    default:
      return ROLELESS_TRIGGER;
  }
}

/**
 * The popup attributes of a labelled hover card's trigger. The trigger names
 * the open card through `aria-controls`, after its own ids. It gets
 * `aria-haspopup="dialog"` and `aria-expanded` only when its role supports
 * them; otherwise it keeps its own values.
 */
export function labelledTriggerAttributes(
  support: PopupTriggerSupport,
  own: OwnPopupAttributes,
  card: {readonly id: string | null; readonly isOpen: boolean},
): PopupTriggerAttributes {
  const attributes: PopupTriggerAttributes = {};
  const haspopup = support.haspopup ? 'dialog' : own.haspopup;
  if (haspopup != null && haspopup !== '') {
    // A value read from the trigger is the caller's own, written as is.
    attributes['aria-haspopup'] = haspopup as AriaAttributes['aria-haspopup'];
  }
  // The card's id goes in only while the card is open: while closed, the
  // layer leaves only an inert marker, so the id would name nothing.
  const controls =
    card.isOpen && card.id != null
      ? mergeIds(own.controls, card.id)
      : own.controls;
  if (controls != null && controls !== '') {
    attributes['aria-controls'] = controls;
  }
  const expanded = support.expanded ? String(card.isOpen) : own.expanded;
  if (expanded != null && expanded !== '') {
    attributes['aria-expanded'] = expanded as AriaAttributes['aria-expanded'];
  }
  return attributes;
}

/**
 * Writes `attributes` to `el`, and removes each popup attribute that
 * `attributes` does not carry.
 */
export function applyPopupTriggerAttributes(
  el: HTMLElement,
  attributes: PopupTriggerAttributes,
): void {
  for (const name of [
    'aria-haspopup',
    'aria-controls',
    'aria-expanded',
  ] as const) {
    const value = attributes[name];
    if (value == null) {
      el.removeAttribute(name);
    } else {
      el.setAttribute(name, String(value));
    }
  }
}
