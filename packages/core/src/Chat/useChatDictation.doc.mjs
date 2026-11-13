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
      description:
        'Whether partial transcripts are reported before the final one.',
      default: 'true',
      required: false,
    },
    {
      name: 'options.audioContext',
      type: 'AudioContext',
      description:
        "A shared audio context for the microphone level and cues. Omit it to use the hook's own context.",
      required: false,
    },
    {
      name: 'options.transformTranscript',
      type: '(transcript: string) => string',
      description:
        'Rewrites each transcript before it is reported, before the upper-case rule for loud speech.',
      required: false,
    },
    {
      name: 'options.inputRef',
      type: 'React.RefObject<ChatComposerInputHandle | null>',
      description:
        'The composer handle. When set, the hook focuses that composer, shows each partial transcript there, and inserts each final transcript. onResult still runs, so do not insert that text again.',
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
    {
      name: 'options.onTranscript',
      type: '(transcript: string, isFinal: boolean) => void',
      description: 'Called for each partial transcript and each final one.',
      required: false,
    },
    {
      name: 'options.onError',
      type: '(error: {error: string, message?: string}) => void',
      description:
        'Called when recognition fails, including when microphone permission is refused.',
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
      name: 'bands',
      type: 'number[]',
      description: 'Frequency band levels from low to high, each from 0 to 1.',
    },
    {
      name: 'rawBands',
      type: 'number[]',
      description: 'The same bands before calibration.',
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
      'Voice input for a chat composer. It wraps speech recognition with microphone level, start and stop cues, and optional interim text in a ChatComposerInput. Check isSupported before offering the control. A browser without speech recognition reports false and does not listen. Sustained loud speech turns the transcript to upper case.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Pass inputRef when the words should appear in the composer. The hook inserts each final transcript there and still calls onResult.',
      },
      {
        guidance: true,
        description:
          'Disable the control when isSupported is false, and say that this browser cannot take voice input.',
      },
      {
        guidance: true,
        description:
          'Handle onError. It is the only signal that microphone permission was refused.',
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
    'options.audioContext': 'shared audio context for level and cues.',
    'options.transformTranscript':
      'rewrites each transcript before the loud-speech upper-case rule.',
    'options.inputRef':
      'composer handle. Focuses it, shows partial text, and inserts each final transcript. onResult still runs.',
    'options.hasSounds': 'play a cue on start and stop.',
    'options.onResult': 'called with each final transcript.',
    'options.onTranscript':
      'called for each partial and each final transcript.',
    'options.onError':
      'called when recognition fails, including refused microphone permission.',
    'options.onStart': 'called when recognition starts.',
    'options.onEnd': 'called when recognition ends.',
  },
  returnDescriptions: {
    isSupported: 'whether the browser has speech recognition.',
    isListening: 'whether recognition is active.',
    isSpeaking: 'whether speech is currently heard.',
    interimTranscript: 'the partial transcript.',
    volume: 'microphone level from 0 to 1.',
    bands: 'frequency band levels, each from 0 to 1.',
    rawBands: 'band levels before calibration.',
    start: 'start recognition.',
    stop: 'stop and wait for the final transcript.',
    abort: 'stop immediately.',
    toggle: 'start or stop.',
  },
  usage: {
    description:
      'Voice input for a composer. Check isSupported first. False means this browser cannot listen. Loud speech turns the transcript to upper case.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Pass inputRef to put the words in the composer. Do not insert onResult as well.',
      },
      {
        guidance: true,
        description: 'Disable the control when isSupported is false.',
      },
      {
        guidance: true,
        description: 'Handle onError to learn that the microphone was refused.',
      },
      {
        guidance: false,
        description:
          'Call SpeechRecognition beside this hook. useSpeechRecognition is the headless wrapper.',
      },
    ],
  },
};
