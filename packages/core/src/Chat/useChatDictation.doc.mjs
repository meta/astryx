// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useChatDictation',
  displayName: 'useChatDictation',
  group: 'Chat',
  category: 'Chat',
  keywords: [
    'dictation',
    'voice',
    'speech',
    'microphone',
    'speech-to-text',
    'voice input',
    'stt',
  ],
  params: [
    {
      name: 'options',
      type: 'UseChatDictationOptions',
      description: 'Dictation options. All of them are optional.',
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
      name: 'options.transformTranscript',
      type: '(transcript: string) => string',
      description:
        'Transform transcript text before it is reported. Applied before the CAPS LOCK (sustained volume) rule.',
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
    {
      name: 'options.hasSounds',
      type: 'boolean',
      description: 'Play subtle audio cues on start and stop.',
      default: 'false',
      required: false,
    },
    {
      name: 'options.inputRef',
      type: 'React.RefObject<ChatComposerInputHandle | null>',
      description:
        'Ref to the ChatComposerInput. When given, interim transcripts appear as ghost text inside the input.',
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
      description:
        'Real-time microphone level, 0 to 1, updating at about 60 fps while listening.',
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
      'The one hook consumers call for voice-to-text input into a chat composer. It wraps useSpeechRecognition and adds the parts a composer needs: microphone volume and frequency bands for a level meter, an optional audio cue on start and stop, a CAPS LOCK rule that uppercases while the user holds sustained volume, and interim ghost text managed in the ChatComposerInput through inputRef. Pair it with ChatDictationButton, which renders the idle microphone and the listening bars from this return value.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Pass inputRef so interim text appears as ghost text in the composer while the user speaks, instead of arriving only at the end.',
      },
      {
        guidance: true,
        description:
          'Render ChatDictationButton in the sendActions slot of ChatComposer and pass it this hook\'s return value - the button knows every listening state.',
      },
      {
        guidance: true,
        description:
          'Design for isSupported false from the start: the composer must work without voice, and the button hides itself when recognition is unavailable.',
      },
      {
        guidance: false,
        description:
          'Call useSpeechRecognition as well to get the same phases - this hook already runs it, and two instances compete for the microphone.',
      },
      {
        guidance: false,
        description:
          'Stop the flow with abort when the user expects their last words kept: abort discards the final result, stop waits for it.',
      },
    ],
  },
  relatedComponents: ['ChatComposer', 'ChatComposerInput', 'ChatDictationButton'],
  importPath: '@astryxdesign/core/Chat',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Voice-to-text for ChatComposer: wraps useSpeechRecognition and adds volume/bands, audio cues, the CAPS LOCK rule and interim ghost text through inputRef. Pair with ChatDictationButton.',
  paramDescriptions: {
    options: 'dictation options; all optional.',
    'options.lang': 'BCP-47 tag; defaults to the i18n locale.',
    'options.continuous': 'keep recognizing until stopped; default true.',
    'options.interimResults': 'report interim results; default true.',
    'options.transformTranscript': 'transform text before reporting; runs before CAPS LOCK.',
    'options.onTranscript': 'each result, interim or final.',
    'options.onResult': 'final results only.',
    'options.onError': 'recognition errors.',
    'options.hasSounds': 'audio cues on start/stop; default false.',
    'options.inputRef': 'ChatComposerInput ref for interim ghost text.',
  },
  returnDescriptions: {
    isSupported: 'browser supports SpeechRecognition.',
    isListening: 'recognition active.',
    isSpeaking: 'speech detected.',
    volume: 'mic level 0-1, ~60 fps.',
    bands: 'frequency bands low to high, 0-1 each.',
    interimTranscript: 'current interim text.',
    start: 'start recognition.',
    stop: 'stop gracefully; keeps the final result.',
    abort: 'abort now; discards the result.',
    toggle: 'start when idle, stop when listening.',
  },
  usage: {
    description:
      'Voice input for a chat composer: volume and bands for a meter, optional cues, CAPS LOCK from sustained volume, interim ghost text via inputRef. Use ChatDictationButton to render the states.',
    bestPractices: [
      {
        guidance: true,
        description: 'Pass inputRef for interim ghost text.',
      },
      {
        guidance: true,
        description: 'Place ChatDictationButton in sendActions.',
      },
      {
        guidance: true,
        description: 'Design for isSupported false.',
      },
      {
        guidance: false,
        description: 'Do not also run useSpeechRecognition; one mic.',
      },
      {
        guidance: false,
        description: 'Do not abort when the last words must be kept.',
      },
    ],
  },
};
