// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useSpeechRecognition example reports that the browser cannot listen,
 * shows the empty transcript, and keeps each finished phrase beside the words
 * still being recognized.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UseSpeechRecognitionHookUsage from '../../assets/templates/blocks/components/ChatComposerInput/useSpeechRecognitionHookUsage';

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
    root.render(<UseSpeechRecognitionHookUsage />);
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
});

describe('useSpeechRecognition example', () => {
  it('says when the browser has no speech recognition', () => {
    expect(container.textContent).toContain(
      'This browser has no speech recognition',
    );
    expect(container.textContent).toContain('No transcript yet');
  });

  it('keeps a finished phrase while the next one is recognized', () => {
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
    const created: Recognition[] = [];
    vi.stubGlobal(
      'SpeechRecognition',
      class extends Recognition {
        constructor() {
          super();
          created.push(this);
        }
      },
    );
    const latest = () => created[created.length - 1];
    act(() => {
      root?.unmount();
      root = createRoot(container);
      root.render(<UseSpeechRecognitionHookUsage />);
    });
    const button = Array.from(container.querySelectorAll('button')).find(
      candidate => candidate.textContent === 'Start',
    );
    act(() => button?.click());
    act(() => {
      latest()?.onresult?.({
        resultIndex: 0,
        results: {
          length: 1,
          0: {isFinal: true, length: 1, 0: {transcript: 'hello'}},
        },
      });
    });
    expect(container.textContent).toContain('hello');
    act(() => {
      latest()?.onresult?.({
        resultIndex: 1,
        results: {
          length: 2,
          0: {isFinal: true, length: 1, 0: {transcript: 'hello'}},
          1: {isFinal: false, length: 1, 0: {transcript: 'wor'}},
        },
      });
    });
    expect(container.textContent).toContain('hello wor');
  });
});
