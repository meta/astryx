// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'RichTextView',
  displayName: 'Rich Text View',
  category: 'Content',
  keywords: [
    'richtext',
    'rich text',
    'viewer',
    'read-only',
    'lexical',
    'render',
    'serialized',
  ],
  props: [
    {
      name: 'value',
      type: 'string',
      description:
        'Serialized editor state to render: the JSON string from JSON.stringify(editorState.toJSON()). The view updates when value changes.',
      required: true,
    },
    {
      name: 'nodes',
      type: 'ReadonlyArray<Klass<LexicalNode>>',
      description:
        'Lexical nodes to register beyond the default set. Pass the same nodes the content was authored with, so custom node types deserialize.',
    },
    {
      name: 'markdownExtensions',
      type: 'ReadonlyArray<RichTextMarkdownExtension>',
      description:
        'Markdown plugins whose nodes this view draws, each adopted with createRichTextExtension. A plugin node renders as core Markdown renders it; a node whose plugin is not passed shows its source. Pass the extensions the content was converted with, created in a client module.',
    },
    {
      name: 'codeLanguages',
      type: 'ReadonlyArray<CodeLanguage>',
      description:
        "CodeBlock languages a fence may name, such as graphql from @astryxdesign/core/CodeBlock/languages/graphql. Pass the same list as Markdown's codeLanguages, so reading and editing label and paint the same languages.",
    },
    {
      name: 'plugins',
      type: 'ReactNode',
      description:
        'Read-only Lexical plugins to render inside the view, such as hover cards or decorators.',
    },
    {
      name: 'namespace',
      type: 'string',
      description: 'The Lexical composer namespace.',
      default: "'astryx-view'",
    },
    {
      name: 'onParseError',
      type: '(error: Error) => void',
      description:
        'Called when value cannot be parsed or rendered, for example malformed JSON or a node type that is not registered through nodes. Use it to log or report the failure.',
    },
    {
      name: 'errorFallback',
      type: 'ReactNode',
      description:
        'What to render when value cannot be parsed or rendered. The view renders it instead of throwing.',
      default: 'null',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description: 'StyleX styles for the view root.',
    },
  ],
  usage: {
    description:
      'Renders serialized RichTextEditor content read-only, with the same nodes, tables, code blocks and Markdown plugin nodes the editor draws. Ships from @astryxdesign/richtext, with lexical and @lexical/* as optional peer dependencies.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Store editorState.toJSON() from RichTextEditor onChange, and pass the stringified JSON as value.',
      },
      {
        guidance: true,
        description:
          'Register the same custom nodes and markdownExtensions on the editor and the view, so stored content round-trips.',
      },
      {
        guidance: true,
        description:
          'Pass onParseError and an errorFallback when the stored content can come from an older or a foreign schema. By default a parse failure renders nothing instead of throwing.',
      },
      {
        guidance: false,
        description:
          'Use RichTextView to render Markdown source; use core Markdown for that.',
      },
    ],
  },
};
