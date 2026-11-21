// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useChatMessageListVirtualization example renders 2,000 messages from
 * items. With the capability, only the rows of the first window mount, and
 * the newest message is one of them.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UseChatMessageListVirtualizationHookUsage from '../../assets/templates/blocks/components/ChatMessageList/useChatMessageListVirtualizationHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseChatMessageListVirtualizationHookUsage />);
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
});

describe('useChatMessageListVirtualization example', () => {
  it('mounts one window of the conversation, ending at the newest message', () => {
    const log = container.querySelector('[role="log"]');
    expect(log).toBeInstanceOf(HTMLElement);
    const text = log?.textContent ?? '';
    expect(text).toContain('Answer 1000:');
    expect(text).not.toContain('Question 1:');
    expect(
      container.querySelectorAll('.astryx-chat-message').length,
    ).toBeLessThan(100);
  });
});
