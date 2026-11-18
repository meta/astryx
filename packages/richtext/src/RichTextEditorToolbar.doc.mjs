// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'RichTextEditorToolbar',
  subComponentOf: 'RichTextEditor',
  description: 'Formatting toolbar for the toolbar slot of RichTextEditor.',
  displayName: 'Rich Text Editor Toolbar',
  keywords: ['richtext', 'toolbar', 'formatting', 'bold', 'link', 'heading'],
  props: [
    {
      name: 'ref',
      type: 'Ref<HTMLDivElement>',
      description:
        'Ref to the toolbar\'s root element. The ref, className, style and xstyle reach the root of the Astryx Toolbar it renders; data-*, other aria-* attributes and DOM handlers reach its role="toolbar" element.',
    },
    {
      name: 'label',
      type: 'string',
      description:
        'Accessible label for the toolbar element. Pass label rather than aria-label.',
      default: "'Text formatting' (translated)",
    },
    {
      name: 'headingLevels',
      type: "ReadonlyArray<'h1' | 'h2' | 'h3'>",
      description:
        'Which heading levels the block-format selector offers, in order.',
      default: "['h1', 'h2', 'h3']",
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description:
        "Size of the toolbar's controls; it also sets the toolbar's padding.",
      default: "'sm'",
    },
    {
      name: 'hasLink',
      type: 'boolean',
      description:
        'Whether to show the link button. It opens a link popover anchored to the button, with one URL field applied with Enter and Remove when the selection is in a link. The popover is not modal; Escape or Cancel returns focus and the selection to the editor. With a collapsed selection the URL is inserted as link text; otherwise the selected text is linked. Only http, https, mailto and tel URLs are written.',
      default: 'true',
    },
    {
      name: 'promptForUrl',
      type: '(selectedText: string) => string | null | undefined',
      description:
        'A synchronous URL prompt that replaces the built-in link popover when the link button is pressed on a selection that is not a link. It gets the selected text; return the URL, or null or an empty string to cancel.',
    },
    {
      name: 'hasNewTabLinks',
      type: 'boolean',
      description:
        'Whether links made with the toolbar open in a new tab. When true, target="_blank" and rel="noopener noreferrer" are written into the link node, so they serialize.',
      default: 'true',
    },
    {
      name: 'endContent',
      type: 'ReactNode',
      description:
        'Extra items at the end of the toolbar, after a divider, such as mention or AI controls.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description: "StyleX styles for the toolbar's root.",
    },
  ],
  usage: {
    description:
      "A formatting toolbar for RichTextEditor, built from Astryx Toolbar, Selector and ToggleButton controls: undo and redo, a block-format selector for paragraphs, headings, lists and quotes, inline bold, italic, underline, strikethrough and code, and links. Render it in the editor's toolbar slot; it reaches the editor through the editor's Lexical composer, so it must live inside it.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Pass it as toolbar={<RichTextEditorToolbar />}. The slot places it at the top of the field, before the editing surface, in the right keyboard order.',
      },
      {
        guidance: true,
        description:
          "Restyle a glyph from a theme by its richtext:* icon key (see RICHTEXT_ICON_KEYS), for example defineTheme({icons: {'richtext:bold': <MyBoldIcon />}}).",
      },
      {
        guidance: false,
        description:
          "Render it outside RichTextEditor's toolbar slot: it needs the editor's Lexical composer.",
      },
    ],
  },
};
