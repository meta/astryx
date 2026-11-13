// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useSpeechRecognition',
  displayName: 'useSpeechRecognition',
  group: 'Chat',
  category: 'Chat',
  keywords: [
    'speech',
    'recognition',
    'dictation',
    'voice',
    'transcript',
    'microphone',
  ],
  params: [
    {
      name: 'options',
      type: 'UseSpeechRecognitionOptions',
      description:
        'Configuration and callbacks for browser speech recognition.',
      required: false,
    },
    {
      name: 'options.lang',
      type: 'string',
      description:
        'BCP-47 language tag. Defaults to the InternationalizationProvider locale.',
      required: false,
    },
    {
      name: 'options.continuous',
      type: 'boolean',
      description: 'Whether recognition continues until explicitly stopped.',
      default: 'true',
      required: false,
    },
    {
      name: 'options.interimResults',
      type: 'boolean',
      description:
        'Whether interim transcripts are reported while the speaker is talking.',
      default: 'true',
      required: false,
    },
    {
      name: 'options.audioContext',
      type: 'AudioContext',
      description:
        'Optional shared AudioContext for microphone level analysis.',
      required: false,
    },
    {
      name: 'options.transformTranscript',
      type: '(text: string) => string',
      description: 'Transforms transcript text before callbacks receive it.',
      required: false,
    },
    {
      name: 'options.onTranscript',
      type: '(transcript: string, isFinal: boolean) => void',
      description: 'Called for each interim or final transcript.',
      required: false,
    },
    {
      name: 'options.onResult',
      type: '(transcript: string) => void',
      description: 'Called when a final transcript is produced.',
      required: false,
    },
    {
      name: 'options.onError',
      type: '(error: {error: string; message?: string}) => void',
      description: 'Called when the browser reports a recognition error.',
      required: false,
    },
    {
      name: 'options.onStart',
      type: '() => void',
      description: 'Called when recognition starts.',
      required: false,
    },
    {
      name: 'options.onEnd',
      type: '() => void',
      description: 'Called when recognition ends.',
      required: false,
    },
  ],
  returns: [
    {
      name: 'isSupported',
      type: 'boolean',
      description: 'Whether the browser exposes SpeechRecognition.',
    },
    {
      name: 'isListening',
      type: 'boolean',
      description: 'Whether recognition is active.',
    },
    {
      name: 'isSpeaking',
      type: 'boolean',
      description: 'Whether speech is currently being detected.',
    },
    {
      name: 'volume',
      type: 'number',
      description: 'Real-time microphone volume from 0 to 1.',
    },
    {
      name: 'bands',
      type: 'number[]',
      description: 'Calibrated frequency-band levels from low to high.',
    },
    {
      name: 'rawBands',
      type: 'number[]',
      description: 'Uncalibrated frequency-band levels for diagnostics.',
    },
    {
      name: 'interimTranscript',
      type: 'string',
      description: 'Current interim transcript text.',
    },
    {name: 'start', type: '() => void', description: 'Start recognition.'},
    {
      name: 'stop',
      type: '() => void',
      description: 'Stop recognition gracefully.',
    },
    {
      name: 'abort',
      type: '() => void',
      description: 'Abort recognition immediately.',
    },
    {
      name: 'toggle',
      type: '() => void',
      description: 'Toggle between start and stop.',
    },
  ],
  usage: {
    description:
      'Provides a headless React interface to the browser SpeechRecognition API, including transcript callbacks and microphone levels. It is the lower-level hook for applications that own their voice-input UI.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Render an alternate input path when isSupported is false.',
      },
      {
        guidance: true,
        description:
          'Use onResult for committed text and interimTranscript for live feedback.',
      },
      {
        guidance: true,
        description:
          'Pass the return value to ChatDictationButton when the standard chat mic control is appropriate.',
      },
      {
        guidance: false,
        description:
          'Assume the browser grants microphone access. Permission and browser support can change at runtime.',
      },
    ],
  },
  relatedComponents: ['ChatDictationButton'],
  relatedHooks: ['useChatDictation'],
  importPath: '@astryxdesign/core/Chat',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Headless browser SpeechRecognition hook with transcript callbacks and microphone levels.',
  paramDescriptions: {
    options: 'speech recognition configuration and callbacks.',
  },
  returnDescriptions: {
    isSupported: 'whether SpeechRecognition is available.',
    isListening: 'whether recognition is active.',
    isSpeaking: 'whether speech is detected.',
    volume: 'microphone volume, 0-1.',
    bands: 'calibrated frequency bands.',
    rawBands: 'uncalibrated frequency bands.',
    interimTranscript: 'current interim text.',
    start: 'start recognition.',
    stop: 'stop gracefully.',
    abort: 'abort immediately.',
    toggle: 'toggle recognition.',
  },
  usage: {
    description:
      'Headless browser speech recognition for apps that own the voice-input UI.',
    bestPractices: [
      {
        guidance: true,
        description: 'Provide a fallback when isSupported is false.',
      },
      {
        guidance: true,
        description:
          'Use onResult for committed text and interimTranscript for live text.',
      },
      {
        guidance: true,
        description:
          'Pass the return value to ChatDictationButton when appropriate.',
      },
    ],
  },
};
