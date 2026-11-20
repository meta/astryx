// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useClipboard.test.tsx
 * @input Uses vitest, @testing-library/react, useClipboard hook
 * @output Unit tests for the useClipboard copy behavior
 * @position Testing; validates useClipboard.ts
 *
 * SYNC: When useClipboard.ts changes, update tests to match new behavior
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {act, renderHook, waitFor} from '@testing-library/react';
import {useClipboard, useClipboardCopy} from './useClipboard';
import {__resetLiveRegionsForTest} from './useAnnounce';

function politeRegion(): HTMLElement | null {
  return document.querySelector('[data-astryx-live-region="polite"]');
}

function assertiveRegion(): HTMLElement | null {
  return document.querySelector('[data-astryx-live-region="assertive"]');
}

describe('useClipboard', () => {
  beforeEach(() => {
    // jsdom does not implement the async Clipboard API.
    Object.assign(navigator, {
      clipboard: {writeText: vi.fn().mockResolvedValue(undefined)},
    });
  });

  afterEach(() => {
    __resetLiveRegionsForTest();
    vi.restoreAllMocks();
  });

  it('writes the given text to the clipboard and resolves true', async () => {
    const {result} = renderHook(() => useClipboard());
    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.copy('hello world');
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello world');
    expect(outcome).toBe(true);
  });

  it('flips isCopied to true after a successful copy', async () => {
    const {result} = renderHook(() => useClipboard());
    expect(result.current.isCopied).toBe(false);
    await act(async () => {
      await result.current.copy('x');
    });
    expect(result.current.isCopied).toBe(true);
  });

  it('reverts isCopied after resetAfterMs', async () => {
    vi.useFakeTimers();
    try {
      const {result} = renderHook(() => useClipboard({resetAfterMs: 1000}));
      await act(async () => {
        await result.current.copy('x');
      });
      expect(result.current.isCopied).toBe(true);
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(result.current.isCopied).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps isCopied true for the full window after a rapid re-copy', async () => {
    vi.useFakeTimers();
    try {
      const {result} = renderHook(() => useClipboard({resetAfterMs: 2000}));
      await act(async () => {
        await result.current.copy('x');
      });
      expect(result.current.isCopied).toBe(true);

      // Re-copy partway through the window.
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      await act(async () => {
        await result.current.copy('x');
      });

      // 600ms after the second copy (2.1s after the first): the first copy's
      // timer must not have reverted it early.
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(result.current.isCopied).toBe(true);

      // It resets 2s after the most recent copy.
      act(() => {
        vi.advanceTimersByTime(1400);
      });
      expect(result.current.isCopied).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('announces the configured message to a polite live region', async () => {
    const {result} = renderHook(() => useClipboard({announce: 'Copied'}));
    await act(async () => {
      await result.current.copy('x');
    });
    await waitFor(() => {
      expect(politeRegion()).toHaveTextContent('Copied');
    });
  });

  it('does not announce when no announce message is configured', async () => {
    const {result} = renderHook(() => useClipboard());
    await act(async () => {
      await result.current.copy('x');
    });
    // No announce option → no live region is ever created.
    expect(politeRegion()).toBeNull();
  });

  it('is a silent no-op that resolves false when the clipboard rejects', async () => {
    (
      navigator.clipboard.writeText as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('denied'));
    const {result} = renderHook(() => useClipboard({announce: 'Copied'}));
    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.copy('x');
    });
    expect(outcome).toBe(false);
    expect(result.current.isCopied).toBe(false);
    expect(politeRegion()).toBeNull();
  });

  it('clears a pending reset timer on unmount', async () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    try {
      const {result, unmount} = renderHook(() => useClipboard());
      await act(async () => {
        await result.current.copy('x');
      });
      unmount();
      expect(clearSpy).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('useClipboardCopy (internal)', () => {
  const error = new Error('denied');
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {writeText: vi.fn().mockRejectedValue(error)},
    });
  });
  afterEach(() => {
    __resetLiveRegionsForTest();
    vi.useRealTimers();
  });

  it('reports a failed write once, for as long as a copy shows, and leaves isCopied alone', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const {result} = renderHook(() =>
      useClipboardCopy({announceFailure: 'Failed', onError}),
    );
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.copy('x');
    });
    expect(ok).toBe(false);
    expect(result.current.isFailed).toBe(true);
    expect(result.current.isCopied).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
    // A failure is an error, so it is announced assertively.
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(assertiveRegion()).toHaveTextContent('Failed');
    expect(politeRegion()?.textContent ?? '').not.toContain('Failed');
    act(() => {
      vi.advanceTimersByTime(1980);
    });
    expect(result.current.isFailed).toBe(false);
  });

  it('clears the failure when a later write succeeds', async () => {
    const {result} = renderHook(() => useClipboardCopy());
    await act(async () => {
      await result.current.copy('x');
    });
    expect(result.current.isFailed).toBe(true);
    Object.assign(navigator, {
      clipboard: {writeText: vi.fn().mockResolvedValue(undefined)},
    });
    await act(async () => {
      await result.current.copy('x');
    });
    expect(result.current.isFailed).toBe(false);
    expect(result.current.isCopied).toBe(true);
  });

  it('sets no state, starts no timer and announces nothing for a write that settles after unmount', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    let reject: (reason: unknown) => void = () => {};
    let resolve: () => void = () => {};
    const writeText = vi
      .fn()
      .mockImplementationOnce(
        async () =>
          new Promise<void>((_, onReject) => {
            reject = onReject;
          }),
      )
      .mockImplementationOnce(
        async () =>
          new Promise<void>(onResolve => {
            resolve = onResolve;
          }),
      );
    Object.assign(navigator, {clipboard: {writeText}});
    const {result, unmount} = renderHook(() =>
      useClipboardCopy({
        announce: 'Copied',
        announceFailure: 'Failed',
        onError,
      }),
    );
    const failing = result.current.copy('x');
    const succeeding = result.current.copy('y');
    unmount();
    await act(async () => {
      reject(error);
      resolve();
      expect(await failing).toBe(false);
      expect(await succeeding).toBe(true);
    });
    // The caller still hears about the failure.
    expect(onError).toHaveBeenCalledWith(error);
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(assertiveRegion()?.textContent ?? '').not.toContain('Failed');
    expect(politeRegion()?.textContent ?? '').not.toContain('Copied');
  });

  it('keeps the public hook to copy and isCopied', () => {
    const {result} = renderHook(() => useClipboard());
    expect(Object.keys(result.current).sort()).toEqual(['copy', 'isCopied']);
  });
});

