// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {
  ChatDictationButton,
  ChatComposer,
  useChatDictation,
  ChatComposerInput,
} from '@astryxdesign/core/Chat';
import type {ChatComposerInputHandle} from '@astryxdesign/core/Chat';
import type {UseSpeechRecognitionReturn} from '@astryxdesign/core/Chat';
import {useRef} from 'react';

// =============================================================================
// Mock dictation values for non-interactive stories
// =============================================================================

const idleDictation: UseSpeechRecognitionReturn = {
  volume: 0,
  rawBands: [0, 0, 0, 0, 0],
  bands: [0, 0, 0, 0, 0],
  isSupported: true,
  isListening: false,
  isSpeaking: false,
  interimTranscript: '',
  start: () => {},
  stop: () => {},
  abort: () => {},
  toggle: () => {},
};

const listeningDictation: UseSpeechRecognitionReturn = {
  volume: 0.05,
  rawBands: [0.08, 0.06, 0.04, 0.02, 0.01],
  bands: [0.08, 0.06, 0.04, 0.02, 0.01],
  isSupported: true,
  isListening: true,
  isSpeaking: false,
  interimTranscript: '',
  start: () => {},
  stop: () => {},
  abort: () => {},
  toggle: () => {},
};

const speakingDictation: UseSpeechRecognitionReturn = {
  volume: 0.12,
  rawBands: [0.15, 0.12, 0.08, 0.05, 0.02],
  bands: [0.15, 0.12, 0.08, 0.05, 0.02],
  isSupported: true,
  isListening: true,
  isSpeaking: true,
  interimTranscript: 'hello world',
  start: () => {},
  stop: () => {},
  abort: () => {},
  toggle: () => {},
};

const clippingDictation: UseSpeechRecognitionReturn = {
  ...speakingDictation,
  volume: 0.3,
  bands: [0.2, 0.2, 0.2, 0.2, 0.2],
};

const unsupportedDictation: UseSpeechRecognitionReturn = {
  volume: 0,
  rawBands: [0, 0, 0, 0, 0],
  bands: [0, 0, 0, 0, 0],
  isSupported: false,
  isListening: false,
  isSpeaking: false,
  interimTranscript: '',
  start: () => {},
  stop: () => {},
  abort: () => {},
  toggle: () => {},
};

// =============================================================================
// Meta
// =============================================================================

