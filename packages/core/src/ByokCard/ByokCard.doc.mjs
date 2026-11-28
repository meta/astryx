// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'ByokCard',
  displayName: 'ByokCard',
  category: 'Integration',
  keywords: [
    'byok',
    'api key',
    'provider',
    'llm',
    'connect',
    'rotate',
    'card',
    'openai',
    'anthropic',
    'gemini',
  ],
  props: [
    {
      name: 'provider',
      type: 'ByokProvider',
      required: true,
      description: 'Provider details including id, name, logo, and optional description.',
    },
    {
      name: 'status',
      type: "'connected' | 'disconnected'",
      default: "'disconnected'",
      description: 'Connection status of the provider.',
    },
    {
      name: 'accountLabel',
      type: 'string',
      description: 'Optional masked key identifier or account label shown when connected.',
    },
    {
      name: 'onConnect',
      type: '(apiKey: string) => void | Promise<void>',
      description: 'Callback fired when an API key is submitted to connect.',
    },
    {
      name: 'onRotate',
      type: '(newApiKey: string) => void | Promise<void>',
      description: 'Callback fired when a new API key is submitted to rotate the existing one.',
    },
    {
      name: 'onDelete',
      type: '() => void | Promise<void>',
      description: 'Callback fired when the user confirms key removal.',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      default: 'false',
      description: 'Disables interactive buttons on the card.',
    },
  ],
  playground: {
    defaults: {
      provider: {
        id: 'openai',
        name: 'OpenAI',
        description: 'GPT-4o, o1, o3-mini models',
      },
      status: 'disconnected',
    },
  },
  usage: {
    description:
      'ByokCard provides a complete Bring Your Own Key connection surface for LLM and AI service providers, featuring Connect, Rotate, and Delete lifecycle actions.',
  },
};
