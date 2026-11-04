// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file requiredGroup.ts
 * @input The checkbox inputs of a required CheckboxList and each box's state;
 *   Core's shared mutation observer
 * @output Exports createRequiredGroup, RequiredGroup, and RequiredGroupBox
 * @position Internal to CheckboxList; CheckboxList creates one for an
 *   `isRequired` group and CheckboxListItem registers its checkbox with it
 *
 * The browser has no required state for a group of checkboxes. While no box
 * is checked, the first enabled box carries native `required`. The browser
 * then blocks submit and moves focus to that box with its own message. Once
 * any box is checked, no box carries `required`.
 */

import {observeMutations} from '../utils/sharedMutationObserver';

/** The state of one box that decides which box carries `required`. */
export interface RequiredGroupBox {
  isChecked: boolean;
  /** False for a disabled or read-only box, which the user cannot check. */
  isEnabled: boolean;
}

export interface RequiredGroup {
  /**
   * Adds a checkbox with its state and updates `required` on every box.
   * Returns a function that removes the checkbox, clears its `required`, and
   * updates the rest. An item registers again when its state changes.
   */
  register: (input: HTMLInputElement, box: RequiredGroupBox) => () => void;
  /**
   * Updates `required` when the group's options move, for example after a
   * keyed reorder, which registers no box again. Returns a function that
   * stops it.
   */
  observe: (container: HTMLElement) => () => void;
}

const MOVE_OPTIONS: MutationObserverInit = {childList: true, subtree: true};

function byDocumentOrder(a: HTMLInputElement, b: HTMLInputElement): number {
  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
    ? -1
    : 1;
}

export function createRequiredGroup(): RequiredGroup {
  const boxes = new Map<HTMLInputElement, RequiredGroupBox>();

  function update() {
    const ordered = [...boxes.keys()].sort(byDocumentOrder);
    const isEmpty = ![...boxes.values()].some(box => box.isChecked);
    const target = isEmpty
      ? ordered.find(input => boxes.get(input)?.isEnabled === true)
      : undefined;
    for (const input of ordered) {
      input.required = input === target;
    }
  }

  return {
    register(input, box) {
      boxes.set(input, box);
      update();
      return () => {
        boxes.delete(input);
        input.required = false;
        update();
      };
    },
    observe(container) {
      return observeMutations(container, MOVE_OPTIONS, update);
    },
  };
}
