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
    'voice',
    'microphone',
    'speech-to-text',
    'stt',
    'headless',
  ],
  params: [
    {
      name: 'options',
      type: 'UseSpeechRecognitionOptions',
      description: 'Recognition options. All of them are optional.',
      required: false,
    },
    {
      name: 'options.lang',
      type: 'string',
      description:
        'BCP-47 language tag for recognition. Defaults to the InternationalizationProvider locale.',
      required: false,
    },
    {
      name: 'options.continuous',
      type: 'boolean',
      description: 'Keep recognizing until stopped explicitly.',
      default: 'true',
      required: false,
    },
    {
      name: 'options.interimResults',
      type: 'boolean',
      description: 'Report interim results while the user speaks.',
      default: 'true',
      required: false,
    },
    {
      name: 'options.audioContext',
      type: 'AudioContext',
      description:
        'Shared AudioContext for the volume analyser. Defaults to an internal lazy singleton.',
      required: false,
    },
    {
      name: 'options.transformTranscript',
      type: '(text: string) => string',
      description: 'Transform transcript text before it is reported.',
      required: false,
    },
    {
      name: 'options.onTranscript',
      type: '(transcript: string, isFinal: boolean) => void',
      description: 'Called on each transcript result, interim or final.',
      required: false,
    },
    {
      name: 'options.onResult',
      type: '(transcript: string) => void',
      description: 'Called when a final result is produced.',
      required: false,
    },
    {
      name: 'options.onError',
      type: '(error: {error: string; message?: string}) => void',
      description: 'Called when a recognition error occurs.',
      required: false,
    },
  ],
  returns: [
    {
      name: 'isSupported',
      type: 'boolean',
      description: 'Whether the browser supports SpeechRecognition.',
    },
    {
      name: 'isListening',
      type: 'boolean',
      description: 'Whether recognition is currently active.',
    },
    {
      name: 'isSpeaking',
      type: 'boolean',
      description: 'Whether speech is currently being detected.',
    },
    {
      name: 'volume',
      type: 'number',
      description: 'Real-time microphone level, 0 to 1.',
    },
    {
      name: 'bands',
      type: 'number[]',
      description:
        'Frequency band levels, low to high, each 0 to 1, for a level meter.',
    },
    {
      name: 'interimTranscript',
      type: 'string',
      description: 'The current interim transcript text.',
    },
    {
      name: 'start',
      type: '() => void',
      description: 'Start speech recognition.',
    },
    {
      name: 'stop',
      type: '() => void',
      description: 'Stop recognition gracefully, waiting for the final result.',
    },
    {
      name: 'abort',
      type: '() => void',
      description: 'Abort recognition immediately, discarding the result.',
    },
    {
      name: 'toggle',
      type: '() => void',
      description: 'Start when idle, stop when listening.',
    },
  ],
  usage: {
    description:
      'A headless wrapper around the browser SpeechRecognition API: start, stop, abort and toggle, the transcript state, and microphone volume from an AudioContext analyser. It renders nothing, so you build the controls. For voice input into ChatComposer, use useChatDictation instead - it layers the composer-specific behaviour (inputRef ghost text, audio cues, the CAPS LOCK rule) on top of this hook.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Set lang explicitly, or place the component under InternationalizationProvider and let the hook follow the active locale.',
      },
      {
        guidance: true,
        description:
          'Check isSupported before rendering a microphone control; a browser without SpeechRecognition should offer no dead button.',
      },
      {
        guidance: true,
        description:
          'Use stop when the final words matter and abort for a hard cancel - they differ in whether the last result is kept.',
      },
      {
        guidance: false,
        description:
          'Run it beside useChatDictation for the same microphone: two recognizers compete for the device.',
      },
      {
        guidance: false,
        description:
          'Treat volume as decoration only: it comes from an AudioContext analyser and needs a user gesture to start, like any audio input.',
      },
    ],
  },
  relatedComponents: ['ChatComposer', 'ChatDictationButton'],
  importPath: '@astryxdesign/core/Chat',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Headless SpeechRecognition wrapper: start/stop/abort/toggle, transcript state, mic volume from an AudioContext analyser. No UI.',
  paramDescriptions: {
    options: 'recognition options; all optional.',
    'options.lang': 'BCP-47 tag; defaults to the i18n locale.',
    'options.continuous': 'keep recognizing until stopped; default true.',
    'options.interimResults': 'report interim results; default true.',
    'options.audioContext': 'shared AudioContext; lazy singleton by default.',
    'options.transformTranscript': 'transform text before reporting.',
    'options.onTranscript': 'each result, interim or final.',
    'options.onResult': 'final results only.',
    'options.onError': 'recognition errors.',
  },
  returnDescriptions: {
    isSupported: 'browser supports SpeechRecognition.',
    isListening: 'recognition active.',
    isSpeaking: 'speech detected.',
    volume: 'mic level 0-1.',
    bands: 'frequency bands low to high.',
    interimTranscript: 'current interim text.',
    start: 'start recognition.',
    stop: 'stop gracefully; keeps the final result.',
    abort: 'abort now; discards the result.',
    toggle: 'start when idle, stop when listening.',
  },
  usage: {
    description:
      'Headless voice input: states plus start/stop/abort/toggle, no UI. For ChatComposer use useChatDictation, which adds ghost text and cues.',
    bestPractices: [
      {
        guidance: true,
        description: 'Set lang or rely on the i18n locale.',
      },
      {
        guidance: true,
        description: 'Gate controls on isSupported.',
      },
      {
        guidance: true,
        description: 'stop keeps the last result; abort discards it.',
      },
      {
        guidance: false,
        description: 'Do not run two recognizers on one microphone.',
      },
    ],
  },
};
