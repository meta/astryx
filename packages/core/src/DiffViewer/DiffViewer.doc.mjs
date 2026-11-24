// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Frame',
    required: true,
    description:
      'Root that holds the file header and the hunk area. Reflects `viewMode`.',
  },
  {
    name: 'File header',
    required: false,
    description:
      'Row above the hunks with the disclosure, the path, the status token, the line counts, and endContent. Renders when the file has a path or endContent renders something.',
  },
  {
    name: 'Disclosure toggle',
    required: false,
    description:
      'Button around the chevron and the path that hides and shows the hunks. Renders when collapsible is on and the file has a path.',
  },
  {
    name: 'Chevron',
    required: false,
    description:
      'Icon in the disclosure toggle. It points down while the hunks show, and its collapsed direction mirrors in right-to-left pages.',
  },
  {
    name: 'File path',
    required: false,
    description:
      'The new path, the old path of a deleted file, or "old → new" for a renamed file. It reads left to right in every page direction.',
  },
  {
    name: 'Status token',
    required: false,
    description: 'Token that marks an added, deleted, or renamed file.',
  },
  {
    name: 'Line counts',
    required: false,
    description:
      'Added and removed line counts, with one visually hidden sentence for screen readers.',
  },
  {
    name: 'End content',
    required: false,
    description:
      'Caller content at the end of the header, such as a "Viewed" checkbox.',
  },
  {
    name: 'Hunk area',
    required: true,
    description:
      'Scroll area with the hunks: one table in unified view, two side-by-side panes in split view. Hunk headers, line numbers, change indicators, and row tints take the syntax theme diff slots. A binary file, or a file with no line changes, shows a message here instead.',
  },
  {
    name: 'Annotation row',
    required: false,
    description:
      'Full-width row under a line that holds what renderLineAnnotation returns for it.',
  },
  {
    name: 'Large-change fold',
    required: false,
    description:
      'Row that folds a change too large to compare line by line, or a file with more than 2,000 other changed lines, with a Show full diff button.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'DiffViewer',
  displayName: 'Diff Viewer',
  // Keeps the registry route DiffViewer had as a canary-only Lab component.
  registry: {aliases: ['lab/diff-viewer']},
  group: 'DiffViewer',
  category: 'Content',
  keywords: [
    'diff',
    'patch',
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
    anatomy,
    description:
      'Read-only, syntax-highlighted diff of one file for code review surfaces. Renders a file header (path, Added/Deleted/Renamed token, +/− line counts, an endContent slot, and an optional disclosure) over the file\'s hunks in unified or split (side-by-side) view. Rows use the same syntax-theme diff slots as CodeBlock with isDiff, so one syntax theme styles both. renderLineAnnotation adds a full-width row under any line (for review comments) and onLineNumberClick turns line numbers into buttons. Build the file model with parseUnifiedDiff(patch), which returns one file per file in a git or diff -u patch, or with createDiffFile({oldValue, newValue}) when you hold two versions of a text. Display options cover how a change is marked (classic +/− glyphs, bars, or none), whether changed rows are tinted, and word- or character-level highlighting of what changed inside each removed/added line pair. Each changed line carries a visually hidden "Added"/"Removed" label, so the change reads without colour in every mode. Unwrapped, line numbers and change indicators stay pinned while the code scrolls; in split view each side is its own scroller, so the split stays fixed at half and half, the sides scroll sideways in lockstep, and a row is as tall as its taller side. While code overflows sideways, sideways overscroll is off, so trackpads neither bounce past a line nor swipe the browser back. In right-to-left pages the hunk area stays left-to-right, like a code editor: annotation content reads in the page direction, and annotation rows scroll with the code. When a change is too large to compare line by line, createDiffFile marks its hunk with isReplacedBlock: it lists every old line as removed and every new line as added. DiffViewer folds those lines behind a "Large change: N lines" row, where N counts the block\'s removed plus added lines, with a Show full diff button. A file with more than 2,000 other changed lines starts folded the same way, because every row costs render time. Its line diff is still there when the reader opens it. A fold opens by itself when a line it would hide has an annotation, so no review comment is hidden. Rows are plain DOM with no virtualization: collapse or window very large files.',
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
          'Put file-level actions such as a "Viewed" checkbox in endContent, and drive collapsible={{isOpen, onOpenChange}} from the same state if viewed files should fold away.',
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
        "The file to render: paths, status ('added', 'deleted', 'modified', or 'renamed'), binary flag, and hunks of numbered lines, each of kind 'added', 'removed', or 'context'. Build it with parseUnifiedDiff or createDiffFile.",
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
      name: 'collapsible',
      type: 'boolean | {defaultIsOpen?: boolean; isOpen?: boolean; onOpenChange?: (isOpen: boolean) => void}',
      description:
        'Whether the file header is a disclosure that hides and shows the hunks. Applies when the file has a path to name the control. On by default, starting open. `false` opts out: the hunks always show and the path is plain text. `{defaultIsOpen: false}` starts collapsed; `{isOpen, onOpenChange}` is controlled. Takes the same CollapsibleConfig as Collapsible.',
      default: 'true',
    },
    {
      name: 'endContent',
      type: 'ReactNode',
      description:
        'Content at the end of the file header, such as a "Viewed" checkbox or a file actions menu.',
    },
    {
      name: 'renderLineAnnotation',
      type: '(ref: DiffViewerLineRef) => ReactNode',
      description:
        "Render content in a full-width row under a line, such as review comments; return null for lines with nothing to show. In split view the row sits under the line's own side. The ref names the side ('old' or 'new'), the line number, the line (of kind 'added', 'removed', or 'context'), and its hunk index.",
    },
    {
      name: 'onLineNumberClick',
      type: '(ref: DiffViewerLineRef, event: MouseEvent<HTMLButtonElement>) => void',
      description:
        "Makes each line's number a button, for example to start a comment on that line. The button is the number the line is anchored to: the original number of a removed line, and the changed-file number of an added or unchanged line (an unchanged line's original number stays plain text). Each line number is its own Tab stop. The ref names the side ('old' or 'new'), the line number, the line (of kind 'added', 'removed', or 'context'), and its hunk index.",
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

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'read-only, syntax-highlighted diff of one file for code review',
  usage: {
    description:
      'One file per DiffViewer: a header (path, Added/Deleted/Renamed token, +/− counts, endContent, optional disclosure) over its hunks in unified or split view. Build the file with parseUnifiedDiff(patch) or createDiffFile({oldValue, newValue}). Rows take the CodeBlock isDiff syntax-theme slots. renderLineAnnotation adds a row under a line (review comments); onLineNumberClick makes line numbers buttons. Every changed line carries a hidden "Added"/"Removed" label. The hunk area stays left-to-right in RTL. A change too large to compare, and a file with more than 2,000 other changed lines, start folded. No virtualization: window or collapse very large files.',
    bestPractices: [
      {
        guidance: true,
        description:
          'One DiffViewer per file; lay out the list yourself: parseUnifiedDiff(patch).map(file => <DiffViewer key={file.newPath ?? file.oldPath} file={file} />).',
      },
      {
        guidance: true,
        description:
          'Anchor review comments on DiffViewerLineRef side + lineNumber: the same in unified and split view.',
      },
      {
        guidance: true,
        description:
          'Put a "Viewed" checkbox in endContent; drive collapsible={{isOpen, onOpenChange}} from the same state to fold viewed files.',
      },
      {
        guidance: false,
        description:
          'Use for a short diff in prose or chat; a CodeBlock with isDiff (or a ```diff fence in Markdown) fits there.',
      },
    ],
  },
  propDescriptions: {
    file: 'the file to render; build with parseUnifiedDiff or createDiffFile',
    viewMode: 'unified (one column) | split (old left, new right)',
    language:
      'built-in id or CodeBlock language value; default inferred from the path',
    codeLanguages: 'language values the path may infer; later entry wins',
    hasLineNumbers: 'show old and new line-number gutters',
    isWrapped: 'wrap long lines instead of scrolling sideways',
    changeIndicator: 'classic +/− glyphs | bars | none',
    inlineHighlight: 'highlight changed words | chars | none in paired lines',
    hasChangeBackground: 'tint added and removed rows',
    collapsible:
      'header disclosure for the hunks; default true=starts open. false=no disclosure. {defaultIsOpen:false}=starts collapsed, {isOpen,onOpenChange}=controlled',
    endContent: 'content at the end of the file header',
    renderLineAnnotation:
      'content for a full-width row under a line; null for none',
    onLineNumberClick: "makes each line's anchor-side number a button",
    maxHeight: 'max height of the hunk area before it scrolls',
    syntaxTheme: 'per-instance syntax theme, as on CodeBlock',
  },
};
