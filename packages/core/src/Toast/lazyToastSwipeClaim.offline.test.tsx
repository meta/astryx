// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file lazyToastSwipeClaim.offline.test.tsx
 * @input Uses vitest, @testing-library/react, ToastViewport + useToast, with
 *   the swipe claim's module failing to load
 * @output Tests that a toast still shows and stays when its swipe's code cannot
 *   load, and that the page keeps the touch
 * @position Its own file: the module mock applies to every import in a file
 */

import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';
import {ToastViewport} from './ToastViewport';
import {useToast} from './useToast';

// A failed chunk load, as when the page goes offline or a deploy removes it.
vi.mock('./ToastSwipeClaim', () => {
  throw new Error('chunk failed to load');
});

afterEach(() => {
  __resetLiveRegionsForTest();
});

// jsdom implements neither the Popover API nor pointer capture.
beforeAll(() => {
  if (typeof HTMLElement.prototype.showPopover === 'undefined') {
    HTMLElement.prototype.showPopover = vi.fn();
    HTMLElement.prototype.hidePopover = vi.fn();
  }
  if (typeof HTMLElement.prototype.setPointerCapture === 'undefined') {
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
  }
});

function ShowToastButton() {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() => toast({body: 'You are offline', isAutoHide: false})}>
      Trigger
    </button>
  );
}

describe('the swipe claim when its code cannot load', () => {
  it('keeps the toast on screen and leaves the touch to the page', async () => {
    render(
      <ToastViewport isTopLayer={false} position="bottomEnd">
        <ShowToastButton />
      </ToastViewport>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Trigger'));
    });
    await act(async () => {
      await vi.dynamicImportSettled();
    });

    const card = screen
      .getByText('You are offline')
      .closest('[data-type]') as HTMLElement;
    expect(card.isConnected).toBe(true);
    const event = new Event('touchmove', {bubbles: true, cancelable: true});
    Object.defineProperty(event, 'touches', {
      value: [{identifier: 1, clientX: 10, clientY: 101, target: card}],
    });
    act(() => {
      card.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
  });
});
