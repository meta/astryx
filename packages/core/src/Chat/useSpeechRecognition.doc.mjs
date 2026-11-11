// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useSpeechRecognition',
  displayName: 'useSpeechRecognition',
  keywords: ['speech', 'voice', 'recognition', 'microphone', 'transcript'],
  params: [
    {
      name: 'options',
      type: 'UseSpeechRecognitionOptions',
      description:
        'Recognition options. Omit them to listen in the provider locale until stop is called.',
      required: false,
    },
    {
      name: 'options.lang',
      type: 'string',
      description: 'BCP-47 language tag for recognition.',
      required: false,
    },
    {
      name: 'options.continuous',
      type: 'boolean',
      description: 'Whether recognition continues until stop or abort.',
      default: 'true',
      required: false,
    },
    {
      name: 'options.interimResults',
      type: 'boolean',
      description: 'Whether partial transcripts are reported before the final one.',
      default: 'true',
      required: false,
    },
    {
      name: 'options.onResult',
      type: '(transcript: string) => void',
      description: 'Called with each final transcript.',
      required: false,
    },
    {
      name: 'options.onError',
      type: '(error: {error: string, message?: string}) => void',
      description: 'Called when recognition fails.',
      required: false,
    },
  ],
  returns: [
    {
      name: 'isSupported',
      type: 'boolean',
      description: 'Whether this browser provides speech recognition.',
    },
    {
      name: 'isListening',
      type: 'boolean',
      description: 'Whether recognition is active.',
    },
    {
      name: 'interimTranscript',
      type: 'string',
      description: 'The partial transcript, empty when none is pending.',
    },
    {
      name: 'volume',
      type: 'number',
      description: 'Microphone level from 0 to 1 while listening.',
    },
    {
      name: 'start',
      type: '() => void',
      description: 'Start recognition.',
    },
    {
      name: 'stop',
      type: '() => void',
      description: 'Stop recognition and wait for the final transcript.',
    },
    {
      name: 'abort',
      type: '() => void',
      description: 'Stop recognition immediately.',
    },
    {
      name: 'toggle',
      type: '() => void',
      description: 'Start when idle, and stop when listening.',
    },
  ],
  usage: {
    description:
      'A headless speech-recognition control. It does not write into a composer. Read the transcript from interimTranscript and onResult, and draw your own UI from isListening and volume. Check isSupported first. useChatDictation adds composer interim text and start and stop cues on top of this hook.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Hide or disable the control when isSupported is false.',
      },
      {
        guidance: true,
        description:
          'Use onResult for the committed transcript. interimTranscript changes while the person is still speaking.',
      },
      {
        guidance: false,
        description:
          'Use this hook to fill a ChatComposerInput. useChatDictation owns that interim text.',
      },
    ],
  },
  relatedComponents: ['ChatComposerInput'],
  relatedHooks: ['useChatDictation'],
  importPath: '@astryxdesign/core/Chat',
  category: 'Chat',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Headless speech recognition: support, listening state, transcript, and microphone level.',
  paramDescriptions: {
    options: 'recognition options. Omit for the provider locale.',
    'options.lang': 'BCP-47 recognition language.',
    'options.continuous': 'keep listening until stop or abort.',
    'options.interimResults': 'report partial transcripts.',
    'options.onResult': 'called with each final transcript.',
    'options.onError': 'called when recognition fails.',
  },
  returnDescriptions: {
    isSupported: 'whether the browser has speech recognition.',
    isListening: 'whether recognition is active.',
    interimTranscript: 'the partial transcript.',
    volume: 'microphone level from 0 to 1.',
    start: 'start recognition.',
    stop: 'stop and wait for the final transcript.',
    abort: 'stop immediately.',
    toggle: 'start or stop.',
  },
  usage: {
    description:
      'Headless speech recognition. Check isSupported first. useChatDictation writes interim text into a composer.',
    bestPractices: [
      {
        guidance: true,
        description: 'Disable the control when isSupported is false.',
      },
      {
        guidance: true,
        description: 'Read the committed transcript from onResult.',
      },
      {
        guidance: false,
        description: 'Use it to fill a ChatComposerInput.',
      },
    ],
  },
};
