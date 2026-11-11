// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useChatPasteAsToken',
  displayName: 'useChatPasteAsToken',
  keywords: ['chat', 'paste', 'token', 'composer', 'clipboard'],
  params: [
    {
      name: 'inputRef',
      type: 'React.RefObject<ChatComposerInputHandle | null>',
      description:
        'The composer handle. A long paste is inserted with its insertToken method.',
      required: true,
    },
    {
      name: 'threshold',
      type: 'number',
      description:
        'Pastes longer than this many characters become a token. Shorter pastes stay inline.',
      default: '200',
      required: false,
    },
    {
      name: 'toToken',
      type: '(text: string) => ChatComposerToken',
      description:
        'Builds the token from the pasted text. The default token is a neutral badge whose label is the size of the paste.',
      required: false,
    },
  ],
  returns: [
    {
      name: 'onPaste',
      type: '(event, text: string) => boolean',
      description:
        "Pass this to ChatComposerInput's pasteAsToken, or call it from onPaste. True means the paste became a token. False means the composer should insert the text.",
    },
  ],
  usage: {
    description:
      'Turns a long plain-text paste into a token chip in a ChatComposerInput. Short pastes are left for the composer to insert. Pass the returned object as pasteAsToken. The default threshold is 200 characters.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep the same ref on the composer handle and on this hook, so insertToken reaches that input.',
      },
      {
        guidance: true,
        description:
          'Pass pasteAsToken={false} when every paste should stay inline text.',
      },
      {
        guidance: false,
        description:
          'Insert the long paste as characters and also as a token. Returning true tells the composer the paste is already handled.',
      },
    ],
  },
  relatedComponents: ['ChatComposerInput'],
  importPath: '@astryxdesign/core/Chat',
  category: 'Chat',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'A long plain-text paste becomes a token in ChatComposerInput. Shorter pastes stay inline.',
  paramDescriptions: {
    inputRef: 'composer handle that receives the token.',
    threshold: 'character count above which a paste becomes a token.',
    toToken: 'builds the token. The default label is the paste size.',
  },
  returnDescriptions: {
    onPaste:
      'pass as pasteAsToken. True means the paste became a token.',
  },
  usage: {
    description:
      'Pass the result as ChatComposerInput pasteAsToken. The default threshold is 200 characters.',
    bestPractices: [
      {
        guidance: true,
        description: 'Use one ref for the composer handle and the hook.',
      },
      {
        guidance: true,
        description: 'Pass pasteAsToken={false} to keep every paste inline.',
      },
      {
        guidance: false,
        description: 'Insert a handled paste as both text and a token.',
      },
    ],
  },
};
