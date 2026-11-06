// Copyright (c) Meta Platforms, Inc. and affiliates.

import {Suspense, startTransition, use, type ReactNode} from 'react';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {act, render, renderHook} from '@testing-library/react';
import {InternationalizationProvider} from '../i18n';
import {useSpeechRecognition} from './useSpeechRecognition';
import {useChatDictation} from './useChatDictation';

// =============================================================================
// Mock SpeechRecognition
// =============================================================================

class MockSpeechRecognition {
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

  start = vi.fn(() => {
    this.onstart?.();
  });

  stop = vi.fn(() => {
    this.onend?.();
  });

  abort = vi.fn(() => {
    this.onend?.();
  });
}

let lastInstance: MockSpeechRecognition | null = null;

function MockSRConstructor() {
  const instance = new MockSpeechRecognition();
  lastInstance = instance;
  return instance;
}

// =============================================================================
// Setup / Teardown
// =============================================================================

let originalSR: unknown;

beforeEach(() => {
  lastInstance = null;
  originalSR = (window as unknown as Record<string, unknown>).SpeechRecognition;
  (window as unknown as Record<string, unknown>).SpeechRecognition =
    MockSRConstructor;
});

afterEach(() => {
  if (originalSR === undefined) {
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
  } else {
    (window as unknown as Record<string, unknown>).SpeechRecognition =
      originalSR;
  }
});

// =============================================================================
// useSpeechRecognition
// =============================================================================

