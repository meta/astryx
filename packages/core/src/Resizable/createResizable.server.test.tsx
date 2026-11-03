// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createResizable.server.test.tsx
 * @input vitest (jsdom, with the document and window reads trapped, or no
 *   window), createResizable's module, the ref-taking useResizable,
 *   react-dom/server
 * @output Checks that importing the resize factory and its hook does no DOM
 *   work, so both are safe on the server, and that the hook renders its
 *   initial size there (spec:AST-107 FR6)
 * @position Server tests for createResizable.ts and useResizable.ts
 */

import {createElement, useRef} from 'react';
import {renderToString} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';

describe('createResizable on the server (spec:AST-107 FR6)', () => {
  it('does no DOM work at import, nor does its hook', async () => {
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
      const hook = await import('./useResizable');
      expect(typeof hook.useResizable).toBe('function');
    } finally {
      for (const undo of restore) {
        undo();
      }
    }
    expect(touched).toEqual([]);
  });

  it("draws a ref-bound handle's own isReversed before a factory binds", async () => {
    const {useResizable} = await import('./useResizable');
    const {ResizeHandle} = await import('./ResizeHandle');
    function Split({onHandle, onHook}: {onHandle: boolean; onHook: boolean}) {
      const handleRef = useRef<HTMLDivElement>(null);
      useResizable(handleRef, {defaultSize: 200, isReversed: onHook});
      return createElement(ResizeHandle, {
        ref: handleRef,
        label: 'Sidebar width',
        isReversed: onHandle,
      });
    }
    const render = (onHandle: boolean, onHook: boolean) =>
      renderToString(createElement(Split, {onHandle, onHook}));
    // The pill sits on the side of the panel it resizes. Reversed by the
    // handle or by the hook, it sits on the same side, and not on the side of
    // an unreversed handle.
    expect(render(true, false)).toBe(render(false, true));
    expect(render(true, false)).not.toBe(render(false, false));
  });

  it('renders the size the hook starts at, against the deterministic basis a percentage has with no window', async () => {
    const {useResizable} = await import('./useResizable');
    function Split({defaultSize}: {defaultSize: number | string}) {
      const handleRef = useRef<HTMLDivElement>(null);
      const region = useResizable(handleRef, {defaultSize});
      return createElement('div', {ref: handleRef, 'data-size': region.size});
    }
    const originalWindow = globalThis.window;
    vi.stubGlobal('window', undefined);
    try {
      expect(
        renderToString(createElement(Split, {defaultSize: 240})),
      ).toContain('data-size="240"');
      // The released 1200px basis stands in for the missing viewport.
      expect(
        renderToString(createElement(Split, {defaultSize: '25%'})),
      ).toContain('data-size="300"');
    } finally {
      vi.stubGlobal('window', originalWindow);
    }
  });
});
