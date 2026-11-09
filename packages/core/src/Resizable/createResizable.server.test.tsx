// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createResizable.server.test.tsx
 * @input vitest (jsdom, with the document and window reads trapped),
 *   createResizable's module
 * @output Checks that importing the resize factory does no DOM work, so it is
 *   safe on the server (spec:AST-107 FR6)
 * @position Server tests for createResizable.ts
 */

import {describe, expect, it, vi} from 'vitest';

describe('createResizable on the server (spec:AST-107 FR6)', () => {
  it('does no DOM work at import', async () => {
    vi.resetModules();
    const touched: string[] = [];
    const trapped: [object, string][] = [
      [globalThis, 'document'],
      [window, 'localStorage'],
      [window, 'getComputedStyle'],
      [globalThis, 'ResizeObserver'],
    ];
    const restore = trapped.map(([owner, name]) => {
      const descriptor = Object.getOwnPropertyDescriptor(owner, name);
      // A document, a storage, a function or a class: an object each.
      const value = (owner as Record<string, object | undefined>)[name];
      Object.defineProperty(owner, name, {
        configurable: true,
        get(): object | undefined {
          touched.push(name);
          return value;
        },
      });
      return () => {
        if (descriptor) {
          Object.defineProperty(owner, name, descriptor);
        } else {
          Reflect.deleteProperty(owner, name);
        }
      };
    });
    try {
      const factory = await import('./createResizable');
      expect(typeof factory.createResizable).toBe('function');
    } finally {
      for (const undo of restore) {
        undo();
      }
    }
    expect(touched).toEqual([]);
  });
});
