// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useChatPasteAsToken',
  displayName: 'useChatPasteAsToken',
  group: 'Chat',
  category: 'Chat',
  keywords: [
    'paste',
    'clipboard',
    'token',
    'chip',
    'composer',
    'chat input',
  ],
  params: [
    {
      name: 'options',
      type: 'UseChatPasteAsTokenOptions',
      description: 'Paste-as-token options.',
      required: true,
    },
    {
      name: 'options.inputRef',
      type: 'React.RefObject<ChatComposerInputHandle | null>',
      description: 'Ref to the composer input handle for inserting tokens.',
      required: true,
    },
    {
      name: 'options.threshold',
      type: 'number',
      description:
        'Character count threshold. Pastes longer than this become tokens; shorter pastes pass through as normal text.',
      default: '200',
      required: false,
    },
    {
      name: 'options.toToken',
      type: '(text: string) => ChatComposerToken',
      description:
        'Convert the pasted text into the token to insert. The default creates a neutral badge labelled with the character count (and line count for multi-line pastes).',
      required: false,
    },
  ],
  returns: [
    {
      name: 'onPaste',
      type: '(event: ClipboardEvent<HTMLDivElement>, text: string) => boolean',
      description:
        'Pass as the onPaste prop on ChatComposerInput. Returns true when the paste was converted to a token, false when the text passed the threshold and inserts normally.',
    },
  ],
  usage: {
    description:
      'Turns long pastes into token chips instead of a wall of text. The hook returns an onPaste handler for ChatComposerInput: text at or below the threshold passes through untouched, text above it is converted - by default to a neutral badge carrying the character count, or to whatever your toToken returns, which is where an attachment-style flow or an external-content chip plugs in. The token is inserted through the composer handle, so it joins the message like any other token.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Wire the returned onPaste straight into ChatComposerInput and pass the same inputRef to the hook - insertion goes through the handle.',
      },
      {
        guidance: true,
        description:
          'Pick the threshold from the content: a support composer converting logs at 200 characters is useful; a casual chat at 200 is aggressive.',
      },
      {
        guidance: true,
        description:
          'Use toToken when the paste has structure - a URL becomes a link chip, JSON becomes a file-style chip with a name.',
      },
      {
        guidance: false,
        description:
          'Return false from toToken or throw for unsupported content: convert the text or let it through, so a paste never silently disappears.',
      },
      {
        guidance: false,
        description:
          'Set the threshold to 0. Everything becoming a chip takes away the ordinary way to paste a sentence.',
      },
    ],
  },
  relatedComponents: ['ChatComposerInput', 'ChatComposer'],
  importPath: '@astryxdesign/core/Chat',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Paste-as-token for ChatComposerInput: pastes over the threshold become token chips inserted through the handle; short pastes pass through.',
  paramDescriptions: {
    options: 'paste-as-token options.',
    'options.inputRef': 'composer input handle ref; inserts the token.',
    'options.threshold': 'character cutoff; default 200.',
    'options.toToken': 'text to token; default a neutral count badge.',
  },
  returnDescriptions: {
    onPaste: 'handler for ChatComposerInput; true when converted to a token.',
  },
  usage: {
    description:
      'Long pastes become chips via the composer handle; short pastes insert normally. Customize with toToken.',
    bestPractices: [
      {
        guidance: true,
        description: 'Same inputRef in the hook and the input.',
      },
      {
        guidance: true,
        description: 'Set the threshold per content type.',
      },
      {
        guidance: true,
        description: 'toToken for structured pastes.',
      },
      {
        guidance: false,
        description: 'Threshold 0 chips every paste.',
      },
    ],
  },
};
