// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'CodeEditor',
  displayName: 'Code Editor',
  group: 'CodeEditor',
  category: 'Form Controls',
  keywords: ['code', 'editor', 'syntax', 'highlight', 'input', 'textarea'],

  usage: {
    description:
      'Editable code component with real-time syntax highlighting using the CSS Custom Highlight API. Supports line numbers, read-only state, placeholder text, and custom tokenizers.',
  },

  props: [
    {
      name: 'value',
      type: 'string',
      description: 'Controlled string value for the editor.',
      required: true,
    },
    {
      name: 'onChange',
      type: '(value: string) => void',
      description: 'Callback fired when the code content changes.',
      required: true,
    },
    {
      name: 'label',
      type: 'string',
      description: 'Accessible label for the editable region (aria-label).',
      required: true,
    },
    {
      name: 'language',
      type: 'string',
      description: 'Programming language for syntax highlighting.',
      default: "'plaintext'",
    },
    {
      name: 'hasLineNumbers',
      type: 'boolean',
      description: 'Display line number gutter on the left.',
      default: 'false',
    },
    {
      name: 'isReadOnly',
      type: 'boolean',
      description: 'Renders the editor in a read-only state.',
      default: 'false',
    },
    {
      name: 'placeholder',
      type: 'string',
      description: 'Placeholder text displayed when value is empty.',
    },
    {
      name: 'maxHeight',
      type: 'number | string',
      description: 'Maximum container height before internal scrolling.',
    },
    {
      name: 'size',
      type: "'sm' | 'md'",
      description: 'Font size variant for the code text.',
      default: "'md'",
    },
    {
      name: 'tokenizer',
      type: '(code: string, language: string) => TokenLine[]',
      description: 'Custom tokenizer function override for language parsing.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description: 'StyleX styles for layout customization.',
    },
  ],
};
