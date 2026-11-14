// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file attachReorderable.server.test.ts
 * @input vitest (jsdom, with the document and window reads trapped),
 *   createReorderable's module
 * @output Importing createReorderable, with attach, and creating an object do
 *   no DOM work, so both are safe on the server
 * @position Server tests for reorderable/attachReorderable.ts and
 *   reorderable/createReorderable.ts
 */

import {describe, expect, it, vi} from 'vitest';

describe('createReorderable on the server', () => {
  it('does no DOM work at import or when an object is made', async () => {
    vi.resetModules();
    const touched: string[] = [];
    const trapped: [object, string][] = [
      [globalThis, 'document'],
      [window, 'getComputedStyle'],
      [globalThis, 'MutationObserver'],
      [globalThis, 'requestAnimationFrame'],
    ];
    const restore = trapped.map(([owner, name]) => {
      const descriptor = Object.getOwnPropertyDescriptor(owner, name);
      const value = (owner as Record<string, object | undefined>)[name];
      Object.defineProperty(owner, name, {
        configurable: true,
        get(): object | undefined {
          // StyleX's development runtime injects styles at import, guarded
          // for a missing document; a compiled build has no such runtime.
          if (!(new Error().stack ?? '').includes('@stylexjs')) {
            touched.push(name);
          }
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
      const {createReorderable} = await import('./createReorderable');
      const reorderable = createReorderable({onReorder: () => {}});
      expect(typeof reorderable.attach).toBe('function');
    } finally {
      for (const undo of restore) {
        undo();
      }
    }
    expect(touched).toEqual([]);
  });
});
