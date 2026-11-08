// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Listbox.a11y.dom.ts
 * @input Uses Vitest lifecycle hooks and the DOM Dialog prototype
 * @output Scoped stubs for Dialog methods missing from jsdom
 * @position DOM-only binding setup; these stubs prove no native modal behavior.
 */

import {afterAll, beforeAll} from 'vitest';

export function installListboxDialogStubs(): void {
  const originals = new Map<string, PropertyDescriptor | undefined>();
  beforeAll(() => {
    for (const name of ['show', 'showModal', 'close']) {
      originals.set(
        name,
        Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name),
      );
      Object.defineProperty(HTMLDialogElement.prototype, name, {
        configurable: true,
        writable: true,
        value: function (this: HTMLDialogElement) {
          this.open = name !== 'close';
        },
      });
    }
  });
  afterAll(() => {
    for (const [name, descriptor] of originals) {
      if (descriptor == null) {
        Reflect.deleteProperty(HTMLDialogElement.prototype, name);
      } else {
        Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
      }
    }
  });
}
