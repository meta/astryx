// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useChatDictation',
  displayName: 'useChatDictation',
  keywords: ['chat', 'dictation', 'speech', 'voice', 'microphone', 'composer'],
  params: [
    {
      name: 'options',
      type: 'UseChatDictationOptions',
      description:
        'Speech and composer options. Omit them to listen in the provider locale until stop is called.',
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
      name: 'options.inputRef',
      type: 'React.RefObject<ChatComposerInputHandle | null>',
      description:
        'The composer handle. When set, interim text is shown in that input.',
      required: false,
    },
    {
      name: 'options.hasSounds',
      type: 'boolean',
      description: 'Play a short cue when recognition starts and stops.',
      default: 'false',
      required: false,
    },
    {
      name: 'options.onResult',
      type: '(transcript: string) => void',
      description: 'Called with each final transcript.',
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
      name: 'isSpeaking',
      type: 'boolean',
      description: 'Whether the microphone currently hears speech.',
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
      'Voice input for a chat composer. It wraps speech recognition with microphone level, start and stop cues, and optional interim text in a ChatComposerInput. Check isSupported before offering the control. A browser without speech recognition reports false and does not listen.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Pass inputRef when the words should appear in the composer while the person is still speaking.',
      },
      {
        guidance: true,
        description:
          'Disable the control when isSupported is false, and say that this browser cannot take voice input.',
      },
      {
        guidance: false,
        description:
          'Call the browser SpeechRecognition API beside this hook. Use useSpeechRecognition only when the composer behavior is not wanted.',
      },
    ],
  },
  relatedComponents: ['ChatComposerInput'],
  relatedHooks: ['useSpeechRecognition'],
  importPath: '@astryxdesign/core/Chat',
  category: 'Chat',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Voice input for a chat composer, with microphone level and optional interim text in the input.',
  paramDescriptions: {
    options: 'speech and composer options. Omit for the provider locale.',
    'options.lang': 'BCP-47 recognition language.',
    'options.continuous': 'keep listening until stop or abort.',
    'options.interimResults': 'report partial transcripts.',
    'options.inputRef': 'composer handle for interim text.',
    'options.hasSounds': 'play a cue on start and stop.',
    'options.onResult': 'called with each final transcript.',
  },
  returnDescriptions: {
    isSupported: 'whether the browser has speech recognition.',
    isListening: 'whether recognition is active.',
    isSpeaking: 'whether speech is currently heard.',
    interimTranscript: 'the partial transcript.',
    volume: 'microphone level from 0 to 1.',
    start: 'start recognition.',
    stop: 'stop and wait for the final transcript.',
    abort: 'stop immediately.',
    toggle: 'start or stop.',
  },
  usage: {
    description:
      'Voice input for a composer. Check isSupported first. False means this browser cannot listen.',
    bestPractices: [
      {
        guidance: true,
        description: 'Pass inputRef to show interim words in the composer.',
      },
      {
        guidance: true,
        description: 'Disable the control when isSupported is false.',
      },
      {
        guidance: false,
        description:
          'Call SpeechRecognition beside this hook. useSpeechRecognition is the headless wrapper.',
      },
    ],
  },
};