const meta: Meta<typeof ChatDictationButton> = {
  title: 'Core/ChatDictationButton',
  component: ChatDictationButton,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div style={{width: 600, padding: 40}}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ChatDictationButton>;

// =============================================================================
// Stories
// =============================================================================

/** Idle state — microphone icon, ready to start dictation */
export const Idle: Story = {
  render: () => <ChatDictationButton dictation={idleDictation} />,
};

/** Listening state — volume-reactive equalizer bars */
export const Listening: Story = {
  render: () => <ChatDictationButton dictation={listeningDictation} />,
};

/** Speaking state — stronger equalizer bars */
export const Speaking: Story = {
  render: () => <ChatDictationButton dictation={speakingDictation} />,
};

/** Clipping state — bars blend from accent toward the theme's error color */
export const Clipping: Story = {
  tags: ['visual-baseline'],
  render: () => <ChatDictationButton dictation={clippingDictation} />,
};

/** Unsupported browser — button hidden by default */
export const Unsupported: Story = {
  render: () => (
    <div>
      <p style={{marginBottom: 8}}>
        Button is hidden when unsupported (nothing below):
      </p>
      <ChatDictationButton dictation={unsupportedDictation} />
    </div>
  ),
};

/** Unsupported browser — button visible but disabled when explicitly retained */
export const UnsupportedVisible: Story = {
  tags: ['visual-baseline'],
  render: () => (
    <ChatDictationButton
      dictation={unsupportedDictation}
      isHiddenWhenUnsupported={false}
    />
  ),
};

/** Dictation button in sendActions slot of ChatComposer */
export const InSendActions: Story = {
  render: () => (
    <ChatComposer
      onSubmit={value => console.log('Submit:', value)}
      sendActions={<ChatDictationButton dictation={idleDictation} />}
    />
  ),
};

/** Dictation button replacing the send button */
export const AsSendButton: Story = {
  render: () => (
    <ChatComposer
      onSubmit={value => console.log('Submit:', value)}
      sendButton={<ChatDictationButton dictation={listeningDictation} />}
    />
  ),
};

/**
 * Interactive demo with real SpeechRecognition.
 *
 * Note: SpeechRecognition may not work in Storybook's iframe.
 * For full testing, open this story in a standalone browser tab.
 */
export const Interactive: Story = {
  render: () => {
    const inputRef = useRef<ChatComposerInputHandle>(null);

    const dictation = useChatDictation({
      inputRef,
      hasSounds: true,
      onResult: text => {
        console.log('Final:', text);
      },
    });

    return (
      <div>
        <ChatComposer
          onSubmit={v => {
            console.log('Submit:', v);
          }}
          input={<ChatComposerInput handleRef={inputRef} />}
          sendActions={<ChatDictationButton dictation={dictation} />}
        />
        {dictation.isListening && (
          <div
            style={{
              marginTop: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
            <span style={{fontSize: 12, opacity: 0.5}}>Volume:</span>
            <div
              style={{
                width: 120,
                height: 8,
                backgroundColor: '#eee',
                borderRadius: 4,
                overflow: 'hidden',
              }}>
              <div
                style={{
                  height: '100%',
                  backgroundColor:
                    dictation.volume > 0.3 ? '#ef4444' : '#22c55e',
                  borderRadius: 4,
                  transition: 'width 0.08s ease-out',
                  width: `${Math.min(dictation.volume * 100 * 2, 100)}%`,
                }}
              />
            </div>
            <span style={{fontSize: 12, fontFamily: 'monospace', opacity: 0.5}}>
              {dictation.volume.toFixed(2)}
            </span>
          </div>
        )}

        {dictation.isListening && (
          <div style={{marginTop: 12}}>
            <div style={{fontSize: 12, fontWeight: 600, marginBottom: 4}}>
              Band Debug (raw vs calibrated)
            </div>
            <div
              style={{
                display: 'flex',
                gap: 8,
                fontFamily: 'monospace',
                fontSize: 11,
              }}>
              {['170-340', '340-860', '860-1.7k', '1.7-3k', '3k+'].map(
                (label, i) => {
                  const raw = dictation.rawBands[i] ?? 0;
                  const clean = dictation.bands[i] ?? 0;
                  const barH = 40;
                  return (
                    <div
                      key={label}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 2,
                        flex: 1,
                      }}>
                      <div
                        style={{
                          display: 'flex',
                          gap: 2,
                          alignItems: 'flex-end',
                          height: barH,
                        }}>
                        <div
                          style={{
                            width: 8,
                            backgroundColor: 'rgba(200,200,200,0.5)',
                            height: Math.min(raw * barH * 5, barH),
                            borderRadius: 2,
                          }}
                        />
                        <div
                          style={{
                            width: 8,
                            backgroundColor: '#3b82f6',
                            height: Math.min(clean * barH * 5, barH),
                            borderRadius: 2,
                          }}
                        />
                      </div>
                      <span style={{opacity: 0.5, fontSize: 9}}>{label}</span>
                      <span style={{opacity: 0.4}}>r:{raw.toFixed(3)}</span>
                      <span style={{color: '#3b82f6'}}>
                        c:{clean.toFixed(3)}
                      </span>
                    </div>
                  );
                },
              )}
            </div>
            <div style={{fontSize: 10, opacity: 0.4, marginTop: 4}}>
              Gray = raw mic, Blue = after noise floor
            </div>
          </div>
        )}

        {!dictation.isSupported && (
          <p style={{marginTop: 8, color: 'red'}}>
            SpeechRecognition is not supported in this browser.
          </p>
        )}
      </div>
    );
  },
};
