// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContextMenuTouchLayerLazy.test.tsx
 * @input vitest (jsdom), Testing Library, ContextMenu, a module mock that
 *   records when the touch layer is requested
 * @output Checks that ContextMenu loads its touch layer only under the touch
 *   model: never for a fine pointer or `presentation="popover"`; nor, with
 *   it, the lift presentation and the lift module, the rect morph, the
 *   compositor animator or the presentation hold, which only the touch layer
 *   imports
 * @position Testing for ContextMenu.tsx and lazyContextMenuTouchLayer.ts
 *
 * This file never preloads the touch layer, so it sees the path a real page
 * takes.
 */

import {fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeAll, beforeEach, expect, it, vi} from 'vitest';
import type {ContextMenu as ContextMenuComponent} from './ContextMenu';

const touchLayer = vi.hoisted(() => ({requested: 0}));

vi.mock('./ContextMenuTouchLayer', async importOriginal => {
  touchLayer.requested += 1;
  return importOriginal();
});

// The lift's modules, requested only through the touch layer: a static
// import from ContextMenu's own module graph would request them as this file
// imports ContextMenu, before any render.
const liftModules = vi.hoisted(() => ({
  lift: 0,
  liftModule: 0,
  rectMorph: 0,
  animator: 0,
  hold: 0,
}));

vi.mock('./ContextMenuLift', async importOriginal => {
  liftModules.lift += 1;
  return importOriginal();
});

vi.mock('../lift/lift', async importOriginal => {
  liftModules.liftModule += 1;
  return importOriginal();
});

vi.mock('../motion/rectMorph', async importOriginal => {
  liftModules.rectMorph += 1;
  return importOriginal();
});

vi.mock('../motion/animator', async importOriginal => {
  liftModules.animator += 1;
  return importOriginal();
});

vi.mock('../Layer/presentationHold', async importOriginal => {
  liftModules.hold += 1;
  return importOriginal();
});

function stubPointer(isCoarse: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: isCoarse && query === '(pointer: coarse)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

let ContextMenu: typeof ContextMenuComponent;

// A cold import transforms ContextMenu's whole module graph; allow for it.
beforeAll(async () => {
  ({ContextMenu} = await import('./ContextMenu'));
}, 120000);

beforeEach(() => {
  HTMLElement.prototype.showPopover = vi.fn();
  HTMLElement.prototype.hidePopover = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Runs first: nothing in this file has rendered under a finger yet.
it('never loads the touch layer for a fine pointer or presentation="popover"', async () => {
  stubPointer(false);
  const {unmount} = render(
    <ContextMenu items={[{label: 'Item 1'}]} data-testid="fine">
      <div>Right-click me</div>
    </ContextMenu>,
  );
  fireEvent.contextMenu(screen.getByTestId('fine'), {
    clientX: 20,
    clientY: 20,
    detail: 1,
  });
  unmount();

  stubPointer(true);
  render(
    <ContextMenu
      presentation="popover"
      items={[{label: 'Item 1'}]}
      data-testid="popover">
      <div>Hold me</div>
    </ContextMenu>,
  );
  await new Promise(resolve => setTimeout(resolve, 50));
  expect(touchLayer.requested).toBe(0);
  expect(liftModules).toEqual({
    lift: 0,
    liftModule: 0,
    rectMorph: 0,
    animator: 0,
    hold: 0,
  });
});

it('loads the touch layer under the touch model', async () => {
  stubPointer(true);
  render(
    <ContextMenu items={[{label: 'Item 1'}]} data-testid="touch">
      <div>Hold me</div>
    </ContextMenu>,
  );
  await vi.waitFor(
    () => {
      expect(touchLayer.requested).toBe(1);
      expect(screen.getByTestId('touch')).toHaveAttribute(
        'data-astryx-pressable',
      );
    },
    {timeout: 15000},
  );
  // The lift comes with it, once the layer's own imports have loaded.
  await vi.waitFor(
    () => {
      expect(liftModules).toEqual({
        lift: 1,
        liftModule: 1,
        rectMorph: 1,
        animator: 1,
        hold: 1,
      });
    },
    {timeout: 15000},
  );
}, 20000);
