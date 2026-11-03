// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file browserClickWait.test.ts
 * @input browserClickWait.ts, with fake timers and the shared click guard
 * @output Proof that the wait reports the browser's click after its handlers,
 *   runs `onNoClick` once the wait runs out, leaves nothing behind when ended,
 *   and that a lift's own click passes while the guard swallows the late one
 * @position Testing for /packages/core/src/utils/browserClickWait.ts
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  BROWSER_CLICK_WAIT_MS,
  awaitBrowserClick,
  clickForLift,
} from './browserClickWait';
import {__resetClickGuardForTest, isClickGuardArmed} from './clickGuard';

/** Every wait a test starts: each ends after the test, so none listens on. */
const waits: (() => void)[] = [];

afterEach(() => {
  for (const end of waits.splice(0)) {
    end();
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
  __resetClickGuardForTest();
  document.body.replaceChildren();
});

/**
 * Starts a wait on a new button, and hands back the window's click listener
 * the wait added, to call with a browser-made (trusted) click.
 */
function startWait() {
  vi.useFakeTimers();
  const add = vi.spyOn(window, 'addEventListener');
  const button = document.createElement('button');
  const label = document.createElement('span');
  button.append(label);
  document.body.append(button);
  const clicked: boolean[] = [];
  const noClick = vi.fn();
  const end = awaitBrowserClick(button, {
    onClicked: isCancelled => clicked.push(isCancelled),
    onNoClick: noClick,
  });
  waits.push(end);
  const listener = add.mock.calls.find(([type]) => type === 'click')?.[1] as (
    event: unknown,
  ) => void;
  const browserClick = (target: Node, defaultPrevented = false) => ({
    isTrusted: true,
    target,
    defaultPrevented,
  });
  return {button, label, clicked, noClick, end, listener, browserClick};
}

describe('awaitBrowserClick', () => {
  it('reports the browser’s click once its handlers have run, cancelled or not, and stops waiting', () => {
    const {label, clicked, noClick, listener, browserClick} = startWait();
    expect(listener).toBeDefined();
    const event = browserClick(label);
    listener(event);
    // Not yet: the handlers run first.
    expect(clicked).toEqual([]);
    (event as {defaultPrevented: boolean}).defaultPrevented = true;
    vi.advanceTimersByTime(0);
    expect(clicked).toEqual([true]);
    // The wait is over: no direct-click path, and a second click is not
    // reported.
    vi.advanceTimersByTime(BROWSER_CLICK_WAIT_MS * 2);
    expect(noClick).not.toHaveBeenCalled();
    listener(browserClick(label));
    vi.advanceTimersByTime(0);
    expect(clicked).toEqual([true]);
  });

  it('ignores a script’s click and a click elsewhere', () => {
    const {clicked, listener, browserClick} = startWait();
    listener({...browserClick(document.body)});
    listener({isTrusted: false, target: document.body});
    vi.advanceTimersByTime(0);
    expect(clicked).toEqual([]);
  });

  it('runs onNoClick once the wait runs out with no browser click', () => {
    const {clicked, noClick} = startWait();
    vi.advanceTimersByTime(BROWSER_CLICK_WAIT_MS - 1);
    expect(noClick).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(noClick).toHaveBeenCalledTimes(1);
    expect(clicked).toEqual([]);
  });

  it('leaves no listener or timer behind once ended, as an unmount does, even with a report pending', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const {label, clicked, noClick, end, listener, browserClick} = startWait();
    listener(browserClick(label));
    end();
    vi.advanceTimersByTime(BROWSER_CLICK_WAIT_MS * 2);
    expect(clicked).toEqual([]);
    expect(noClick).not.toHaveBeenCalled();
    expect(remove.mock.calls.some(([type]) => type === 'click')).toBe(true);
    // Ending twice is harmless.
    end();
  });
});

describe('awaitBrowserClick in a document with no window', () => {
  it('runs onNoClick at once, unless the wait was ended first', async () => {
    const doc = document.implementation.createHTMLDocument('');
    const button = doc.createElement('button');
    doc.body.append(button);
    const noClick = vi.fn();
    awaitBrowserClick(button, {onClicked: () => {}, onNoClick: noClick});
    const ended = vi.fn();
    const end = awaitBrowserClick(button, {
      onClicked: () => {},
      onNoClick: ended,
    });
    end();
    await Promise.resolve();
    expect(noClick).toHaveBeenCalledTimes(1);
    expect(ended).not.toHaveBeenCalled();
  });
});

describe('clickForLift', () => {
  it('clicks the element, reports a veto, and the shared guard swallows the browser’s late click', () => {
    const button = document.createElement('button');
    document.body.append(button);
    const onClick = vi.fn((event: Event) => event.preventDefault());
    button.addEventListener('click', onClick);
    expect(clickForLift(button)).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(isClickGuardArmed(document)).toBe(true);
    // The browser's own click for the same lift (a pointer's, detail 1).
    button.dispatchEvent(
      new MouseEvent('click', {bubbles: true, cancelable: true, detail: 1}),
    );
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(isClickGuardArmed(document)).toBe(false);
  });

  it('reports false for a click no handler cancels', () => {
    const button = document.createElement('button');
    document.body.append(button);
    expect(clickForLift(button)).toBe(false);
  });
});
