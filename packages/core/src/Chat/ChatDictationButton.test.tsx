// Copyright (c) Meta Platforms, Inc. and affiliates.

import {createRef} from 'react';
import {describe, it, expect, vi} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import {colorVars} from '../theme/tokens.stylex';
import {ChatDictationButton} from './ChatDictationButton';
import type {ChatDictationButtonProps} from './ChatDictationButton';
import type {UseSpeechRecognitionReturn} from './useSpeechRecognition';

function makeDictation(
  overrides: Partial<UseSpeechRecognitionReturn> = {},
): UseSpeechRecognitionReturn {
  return {
    isSupported: true,
    isListening: false,
    isSpeaking: false,
    volume: 0,
    bands: [0, 0, 0, 0, 0],
    rawBands: [0, 0, 0, 0, 0],
    interimTranscript: '',
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn(),
    toggle: vi.fn(),
    ...overrides,
  };
}

describe('ChatDictationButton', () => {
  it('labels and toggles the idle button', () => {
    const dictation = makeDictation();
    render(<ChatDictationButton dictation={dictation} />);

    fireEvent.click(screen.getByRole('button', {name: 'Start dictation'}));
    expect(dictation.toggle).toHaveBeenCalledTimes(1);
  });

  it('shows five hidden visualizer bars and the stop label while listening', () => {
    const dictation = makeDictation({
      isListening: true,
      bands: [0.02, 0.04, 0.08, 0.12, 0.18],
    });
    const {container} = render(<ChatDictationButton dictation={dictation} />);

    expect(screen.getByRole('button', {name: 'Stop dictation'})).toBeEnabled();
    const visualizer = container.querySelector('[aria-hidden="true"]');
    expect(visualizer).not.toBeNull();
    expect(visualizer?.children).toHaveLength(5);
  });

  it('uses theme-owned colors for clipping feedback', () => {
    const dictation = makeDictation({
      isListening: true,
      volume: 0.3,
      bands: [0.2, 0.2, 0.2, 0.2, 0.2],
    });
    const {container} = render(<ChatDictationButton dictation={dictation} />);

    const barStyle = container
      .querySelector('[aria-hidden="true"] > span')
      ?.getAttribute('style');
    expect(barStyle).toContain('color-mix(in srgb');
    expect(barStyle).toContain(colorVars['--color-accent']);
    expect(barStyle).toContain(colorVars['--color-error']);
    expect(barStyle).not.toContain('hsl(');
  });

  it('hides unsupported dictation by default', () => {
    const {container} = render(
      <ChatDictationButton dictation={makeDictation({isSupported: false})} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('disables an unsupported button when explicitly kept visible', () => {
    render(
      <ChatDictationButton
        dictation={makeDictation({isSupported: false})}
        isHiddenWhenUnsupported={false}
      />,
    );

    expect(
      screen.getByRole('button', {name: 'Start dictation'}),
    ).toBeDisabled();
  });

  it('forwards the root ref and accepted span props', () => {
    const ref = createRef<HTMLSpanElement>();
    const props = {
      dictation: makeDictation(),
      'data-testid': 'dictation',
      'data-custom': 'x',
      id: 'dictate-1',
      label: 'Use voice input',
      ref,
    } satisfies ChatDictationButtonProps;

    render(<ChatDictationButton {...props} />);

    expect(ref.current).toBe(screen.getByTestId('dictation'));
    expect(ref.current).toHaveAttribute('data-custom', 'x');
    expect(ref.current).toHaveAttribute('id', 'dictate-1');
    expect(screen.getByRole('button', {name: 'Use voice input'})).toBeEnabled();
  });
});
