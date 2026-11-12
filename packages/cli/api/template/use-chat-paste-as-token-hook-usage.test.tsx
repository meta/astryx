// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useChatPasteAsToken example uses a threshold of 40 and a Pasted note
 * label. A paste between that threshold and the default 200 becomes that token.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UseChatPasteAsTokenHookUsage from '../../assets/templates/blocks/components/ChatComposerInput/useChatPasteAsTokenHookUsage';

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
    root.render(<UseChatPasteAsTokenHookUsage />);
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
});

describe('useChatPasteAsToken example', () => {
  it('turns a long plain-text paste into a token', () => {
    const textbox = container.querySelector('[role="textbox"]');
    expect(textbox).toBeInstanceOf(HTMLElement);
    const editor = textbox as HTMLElement;
    const long = 'a'.repeat(80);
    const paste = new Event('paste', {bubbles: true, cancelable: true});
    Object.defineProperty(paste, 'clipboardData', {
      value: {
        files: [],
        getData: (type: string) => (type === 'text/plain' ? long : ''),
      },
    });
    act(() => {
      editor.focus();
      window.getSelection()?.removeAllRanges();
      editor.dispatchEvent(paste);
    });
    const token = editor.querySelector('[data-astryx-token]');
    expect(token?.textContent).toContain('Pasted note');
  });
});