describe('useSpeechRecognition', () => {
  it('reports isSupported as false when SpeechRecognition is unavailable', () => {
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    delete (window as unknown as Record<string, unknown>)
      .webkitSpeechRecognition;

    const {result} = renderHook(() => useSpeechRecognition());
    expect(result.current.isSupported).toBe(false);
    expect(result.current.isListening).toBe(false);
  });

  it('reports isSupported as true when SpeechRecognition is available', () => {
    const {result} = renderHook(() => useSpeechRecognition());
    expect(result.current.isSupported).toBe(true);
  });

  it('uses the provider locale by default and preserves an explicit override', () => {
    const wrapper = ({children}: {children: ReactNode}) => (
      <InternationalizationProvider locale="fr-FR">
        {children}
      </InternationalizationProvider>
    );
    const provider = renderHook(() => useSpeechRecognition(), {wrapper});

    act(() => {
      provider.result.current.start();
    });
    expect(lastInstance?.lang).toBe('fr-FR');

    const explicit = renderHook(() => useSpeechRecognition({lang: 'ja-JP'}), {
      wrapper,
    });
    act(() => {
      explicit.result.current.start();
    });
    expect(lastInstance?.lang).toBe('ja-JP');
  });

  it('starts and sets isListening', () => {
    const {result} = renderHook(() => useSpeechRecognition());

    act(() => {
      result.current.start();
    });

    expect(result.current.isListening).toBe(true);
    expect(lastInstance?.start).toHaveBeenCalled();
  });

  it('stops and clears isListening', () => {
    const {result} = renderHook(() => useSpeechRecognition());

    act(() => {
      result.current.start();
    });
    expect(result.current.isListening).toBe(true);

    act(() => {
      result.current.stop();
    });
    expect(result.current.isListening).toBe(false);
  });

  it('toggle starts when not listening and stops when listening', () => {
    const {result} = renderHook(() => useSpeechRecognition());

    // Toggle on
    act(() => {
      result.current.toggle();
    });
    expect(result.current.isListening).toBe(true);

    // Toggle off
    act(() => {
      result.current.toggle();
    });
    expect(result.current.isListening).toBe(false);
  });

  it('abort immediately stops recognition', () => {
    const {result} = renderHook(() => useSpeechRecognition());

    act(() => {
      result.current.start();
    });
    expect(result.current.isListening).toBe(true);

    act(() => {
      result.current.abort();
    });
    expect(result.current.isListening).toBe(false);
    expect(lastInstance?.abort).toHaveBeenCalled();
  });

  it('calls onStart and onEnd callbacks', () => {
    const onStart = vi.fn();
    const onEnd = vi.fn();

    const {result} = renderHook(() => useSpeechRecognition({onStart, onEnd}));

    act(() => {
      result.current.start();
    });
    expect(onStart).toHaveBeenCalledOnce();

    act(() => {
      result.current.stop();
    });
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it('handles result events with final transcript', () => {
    const onResult = vi.fn();
    const onTranscript = vi.fn();

    const {result} = renderHook(() =>
      useSpeechRecognition({onResult, onTranscript}),
    );

    act(() => {
      result.current.start();
    });

    // Simulate a final result
    act(() => {
      lastInstance?.onresult?.({
        resultIndex: 0,
        results: {
          length: 1,
          0: {
            isFinal: true,
            length: 1,
            0: {transcript: 'hello world'},
          },
        },
      });
    });

    expect(onResult).toHaveBeenCalledWith('hello world');
    expect(onTranscript).toHaveBeenCalledWith('hello world', true);
  });

  it('handles interim results and updates interimTranscript', () => {
    const onTranscript = vi.fn();

    const {result} = renderHook(() => useSpeechRecognition({onTranscript}));

    act(() => {
      result.current.start();
    });

    // Simulate an interim result
    act(() => {
      lastInstance?.onresult?.({
        resultIndex: 0,
        results: {
          length: 1,
          0: {
            isFinal: false,
            length: 1,
            0: {transcript: 'hel'},
          },
        },
      });
    });

    expect(result.current.interimTranscript).toBe('hel');
    expect(onTranscript).toHaveBeenCalledWith('hel', false);
  });

  it('cleans up recognition on unmount', () => {
    const {result, unmount} = renderHook(() => useSpeechRecognition());

    act(() => {
      result.current.start();
    });

    const instance = lastInstance;
    unmount();

    expect(instance?.abort).toHaveBeenCalled();
  });
});

// =============================================================================
// useChatDictation
// =============================================================================

describe('useChatDictation', () => {
  it('reports isSupported from speech recognition', () => {
    const {result} = renderHook(() => useChatDictation());
    expect(result.current.isSupported).toBe(true);
  });

  it('includes volume, bands, rawBands in return', () => {
    const {result} = renderHook(() => useChatDictation());
    expect(result.current.volume).toBe(0);
    expect(result.current.bands).toEqual([0, 0, 0, 0, 0]);
    expect(result.current.rawBands).toEqual([0, 0, 0, 0, 0]);
  });

  it('starts and sets isListening', () => {
    const {result} = renderHook(() => useChatDictation());

    act(() => {
      result.current.start();
    });

    expect(result.current.isListening).toBe(true);
  });

  it('stops and clears isListening', () => {
    const {result} = renderHook(() => useChatDictation());

    act(() => {
      result.current.start();
    });
    expect(result.current.isListening).toBe(true);

    act(() => {
      result.current.stop();
    });
    expect(result.current.isListening).toBe(false);
  });

  it('toggle starts and stops', () => {
    const {result} = renderHook(() => useChatDictation());

    act(() => {
      result.current.toggle();
    });
    expect(result.current.isListening).toBe(true);

    act(() => {
      result.current.toggle();
    });
    expect(result.current.isListening).toBe(false);
  });

  it('forwards onStart and onEnd callbacks', () => {
    const onStart = vi.fn();
    const onEnd = vi.fn();

    const {result} = renderHook(() => useChatDictation({onStart, onEnd}));

    act(() => {
      result.current.start();
    });
    expect(onStart).toHaveBeenCalledOnce();

    act(() => {
      result.current.stop();
    });
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it('handles final transcript via onResult', () => {
    const onResult = vi.fn();

    const {result} = renderHook(() => useChatDictation({onResult}));

    act(() => {
      result.current.start();
    });

    act(() => {
      lastInstance?.onresult?.({
        resultIndex: 0,
        results: {
          length: 1,
          0: {
            isFinal: true,
            length: 1,
            0: {transcript: 'hello world'},
          },
        },
      });
    });

    expect(onResult).toHaveBeenCalledWith('hello world');
  });

  it('abort immediately stops recognition', () => {
    const {result} = renderHook(() => useChatDictation());

    act(() => {
      result.current.start();
    });

    act(() => {
      result.current.abort();
    });

    expect(result.current.isListening).toBe(false);
    expect(lastInstance?.abort).toHaveBeenCalled();
  });
});

// =============================================================================
// Values from a render React discards
// =============================================================================

describe('callbacks and audio context as last committed', () => {
  const pending = new Promise<never>(() => {});
  function Pending(): null {
    use(pending);
    return null;
  }
  function Screen({
    children,
    isPending,
  }: {
    children: ReactNode;
    isPending: boolean;
  }) {
    return (
      <Suspense fallback={null}>
        {children}
        {isPending ? <Pending /> : null}
      </Suspense>
    );
  }
  // An audio graph call throws, so each hook stops at the first call it
  // makes, and the test can tell which context it reached.
  const noAudioGraph = () => {
    throw new Error('no audio graph in tests');
  };

  it('useSpeechRecognition keeps the committed callbacks and audio context when React discards a render, as a suspended transition does', async () => {
    const committedStart = vi.fn();
    const discardedStart = vi.fn();
    // The volume analyser asks for the microphone, then for its context.
    // The test waits for that second step, whichever context it reaches.
    let reached: (context: string) => void = () => {};
    const reachedContext = new Promise<string>(resolve => {
      reached = resolve;
    });
    const contextNamed = (name: string) => ({
      createMediaStreamSource: vi.fn(() => {
        reached(name);
        noAudioGraph();
      }),
    });
    const committedContext = contextNamed('committed');
    const discardedContext = contextNamed('discarded');
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {getUserMedia: async () => ({}) as MediaStream},
    });
    function Recognizer({
      onStart,
      audioContext,
    }: {
      onStart: () => void;
      audioContext: object;
    }) {
      const speech = useSpeechRecognition({
        onStart,
        audioContext: audioContext as AudioContext,
      });
      return (
        <button type="button" onClick={speech.start}>
          Start
        </button>
      );
    }
    try {
      const {getByRole, rerender} = render(
        <Screen isPending={false}>
          <Recognizer
            onStart={committedStart}
            audioContext={committedContext}
          />
        </Screen>,
      );
      // The transition renders new callbacks and a new context, then
      // suspends for good, so React keeps the committed tree and never
      // commits that render.
      await act(async () => {
        startTransition(() => {
          rerender(
            <Screen isPending>
              <Recognizer
                onStart={discardedStart}
                audioContext={discardedContext}
              />
            </Screen>,
          );
        });
      });
      act(() => {
        getByRole('button', {name: 'Start'}).click();
      });
      expect(await reachedContext).toBe('committed');
      expect(discardedStart).not.toHaveBeenCalled();
      expect(committedStart).toHaveBeenCalledTimes(1);
    } finally {
      delete (navigator as unknown as {mediaDevices?: unknown}).mediaDevices;
    }
  });

  it('useChatDictation keeps the committed callbacks and audio context when React discards a render, as a suspended transition does', async () => {
    const committedStart = vi.fn();
    const discardedStart = vi.fn();
    const committedContext = {
      currentTime: 0,
      createOscillator: vi.fn(noAudioGraph),
    };
    const discardedContext = {
      currentTime: 0,
      createOscillator: vi.fn(noAudioGraph),
    };
    function Dictation({
      onStart,
      audioContext,
    }: {
      onStart: () => void;
      audioContext: object;
    }) {
      const dictation = useChatDictation({
        onStart,
        audioContext: audioContext as AudioContext,
        hasSounds: true,
      });
      return (
        <button type="button" onClick={dictation.start}>
          Start
        </button>
      );
    }
    const {getByRole, rerender} = render(
      <Screen isPending={false}>
        <Dictation onStart={committedStart} audioContext={committedContext} />
      </Screen>,
    );
    // The transition renders new callbacks and a new context, then suspends
    // for good, so React keeps the committed tree and never commits that
    // render.
    await act(async () => {
      startTransition(() => {
        rerender(
          <Screen isPending>
            <Dictation
              onStart={discardedStart}
              audioContext={discardedContext}
            />
          </Screen>,
        );
      });
    });
    act(() => {
      getByRole('button', {name: 'Start'}).click();
    });
    expect(discardedStart).not.toHaveBeenCalled();
    expect(committedStart).toHaveBeenCalledTimes(1);
    expect(discardedContext.createOscillator).not.toHaveBeenCalled();
    expect(committedContext.createOscillator).toHaveBeenCalled();
  });
});
