// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useClipboard example copies its invite link through the hook: the
 * button label follows isCopied, the confirmation is announced politely, and
 * the label resets when the hook's timer runs out.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UseClipboardHookUsage from '../../assets/templates/blocks/components/Hooks/useClipboardHookUsage';

const INVITE_LINK = 'https://example.com/invite/q7x2k9';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

function renderExample(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseClipboardHookUsage />);
  });
}

function copyButton(): HTMLButtonElement {
  const button = container.querySelector('button');
  if (button == null) {
    throw new Error('no button rendered');
  }
  return button;
}

async function pressCopy(): Promise<void> {
  await act(async () => {
    copyButton().click();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom does not implement the async Clipboard API.
  Object.assign(navigator, {
    clipboard: {writeText: vi.fn().mockResolvedValue(undefined)},
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.useRealTimers();
});

describe('useClipboard example', () => {
  it('copies the invite link, confirms it and announces it', async () => {
    renderExample();
    expect(copyButton().textContent).toBe('Copy');
    await pressCopy();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(INVITE_LINK);
    expect(copyButton().textContent).toBe('Copied');
    act(() => {
      vi.advanceTimersToNextFrame();
    });
    expect(
      document.querySelector('[data-astryx-live-region="polite"]')?.textContent,
    ).toBe('Link copied');
  });

  it('resets the label after the hook timer, restarting on a second copy', async () => {
    renderExample();
    await pressCopy();
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    await pressCopy();
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(copyButton().textContent).toBe('Copied');
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(copyButton().textContent).toBe('Copy');
  });
});
