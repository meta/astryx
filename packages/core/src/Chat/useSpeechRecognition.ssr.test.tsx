// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useSpeechRecognition.ssr.test.tsx
 * @input A dictation button rendered on a server without SpeechRecognition,
 *   then hydrated in a browser that has it
 * @output Proves the server markup and the first client render agree (no
 *   hydration error), and the button appears in the render after hydration
 * @position SSR acceptance test for useSpeechRecognition and ChatDictationButton
 */

import {act} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {ChatDictationButton} from './ChatDictationButton';
import {useSpeechRecognition} from './useSpeechRecognition';

function Dictation() {
  const dictation = useSpeechRecognition();
  return (
    <div>
      <ChatDictationButton dictation={dictation} />
    </div>
  );
}

type SpeechWindow = {SpeechRecognition?: unknown};

afterEach(() => {
  delete (window as unknown as SpeechWindow).SpeechRecognition;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('useSpeechRecognition: server render and hydration', () => {
  it('hydrates without a mismatch and shows the dictation button after hydration', async () => {
    // The server has no SpeechRecognition, so its markup has no button.
    const container = document.createElement('div');
    container.innerHTML = renderToString(<Dictation />);
    expect(container.querySelector('button')).toBeNull();
    document.body.appendChild(container);

    // The browser supports it.
    (window as unknown as SpeechWindow).SpeechRecognition = class {};
    const recoverableErrors: unknown[] = [];
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await act(async () => {
      hydrateRoot(container, <Dictation />, {
        onRecoverableError: error => recoverableErrors.push(error),
      });
    });

    expect(recoverableErrors).toEqual([]);
    expect(
      logged.mock.calls.some(call => /hydrat/i.test(String(call[0]))),
    ).toBe(false);
    expect(container.querySelector('button')).not.toBeNull();
  });
});
