// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'CodeBlock',
  displayName: 'Code Block',
  category: 'Content',
  keywords: [
    'code',
    'syntax',
    'highlight',
    'snippet',
    'prism',
    'shiki',
    'pre',
    'monospace',
    'codeblock',
    'inline',
  ],
  description:
    'Fenced code block with syntax highlighting. Use for multi-line code snippets.',
  props: [
    {
      name: 'code',
      type: 'string',
      description: 'The code string to display.',
      required: true,
    },
    {
      name: 'language',
      type: 'string | CodeLanguage',
      description:
        'Language for syntax highlighting. A string selects a built-in: ts, js, tsx, jsx, json, html, xml, svg, css, scss, less, python, bash/sh/zsh/shell, php, hack, yaml, markdown, c, cpp (c++, cc, cxx, hpp, hh), sql, rust, kotlin, swift, go. Any other language is a value you import on its own and pass here: graphql, java, thrift, objectiveC, toml, powershell, ruby, lua, dockerfile from @astryxdesign/core/CodeBlock/languages/<path> (e.g. languages/graphql, languages/objective-c), or your own made with createCodeLanguage({name, identifiers, tokenize}). A value labels with its name and reflects its first identifier as data-language. Use "plaintext" to disable.',
      default: "'plaintext'",
    },
    {
      name: 'title',
      type: 'string',
      description: 'Filename or label shown in the header bar.',
    },
    {
      name: 'hasLanguageLabel',
      type: 'boolean',
      description:
        'Show the language name in the header bar. Hidden when language is "plaintext".',
      default: 'true',
    },
    {
      name: 'hasLineNumbers',
      type: 'boolean',
      description: 'Show a line number gutter.',
      default: 'false',
    },
    {
      name: 'highlightLines',
      type: 'number[]',
      description: '1-indexed line numbers to highlight.',
    },
    {
      name: 'isDiff',
      type: 'boolean',
      default: 'false',
      description:
        'Render the code as a unified diff over `language`: lines starting with + are added, - removed, @@ is a hunk header (a `--- `/`+++ ` file-header pair directly before one is a header too), anything else is context. The language label reads `diff` or `<language> diff`. The glyph sits in its own column and the rest of each line keeps syntax highlighting; copy returns the exact source. Markdown ```diff and ```diff-<lang> fences set this.',
    },
    {
      name: 'hasCopyButton',
      type: 'boolean',
      description: 'Show a copy-to-clipboard button.',
      default: 'true',
    },
    {
      name: 'onCopy',
      type: '() => void',
      description: 'Callback after the code is copied.',
    },
    {
      name: 'endContent',
      type: 'ReactNode',
      description:
        'Your own controls, shown just before Copy: in the header when the block has one, otherwise beside the code in the top inline-end corner, never over it. It never creates a header and never collapses the block. Ghost sm IconButtons match Copy’s size and variant.',
      slotElements: [
        {
          __element: 'IconButton',
          props: {
            variant: 'ghost',
            size: 'sm',
            label: 'Run in terminal',
          },
        },
      ],
    },
    {
      name: 'isWrapped',
      type: 'boolean',
      description: 'Wrap long lines instead of enabling horizontal scroll.',
      default: 'false',
    },
    {
      name: 'maxHeight',
      type: 'number | string',
      description: 'Max height before the block scrolls vertically.',
    },
    {
      name: 'size',
      type: "'sm' | 'md'",
      description: 'Text size variant.',
      default: "'md'",
    },
    {
      name: 'width',
      type: 'string',
      description:
        "Width of the code block. Any CSS width value. 'fit-content' (default) shrinks to longest line. '100%' fills parent width.",
      default: "'fit-content'",
    },
    {
      name: 'container',
      type: "'card' | 'section'",
      description:
        "Container presentation style. 'card' (default): border and radius with the muted syntax background for a standalone card look. 'section': no border or radius and a transparent background so the block blends into the card or panel it's embedded in.",
      default: "'card'",
    },
    {
      name: 'tokenizer',
      type: '(code: string, language: string) => Array<{type: string; start: number; end: number}>',
      description:
        'Deprecated: pass language={createCodeLanguage({name, identifiers, tokenize})} with this same function instead. Still works exactly as released and wins over the language; astryx upgrade rewrites static uses.',
    },
    {
      name: 'syntaxTheme',
      type: 'SyntaxThemeDefinition',
      description:
        'Per-instance syntax theme override. Shorthand for wrapping the block in <SyntaxTheme theme={...}>. Accepts a preset from @astryxdesign/core/theme/syntax or a theme created with defineSyntaxTheme(). Defaults to the nearest SyntaxTheme ancestor or the theme-level syntax colors.',
    },
    {
      name: 'highlightMode',
      type: "'auto' | 'ranges' | 'spans'",
      description: 'Syntax highlighting rendering mode.',
      default: "'auto'",
    },
    {
      name: 'isCollapsible',
      type: 'boolean',
      description:
        'Allow collapsing the code body into just the header bar. Starts expanded; a visible header becomes clickable when the code exceeds collapsibleThreshold lines. Headerless blocks never collapse, and removing the header expands a previously collapsed block.',
      default: 'false',
    },
    {
      name: 'collapsibleThreshold',
      type: 'number',
      description:
        'Minimum number of lines before the collapse toggle appears. Below this threshold the code block renders normally even when isCollapsible is true.',
      default: '10',
    },
    {
      name: 'ref',
      type: 'React.Ref<HTMLPreElement>',
      description: 'Ref forwarded to the root code-block element.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for layout customization. Must be a stylex.create() value.',
    },
    {
      name: 'className',
      type: 'string',
      description:
        'CSS class name for the root element. Prefer xstyle for styling.',
    },
    {
      name: 'style',
      type: 'CSSProperties',
      description: 'Inline styles. Prefer xstyle for StyleX-optimized styling.',
    },
    {
      name: 'data-testid',
      type: 'string',
      description: 'Test selector for automated testing frameworks.',
    },
  ],
  components: [{name: 'Code'}],
  playground: {
    defaults: {
      code: 'import {Button} from \'@astryxdesign/core/Button\';\n\nexport function App() {\n  return <Button label="Hello" variant="primary" />;\n}',
      language: 'tsx',
      hasCopyButton: true,
    },
  },
  theming: {
    targets: [
      {
        className: 'astryx-code-block',
        visualProps: ['size', 'language', 'container'],
      },
      {
        className: 'astryx-code-block-header',
        visualProps: ['size', 'language', 'container'],
      },
      {className: 'astryx-code-block-title', visualProps: ['size', 'language']},
      {className: 'astryx-code-block-copy-button'},
    ],
    vars: [
      {
        name: '--_codeblock-gutter-width',
        description:
          'Width of the line-number gutter, computed from the digit count of the last line so the code column starts at a stable offset.',
        default: '2ch',
        private: true,
      },
    ],
  },
  usage: {
    description:
      'CodeBlock renders syntax-highlighted code with line numbers, a copy button, and optional collapsible sections. Use CodeBlock for multi-line snippets like source files, terminal commands, and configuration examples. Use Code for inline references to function names, variables, or CLI flags within body text.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Set the language prop to match the code content so syntax highlighting is accurate. Use "plaintext" when the language is unknown.',
      },
      {
        guidance: true,
        description:
          'Add a title when the code represents a file. It gives readers context and appears in the header bar alongside the copy button.',
      },
      {
        guidance: true,
        description:
          'Use Code for short inline references like function names or CLI flags, and CodeBlock for standalone multi-line snippets.',
      },
      {
        guidance: false,
        description:
          'Enable line numbers on short snippets (under 5 lines) where they add clutter without helping navigation.',
      },
      {
        guidance: false,
        description:
          'Nest a code block inside a scrollable container. Use the maxHeight prop instead, which handles overflow natively.',
      },
    ],
    anatomy: [
      {
        name: 'Header Bar',
        required: false,
        description:
          'Shows the title, visible language label, endContent, and copy button when a header is present. A title or visible language label creates the header at every line count. With no title and hasLanguageLabel={false}, endContent and the copy button sit in their own column beside the code, centred on the first line, and never cover it; a one-line block then reads as a single row.',
      },
      {
        name: 'Header Title',
        required: false,
        description:
          'Groups the optional title, visible language label, and collapsible chevron inside the header bar.',
      },
      {
        name: 'Line Numbers',
        required: false,
        description:
          'Numbered gutter along the left edge. Enable with hasLineNumbers.',
      },
      {
        name: 'Code Body',
        required: true,
        description: 'The syntax-highlighted code content.',
      },
      {
        name: 'Highlighted Lines',
        required: false,
        description: 'Background accent on specific lines to draw attention.',
      },
      {
        name: 'Copy Button',
        required: false,
        description:
          'Copies the code string to the clipboard. Shown by default.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsZh = {
  usage: {
    description:
      'CodeBlock displays syntax-highlighted code snippets with optional line numbers, copy button, and collapsible sections. Use CodeBlock for fenced multi-line code and Code for inline code within prose.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Set the language prop to enable syntax highlighting. Use "plaintext" when the language is unknown or not supported.',
      },
      {
        guidance: true,
        description:
          'Use Code for short inline code references within body text, and CodeBlock for standalone multi-line snippets.',
      },
      {
        guidance: false,
        description:
          'Enable line numbers for short snippets where they add visual noise without aiding comprehension.',
      },
      {
        guidance: false,
        description:
          'Wrap code blocks in a scrollable container when isWrapped or maxHeight already handles overflow.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'syntax-highlighted code block via CSS Custom Highlight API (0-DOM overhead); span-based fallback; Code for inline code in prose',
  usage: {
    description:
      'CodeBlock renders syntax-highlighted code with line numbers, a copy button, and optional collapsible sections. Use CodeBlock for multi-line snippets like source files, terminal commands, and configuration examples. Use Code for inline references to function names, variables, or CLI flags within body text.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Set the language prop to match the code content so syntax highlighting is accurate. Use "plaintext" when the language is unknown.',
      },
      {
        guidance: true,
        description:
          'Add a title when the code represents a file. It gives readers context and appears in the header bar alongside the copy button.',
      },
      {
        guidance: true,
        description:
          'Use Code for short inline references like function names or CLI flags, and CodeBlock for standalone multi-line snippets.',
      },
      {
        guidance: false,
        description:
          'Enable line numbers on short snippets (under 5 lines) where they add clutter without helping navigation.',
      },
      {
        guidance: false,
        description:
          'Nest a code block inside a scrollable container. Use the maxHeight prop instead, which handles overflow natively.',
      },
    ],
  },
};
