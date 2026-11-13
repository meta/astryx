// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useChatPasteAsToken',
  displayName: 'useChatPasteAsToken',
  group: 'Chat',
  category: 'Chat',
  keywords: [
    'chat',
    'paste',
    'token',
    'composer',
    'clipboard',
    'contenteditable',
  ],
  params: [
    {
      name: 'options',
      type: 'UseChatPasteAsTokenOptions',
      description: 'Paste threshold, composer input ref, and token factory.',
      required: true,
    },
    {
      name: 'options.inputRef',
      type: 'React.RefObject<ChatComposerInputHandle | null>',
      description:
        'Ref to the ChatComposerInput that receives a generated token.',
      required: true,
    },
    {
      name: 'options.threshold',
      type: 'number',
      description: 'Pastes longer than this many characters become tokens.',
      default: '200',
      required: false,
    },
    {
      name: 'options.toToken',
      type: '(text: string) => ChatComposerToken',
      description:
        'Creates the token inserted for a paste longer than threshold. With ChatComposerInput’s default rendering, badge labels and variants apply up to 200 characters; longer pasted text uses the composer’s standard neutral expandable chip. Return a {value, render} token when a custom render must apply at any length.',
      required: false,
    },
  ],
  returns: [
    {
      name: 'onPaste',
      type: '(event: ClipboardEvent<HTMLDivElement>, text: string) => boolean',
      description:
        'Paste handler for ChatComposerInput. Returns true when the paste was converted into a token and false for normal text insertion.',
    },
  ],
  usage: {
    description:
      'Creates the paste handler used by ChatComposerInput to convert long plain-text pastes into tokens. Short pastes pass through the normal editor pipeline. With the default ChatComposerInput rendering, custom badge labels apply through 200 characters and longer text uses the standard expandable pasted-text chip.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Pass the same input ref to ChatComposerInput.handleRef and useChatPasteAsToken.',
      },
      {
        guidance: true,
        description:
          'Pass the returned object as ChatComposerInput.pasteAsToken.',
      },
      {
        guidance: true,
        description:
          'Provide toToken when the product needs a domain-specific label or token variant for pastes within the composer’s 200-character badge range; return {value, render} when the custom appearance must also apply to longer pastes.',
      },
      {
        guidance: false,
        description:
          'Call the handler without the ChatComposerInput handle ref. The hook needs the ref to insert the token at the caret.',
      },
    ],
  },
  relatedComponents: ['ChatComposerInput', 'ChatComposer'],
  importPath: '@astryxdesign/core/Chat',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Creates ChatComposerInput paste behavior that turns long plain-text pastes into tokens; the default composer uses its expandable pasted-text chip beyond 200 characters.',
  paramDescriptions: {
    options: 'input ref, character threshold, and token factory.',
    'options.inputRef': 'ChatComposerInput handle ref receiving the token.',
    'options.threshold': 'pastes longer than this become tokens; default 200.',
    'options.toToken':
      'custom token factory; badge labels apply through 200 characters, while longer pastes use the default expandable chip unless the factory returns {value, render}.',
  },
  returnDescriptions: {
    onPaste:
      'ChatComposerInput paste handler; true when converted, false for normal insertion.',
  },
  usage: {
    description:
      'Turns long pastes into ChatComposerInput tokens while short pastes remain normal text; the composer’s default expandable pasted-text chip handles values over 200 characters.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Share the handle ref with ChatComposerInput and the hook.',
      },
      {guidance: true, description: 'Pass the result to pasteAsToken.'},
      {
        guidance: true,
        description:
          'Customize toToken for product-specific labels, or return {value, render} to keep a custom rendering for longer values.',
      },
    ],
  },
};
