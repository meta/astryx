// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createContextMenu.ssr.test.tsx
 * @input vitest (jsdom), react-dom/server, a fresh module graph
 * @output Checks that createContextMenu and useContextMenu are safe on the
 *   server (spec:AST-107 FR6): a component using the hook renders only its own
 *   markup, and importing either does no DOM work
 * @position Server-render and import checks for createContextMenu.tsx and
 *   useContextMenu.tsx
 */

import {useRef} from 'react';
import {renderToString} from 'react-dom/server';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {useContextMenu} from './useContextMenu';

afterEach(() => {
  vi.restoreAllMocks();
});

function Row() {
  const ref = useRef<HTMLLIElement>(null);
  useContextMenu(ref, {items: [{label: 'Archive'}]});
  return (
    <ul>
      <li ref={ref}>Inbox</li>
    </ul>
  );
}

describe('createContextMenu and useContextMenu on the server (spec:AST-107 FR6)', () => {
  it('a component using useContextMenu renders only its own markup', () => {
    expect(renderToString(<Row />)).toBe('<ul><li>Inbox</li></ul>');
  });

  it('importing the factory and its hook adds no node and no listener', async () => {
    vi.resetModules();
    const children = document.body.childElementCount;
    const documentListeners = vi.spyOn(document, 'addEventListener');
    const windowListeners = vi.spyOn(window, 'addEventListener');
    await import('./createContextMenu');
    await import('./useContextMenu');
    expect(documentListeners).not.toHaveBeenCalled();
    expect(windowListeners).not.toHaveBeenCalled();
    expect(document.body.childElementCount).toBe(children);
  });
});