describe('useClipboard where the async Clipboard API is not allowed', () => {
  let execCommand: ReturnType<typeof vi.fn>;
  /** The text the last copy event carried, as the browser would copy it. */
  let copiedText: string | undefined;

  /**
   * The browser's copy command: fires a `copy` event at the focused element
   * and copies what the event's clipboard data holds.
   */
  function copyCommand(command: string): boolean {
    if (command !== 'copy') {
      return false;
    }
    const data = new Map<string, string>();
    const event = new Event('copy', {bubbles: true, cancelable: true});
    Object.defineProperty(event, 'clipboardData', {
      value: {setData: (type: string, value: string) => data.set(type, value)},
    });
    (document.activeElement ?? document.body).dispatchEvent(event);
    copiedText = event.defaultPrevented ? data.get('text/plain') : undefined;
    return true;
  }

  beforeEach(() => {
    copiedText = undefined;
    Object.assign(navigator, {
      clipboard: {writeText: vi.fn().mockResolvedValue(undefined)},
    });
    // A sandboxed frame's permissions policy refuses `clipboard-write`.
    Object.defineProperty(document, 'featurePolicy', {
      configurable: true,
      value: {
        allowsFeature: (feature: string) => feature !== 'clipboard-write',
      },
    });
    execCommand = vi.fn(copyCommand);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });
  });

  afterEach(() => {
    delete (document as {featurePolicy?: unknown}).featurePolicy;
    delete (document as {execCommand?: unknown}).execCommand;
    __resetLiveRegionsForTest();
    vi.restoreAllMocks();
  });

  it('copies the exact text with the copy command, never trying the refused API, and reports the copy', async () => {
    const {result} = renderHook(() => useClipboard({announce: 'Copied'}));
    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.copy('from a sandbox');
    });
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(copiedText).toBe('from a sandbox');
    expect(outcome).toBe(true);
    expect(result.current.isCopied).toBe(true);
    await waitFor(() =>
      expect(politeRegion()?.textContent ?? '').toContain('Copied'),
    );
  });

  it('moves no focus and adds no element, so a control in a surface that closes on focus loss keeps it', async () => {
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();
    let focusedDuringCopy: Element | null = null;
    execCommand.mockImplementation((command: string) => {
      focusedDuringCopy = document.activeElement;
      return copyCommand(command);
    });
    const blur = vi.fn();
    button.addEventListener('blur', blur);
    const {result} = renderHook(() => useClipboard());
    const elements = document.body.querySelectorAll('*').length;
    await act(async () => {
      await result.current.copy('x');
    });
    expect(focusedDuringCopy).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(blur).not.toHaveBeenCalled();
    expect(copiedText).toBe('x');
    expect(document.body.querySelectorAll('*').length).toBe(elements);
    button.remove();
  });

  it("keeps the page's own copy handlers from changing the text", async () => {
    const pageHandler = vi.fn((event: Event) => {
      (event as ClipboardEvent).clipboardData?.setData('text/plain', 'changed');
    });
    document.addEventListener('copy', pageHandler);
    const {result} = renderHook(() => useClipboard());
    await act(async () => {
      await result.current.copy('exact');
    });
    expect(copiedText).toBe('exact');
    expect(pageHandler).not.toHaveBeenCalled();
    document.removeEventListener('copy', pageHandler);
  });

  it('reports a failed write when the browser does not copy', async () => {
    execCommand.mockReturnValue(false);
    const onError = vi.fn();
    const {result} = renderHook(() =>
      useClipboardCopy({announceFailure: 'Failed', onError}),
    );
    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.copy('x');
    });
    expect(outcome).toBe(false);
    expect(result.current.isFailed).toBe(true);
    expect(result.current.isCopied).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('never runs the copy command outside a click or a key press', async () => {
    Object.defineProperty(navigator, 'userActivation', {
      configurable: true,
      value: {isActive: false},
    });
    const {result} = renderHook(() => useClipboard());
    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.copy('x');
    });
    expect(outcome).toBe(false);
    expect(execCommand).not.toHaveBeenCalled();
    delete (navigator as {userActivation?: unknown}).userActivation;
  });

  it('reports a failed write when the copy command fires no copy event', async () => {
    execCommand.mockImplementation(() => true);
    const {result} = renderHook(() => useClipboard());
    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.copy('x');
    });
    expect(outcome).toBe(false);
  });
});

