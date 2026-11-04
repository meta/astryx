// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file lazyToastSwipeClaim.idle.test.tsx
 * @input Uses vitest, @testing-library/react and ToastViewport, with the
 *   swipe claim's module wrapped to count its loads
 * @output Tests that the swipe's claim loads once the page is idle, before
 *   any toast shows, and that the idle wait follows the page's load event
 * @position Its own file: the module mock applies to every import in a file
 */

import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {render} from '@testing-library/react';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';
import {whenPageIdle} from './lazyToastSwipeClaim';
import {ToastViewport} from './ToastViewport';

const loads = vi.hoisted(() => ({count: 0}));
vi.mock('./ToastSwipeClaim', async importOriginal => {
  loads.count += 1;
  return importOriginal();
});

afterEach(() => {
  __resetLiveRegionsForTest();
});

// jsdom implements no Popover API.
beforeAll(() => {
  if (typeof HTMLElement.prototype.showPopover === 'undefined') {
    HTMLElement.prototype.showPopover = vi.fn();
    HTMLElement.prototype.hidePopover = vi.fn();
  }
});

/** A window stand-in whose load state and idle API a test sets. */
function fakeWindow({
  readyState,
  hasIdleCallback,
}: {
  readyState: DocumentReadyState;
  hasIdleCallback: boolean;
}) {
  const target = new EventTarget();
  const idle: (() => void)[] = [];
  const timers: (() => void)[] = [];
  const view = Object.assign(target, {
    document: {readyState},
    requestIdleCallback: hasIdleCallback
      ? (callback: () => void) => idle.push(callback)
      : undefined,
    cancelIdleCallback: () => {},
    setTimeout: (callback: () => void) => timers.push(callback),
    clearTimeout: () => {},
  });
  return {view: view as unknown as Window, idle, timers};
}

describe('the swipe claim at idle', () => {
  it('loads once the page is idle, before any toast shows', async () => {
    render(
      <ToastViewport isTopLayer={false}>
        <p>No toast yet</p>
      </ToastViewport>,
    );
    await vi.waitFor(() => {
      expect(loads.count).toBe(1);
    });
  });

  it('waits for the load event, then for an idle callback', () => {
    const {view, idle, timers} = fakeWindow({
      readyState: 'loading',
      hasIdleCallback: true,
    });
    const callback = vi.fn();
    whenPageIdle(view, callback);
    expect(idle).toHaveLength(0);
    view.dispatchEvent(new Event('load'));
    expect(idle).toHaveLength(1);
    expect(timers).toHaveLength(0);
    idle[0]?.();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('uses the next task where the browser has no idle callback', () => {
    const {view, timers} = fakeWindow({
      readyState: 'complete',
      hasIdleCallback: false,
    });
    const callback = vi.fn();
    whenPageIdle(view, callback);
    expect(timers).toHaveLength(1);
    timers[0]?.();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('does nothing after it is cancelled', () => {
    const {view, idle} = fakeWindow({
      readyState: 'loading',
      hasIdleCallback: true,
    });
    const cancel = whenPageIdle(view, vi.fn());
    cancel();
    view.dispatchEvent(new Event('load'));
    expect(idle).toHaveLength(0);
  });
});
