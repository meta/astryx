// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'DiffViewer',
  displayName: 'Diff Viewer',
  group: 'DiffViewer',
  category: 'Content',
  keywords: [
    'diff',
    'patch',
    'code review',
    'changes',
    'split',
    'unified',
    'side by side',
    'compare',
    'word diff',
    'inline highlight',
  ],

  theming: {
    targets: [
      {className: 'astryx-diff-viewer', visualProps: ['viewMode']},
      {className: 'astryx-diff-viewer-header'},
      {className: 'astryx-diff-viewer-path'},
    ],
  },

  usage: {
    description:
      'Read-only, syntax-highlighted diff of one file for code review surfaces. Renders a file header (path, Added/Deleted/Renamed token, +/− line counts, a headerEnd slot, and an optional disclosure) over the file\'s hunks in unified or split (side-by-side) view. Rows use the same syntax-theme diff slots as CodeBlock with isDiff, so one syntax theme styles both. renderLineAnnotation adds a full-width row under any line (for review comments) and onLineNumberClick turns line numbers into buttons. Build the file model with parseUnifiedDiff(patch), which returns one file per file in a git or diff -u patch, or with createDiffFile({oldValue, newValue}) when you hold two versions of a text. Display options cover how a change is marked (classic +/− glyphs, bars, or none), whether changed rows are tinted, and word- or character-level highlighting of what changed inside each removed/added line pair. Each changed line carries a visually hidden "Added"/"Removed" label, so the change reads without colour in every mode. Unwrapped, line numbers and change indicators stay pinned while the code scrolls; in split view each side is its own scroller, so the split stays fixed at half and half, the sides scroll sideways in lockstep, and a row is as tall as its taller side. While code overflows sideways, sideways overscroll is off, so trackpads neither bounce past a line nor swipe the browser back. In right-to-left pages the hunk area stays left-to-right, like a code editor: annotation content reads in the page direction, and annotation rows scroll with the code. Rows are plain DOM with no virtualization: collapse or window very large files.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Render one DiffViewer per file and lay out the list yourself; parseUnifiedDiff(patch).map(file => <DiffViewer key={file.newPath ?? file.oldPath} file={file} />) is the multi-file case.',
      },
      {
        guidance: true,
        description:
          'Anchor review comments with the DiffViewerLineRef side + lineNumber pair: it is the same in unified and split view.',
      },
      {
        guidance: true,
        description:
          'Put file-level actions such as a "Viewed" checkbox in headerEnd, and drive isCollapsed from the same state if viewed files should fold away.',
      },
      {
        guidance: false,
        description:
          'Use DiffViewer for a short diff inside prose or a chat message; a CodeBlock with isDiff (or a ```diff fence in Markdown) is the lighter fit there.',
      },
    ],
  },

  examples: [
    {
      label: 'Unified diff from a patch',
      code: `const [file] = parseUnifiedDiff(patch);

<DiffViewer file={file} />`,
    },
    {
      label: 'Split view',
      code: '<DiffViewer file={file} viewMode="split" />',
    },
    {
      label: 'Diff two versions of a text',
      code: `const file = createDiffFile({oldValue: before, newValue: after, path: 'src/app.ts'});

<DiffViewer file={file} />`,
    },
    {
      label: 'Bars, character highlighting, no row tint',
      code: `<DiffViewer
  file={file}
  viewMode="split"
  changeIndicator="bars"
  inlineHighlight="char"
  hasChangeBackground={false}
/>`,
    },
    {
      label: 'Review comments',
      code: `<DiffViewer
  file={file}
  onLineNumberClick={(ref) => startComment(ref.side, ref.lineNumber)}
  renderLineAnnotation={(ref) => {
    const thread = threads.get(\`\${ref.side}:\${ref.lineNumber}\`);
    return thread ? <CommentThread thread={thread} /> : null;
  }}
/>`,
    },
  ],

  props: [
    {
      name: 'file',
      type: 'DiffViewerFile',
      description:
        'The file to render: paths, status, binary flag, and hunks of numbered lines. Build it with parseUnifiedDiff or createDiffFile.',
      required: true,
    },
    {
      name: 'viewMode',
      type: "'unified' | 'split'",
      description:
        "'unified' shows one column with removed lines above their replacements; 'split' shows the old file on the left and the new file on the right, pairing each removed line with the added line that replaced it.",
      default: "'unified'",
    },
    {
      name: 'language',
      type: 'string | CodeLanguage',
      description:
        'Syntax-highlighting language: a built-in identifier, or a CodeBlock language value imported on its own (e.g. graphql from @astryxdesign/core/CodeBlock/languages/graphql) or made with createCodeLanguage. Defaults to one inferred from the file name or extension among the built-ins and codeLanguages; an unmatched file renders as plain text.',
    },
    {
      name: 'codeLanguages',
      type: 'ReadonlyArray<CodeLanguage>',
      description:
        'Language values the file name or extension may infer, such as [graphql, dockerfile]; a later entry wins. Pass the same list to every DiffViewer on a review page.',
    },
    {
      name: 'hasLineNumbers',
      type: 'boolean',
      description: 'Show the old and new line-number gutters.',
      default: 'true',
    },
    {
      name: 'isWrapped',
      type: 'boolean',
      description:
        'Wrap long lines instead of scrolling them horizontally. Unwrapped, line numbers and change indicators stay pinned while the code scrolls; in split view each side is its own scroller, the split stays fixed at half and half, and the two sides scroll sideways in lockstep. While code overflows sideways, sideways overscroll (elastic bounce, swipe navigation) is off.',
      default: 'false',
    },
    {
      name: 'changeIndicator',
      type: "'classic' | 'bars' | 'none'",
      description:
        "How changed lines are marked beside their code: 'classic' +/− glyphs, 'bars' (a solid bar for added lines, a dashed bar for removed lines), or 'none'. Screen readers hear \"Added\"/\"Removed\" in every mode.",
      default: "'classic'",
    },
    {
      name: 'inlineHighlight',
      type: "'word' | 'char' | 'none'",
      description:
        'Highlight the changed words (or characters) inside each removed line and the added line that replaced it, paired as in split view. Lines that share nothing but whitespace get no inline highlight.',
      default: "'word'",
    },
    {
      name: 'hasChangeBackground',
      type: 'boolean',
      description:
        'Tint the rows of added and removed lines. Without it only the change indicator, the line numbers, and the inline highlight mark a change.',
      default: 'true',
    },
    {
      name: 'isCollapsible',
      type: 'boolean',
      description:
        'Make the file header a disclosure that hides and shows the hunks. Applies when the file has a path to name the control.',
      default: 'true',
    },
    {
      name: 'isCollapsed',
      type: 'boolean',
      description: 'Controlled collapsed state. Pair with onCollapsedChange.',
    },
    {
      name: 'defaultIsCollapsed',
      type: 'boolean',
      description: 'Initial collapsed state when uncontrolled.',
      default: 'false',
    },
    {
      name: 'onCollapsedChange',
      type: '(isCollapsed: boolean) => void',
      description:
        'Called with the next collapsed state when the header is toggled.',
    },
    {
      name: 'headerEnd',
      type: 'ReactNode',
      description:
        'Content at the end of the file header, such as a "Viewed" checkbox or a file actions menu.',
    },
    {
      name: 'renderLineAnnotation',
      type: '(ref: DiffViewerLineRef) => ReactNode',
      description:
        "Render content in a full-width row under a line, such as review comments; return null for lines with nothing to show. In split view the row sits under the line's own side.",
    },
    {
      name: 'onLineNumberClick',
      type: '(ref: DiffViewerLineRef, event: MouseEvent<HTMLButtonElement>) => void',
      description:
        "Makes each line's number a button, for example to start a comment on that line. The button is the number the line is anchored to: the original number of a removed line, and the changed-file number of an added or unchanged line (an unchanged line's original number stays plain text). Each line number is its own Tab stop.",
    },
    {
      name: 'maxHeight',
      type: 'number | string',
      description: 'Maximum height of the hunk area before it scrolls.',
    },
    {
      name: 'syntaxTheme',
      type: 'SyntaxThemeDefinition',
      description:
        'Per-instance syntax theme, as on CodeBlock. Without it the nearest SyntaxTheme or the theme syntax colors apply.',
    },
    {
      name: 'ref',
      type: 'Ref<HTMLDivElement>',
      description: 'Ref forwarded to the root element.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description: 'StyleX styles for layout customization.',
    },
  ],
};
