// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file resizablePane.overshoot.test.ts
 * @input createOvershootDrawing over a pane and its registered handle, with
 *   the shared touch runtime not loaded and then loaded
 * @output Evidence that a pull past a limit draws no overshoot before the
 *   runtime loads, and draws it once it has loaded
 * @position `component:Resizable` FR8 and
 *   `architecture:react-component-runtime` INV13
 */

import {afterEach, describe, expect, it} from 'vitest';
import {springs} from '../motion/uikit/springs';
import {
  __loadTouchRuntimeForTest,
  __resetTouchRuntimeForTest,
} from '../utils/touchRuntime';
import {
  createOvershootDrawing,
  registerResizeHandle,
  type ResizablePane,
} from './resizablePane';

function paneWithHandle() {
  const row = document.createElement('div');
  const element = document.createElement('div');
  const handle = document.createElement('div');
  row.append(element, handle);
  document.body.append(row);
  const unregister = registerResizeHandle(handle);
  const pane = {
    element,
    contentFacingEdge: () => 'inline-end',
  } as unknown as ResizablePane;
  return {pane, handle, unregister};
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('a pull past a limit (component:Resizable FR8)', () => {
  it('draws no overshoot and springs nothing back before the touch runtime loads', () => {
    __resetTouchRuntimeForTest();
    const {pane, handle, unregister} = paneWithHandle();
    const drawing = createOvershootDrawing(pane);
    drawing.draw(6);
    expect(handle.getAttribute('style') ?? '').toBe('');
    expect(drawing.springBack(springs.settle, 0)).toBe(false);
    unregister();
  });

  it('draws the overshoot once the touch runtime has loaded', async () => {
    await __loadTouchRuntimeForTest();
    const {pane, handle, unregister} = paneWithHandle();
    const drawing = createOvershootDrawing(pane);
    drawing.draw(6);
    expect(handle.getAttribute('style') ?? '').not.toBe('');
    drawing.clear();
    unregister();
  });
});