describe('useClipboard where the browser refuses the async write', () => {
  afterEach(() => {
    delete (document as {execCommand?: unknown}).execCommand;
    vi.restoreAllMocks();
  });

  it('tries the async API first and copies with the copy command after a permission refusal', async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi
          .fn()
          .mockRejectedValue(new DOMException('Refused', 'NotAllowedError')),
      },
    });
    let copied: string | undefined;
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn((command: string) => {
        const data = new Map<string, string>();
        const event = new Event('copy', {bubbles: true, cancelable: true});
        Object.defineProperty(event, 'clipboardData', {
          value: {
            setData: (type: string, value: string) => data.set(type, value),
          },
        });
        document.body.dispatchEvent(event);
        copied = data.get('text/plain');
        return command === 'copy';
      }),
    });
    const {result} = renderHook(() => useClipboard());
    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.copy('after a refusal');
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'after a refusal',
    );
    expect(copied).toBe('after a refusal');
    expect(outcome).toBe(true);
  });

  it('does not use the copy command when the write fails for another reason', async () => {
    Object.assign(navigator, {
      clipboard: {writeText: vi.fn().mockRejectedValue(new Error('broken'))},
    });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });
    const {result} = renderHook(() => useClipboard());
    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.copy('x');
    });
    expect(outcome).toBe(false);
    expect(execCommand).not.toHaveBeenCalled();
  });
});
