// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useChatDictation example keeps the control off when the browser has no
 * speech recognition.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UseChatDictationHookUsage from '../../assets/templates/blocks/components/ChatComposerInput/useChatDictationHookUsage';

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
    root.render(<UseChatDictationHookUsage />);
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
});

describe('useChatDictation example', () => {
  it('says when the browser has no speech recognition', () => {
    expect(container.textContent).toContain(
      'This browser has no speech recognition',
    );
  });

  it('puts a finished phrase in the composer', () => {
    class Recognition {
      lang = '';
      continuous = false;
      interimResults = false;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onresult: ((event: unknown) => void) | null = null;
      onspeechstart: (() => void) | null = null;
      onspeechend: (() => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onnomatch: (() => void) | null = null;
      start(): void {
        this.onstart?.();
      }
      stop(): void {
        this.onend?.();
      }
      abort(): void {
        this.onend?.();
      }
    }
    let latest: Recognition | null = null;
    (
      window as unknown as {SpeechRecognition: new () => Recognition}
    ).SpeechRecognition = class extends Recognition {
      constructor() {
        super();
        latest = this;
      }
    };
    act(() => {
      root?.unmount();
      root = createRoot(container);
      root.render(<UseChatDictationHookUsage />);
    });
    const button = Array.from(container.querySelectorAll('button')).find(
      candidate => candidate.textContent === 'Start',
    );
    act(() => button?.click());
    act(() => {
      latest?.onresult?.({
        resultIndex: 0,
        results: {
          length: 1,
          0: {isFinal: false, length: 1, 0: {transcript: 'hel'}},
        },
      });
    });
    expect(container.textContent).toContain('hel');
    act(() => {
      latest?.onresult?.({
        resultIndex: 0,
        results: {
          length: 1,
          0: {isFinal: true, length: 1, 0: {transcript: 'hello'}},
        },
      });
    });
    const editor = container.querySelector('[role="textbox"]');
    expect(editor?.textContent).toContain('hello');
  });
});
