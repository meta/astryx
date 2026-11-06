// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file popoverOperations.test.ts
 * @input Uses vitest, the popoverOperations ledger
 * @output Unit tests for the per-document ledger of popover operations
 * @position Core testing; validates popoverOperations.ts
 */

import {afterEach, describe, it, expect, vi} from 'vitest';
import {
  afterPopoverOperations,
  isBrowserHideInFlight,
  isPopoverOperationInFlight,
  observeBrowserHide,
  runPopoverOperation,
} from './popoverOperations';

/** The replay runs a microtask after the end, then one microtask per callback. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('popoverOperations', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs a callback at once when the document has no operation in flight', () => {
    const callback = vi.fn();
    afterPopoverOperations(document, callback);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('counts one of the layers’ own operations while it runs and replays a show that arrived inside it once the script has unwound', async () => {
    const callback = vi.fn();
    runPopoverOperation(document, () => {
      expect(isPopoverOperationInFlight(document)).toBe(true);
      afterPopoverOperations(document, callback);
      expect(callback).not.toHaveBeenCalled();
    });
    // The operation has ended, but its caller is still on the stack.
    expect(isPopoverOperationInFlight(document)).toBe(false);
    expect(callback).not.toHaveBeenCalled();
    await settle();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('counts the browser’s own hide apart from the layers’ operations, from its start until the element’s toggle', async () => {
    const popover = document.createElement('div');
    document.body.appendChild(popover);
    try {
      const callback = vi.fn();
      observeBrowserHide(popover);
      observeBrowserHide(popover);
      // A show asked now is not refused ahead of time: the engine decides.
      expect(isPopoverOperationInFlight(document)).toBe(false);
      expect(isBrowserHideInFlight(document)).toBe(true);
      afterPopoverOperations(document, callback);
      await settle();
      expect(callback).not.toHaveBeenCalled();

      popover.dispatchEvent(new Event('toggle'));
      expect(isBrowserHideInFlight(document)).toBe(false);
      await settle();
      expect(callback).toHaveBeenCalledTimes(1);
      // The toggle ended it once; the next task finds nothing to end.
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(isBrowserHideInFlight(document)).toBe(false);
    } finally {
      popover.remove();
    }
  });

  it('ends each hide exactly once: the loser of toggle and backstop is released, so a second in-flight hide keeps its count', () => {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    const first = document.createElement('div');
    const second = document.createElement('div');
    document.body.append(first, second);
    try {
      const removeListener = vi.spyOn(second, 'removeEventListener');
      observeBrowserHide(first);
      observeBrowserHide(second);
      expect(isBrowserHideInFlight(document)).toBe(true);
      expect(vi.getTimerCount()).toBe(2);

      // The first hide's toggle wins: its backstop is cleared, not left to
      // run later against another hide's count.
      first.dispatchEvent(new Event('toggle'));
      expect(isBrowserHideInFlight(document)).toBe(true);
      expect(vi.getTimerCount()).toBe(1);
      // The second hide's backstop wins: it ends the hide once and drops the
      // one-shot toggle listener.
      vi.runOnlyPendingTimers();
      expect(isBrowserHideInFlight(document)).toBe(false);
      expect(removeListener).toHaveBeenCalledWith(
        'toggle',
        expect.any(Function),
      );

      // A toggle after the backstop won, and a second toggle after the toggle
      // won, change nothing: the one-shot listeners are gone.
      observeBrowserHide(first);
      expect(isBrowserHideInFlight(document)).toBe(true);
      second.dispatchEvent(new Event('toggle'));
      expect(isBrowserHideInFlight(document)).toBe(true);
      first.dispatchEvent(new Event('toggle'));
      first.dispatchEvent(new Event('toggle'));
      expect(isBrowserHideInFlight(document)).toBe(false);

      // Nothing drifted negative: a later hide is still counted.
      observeBrowserHide(second);
      expect(isBrowserHideInFlight(document)).toBe(true);
      vi.runOnlyPendingTimers();
      expect(isBrowserHideInFlight(document)).toBe(false);
    } finally {
      first.remove();
      second.remove();
    }
  });

  it('ends a counted hide at the next task when its toggle never arrives (the element left the document)', async () => {
    const popover = document.createElement('div');
    document.body.appendChild(popover);
    const callback = vi.fn();
    observeBrowserHide(popover);
    popover.remove();
    afterPopoverOperations(document, callback);
    await settle();
    expect(callback).not.toHaveBeenCalled();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(isBrowserHideInFlight(document)).toBe(false);
    await settle();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('postpones the replay when another operation starts before it runs', async () => {
    const callback = vi.fn();
    runPopoverOperation(document, () => {
      afterPopoverOperations(document, callback);
    });
    // Before the replay's microtask: a browser-run hide starts, and ends.
    const second = document.createElement('div');
    document.body.appendChild(second);
    try {
      observeBrowserHide(second);
      await settle();
      expect(callback).not.toHaveBeenCalled();
      second.dispatchEvent(new Event('toggle'));
      await settle();
      expect(callback).toHaveBeenCalledTimes(1);
    } finally {
      second.remove();
    }
  });

  it('replays each callback in its own microtask, so a throw in one reaches the page alone and leaves the rest to run', async () => {
    const queued = vi.spyOn(globalThis, 'queueMicrotask');
    try {
      const first = vi.fn();
      const second = vi.fn();
      runPopoverOperation(document, () => {
        afterPopoverOperations(document, first);
        afterPopoverOperations(document, second);
      });
      // One microtask replays the batch; it queues one more per callback.
      expect(queued).toHaveBeenCalledTimes(1);
      await Promise.resolve();
      expect(queued).toHaveBeenCalledTimes(3);
      expect(first).not.toHaveBeenCalled();
      await Promise.resolve();
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
      expect(first.mock.invocationCallOrder[0]).toBeLessThan(
        second.mock.invocationCallOrder[0] ?? 0,
      );
    } finally {
      queued.mockRestore();
    }
  });

  it('keeps one ledger per document', async () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const other = frame.contentDocument;
    if (other == null) {
      throw new Error('the iframe has no document');
    }
    try {
      const callback = vi.fn();
      const popover = other.createElement('div');
      other.body.appendChild(popover);
      observeBrowserHide(popover);
      expect(isBrowserHideInFlight(document)).toBe(false);
      afterPopoverOperations(document, callback);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(isBrowserHideInFlight(other)).toBe(true);
      popover.dispatchEvent(new Event('toggle'));
      expect(isBrowserHideInFlight(other)).toBe(false);
    } finally {
      frame.remove();
    }
  });
});
