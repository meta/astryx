// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file RichTextEditorToolbar.tsx
 * @input Uses React, @lexical/react (composer context), @lexical/rich-text,
 *   @lexical/selection, @lexical/list, @lexical/utils, and the lexical core
 *   command constants, plus Astryx Toolbar / IconButton / Selector /
 *   ToggleButton / Divider / Popover / TextInput / Layout primitives.
 * @output Exports RichTextEditorToolbar (a compact formatting toolbar with a
 *   RichText-owned 4px control gutter, a horizontally scrollable action row,
 *   and a link popover anchored to its Link button) and
 *   RichTextEditorToolbarProps.
 * @position @astryxdesign/richtext. Drop into RichTextEditor's `toolbar` slot to
 *   add a flush top formatting toolbar. Themed via Astryx Toolbar, Selector,
 *   IconButton, and ToggleButton, so it inherits the active theme. Base props
 *   pass through to the Astryx Toolbar exactly as Toolbar places them
 *   (spec:AST-061/DEC-8).
 *
 * SYNC: When modified, update:
 * - /packages/richtext/src/index.ts (exports)
 * - /packages/richtext/src/RichTextEditor.doc.mjs (usage notes)
 * - /packages/richtext/src/RichTextEditor.test.tsx (tests)
 * - /apps/storybook/stories/RichTextEditor.stories.tsx (WithToolbar story)
 *
 * NOTE: `lexical` and `@lexical/*` are OPTIONAL peer dependencies — install them
 * to use this.
 * Behavior mirrors the Lexical playground toolbar (selection sync + format
 * commands); the UI is built from Astryx primitives so it matches the theme.
 *
 * ICONS: Each control resolves its glyph through the core icon registry under a
 * stable `richtext:*` key (see {@link RICHTEXT_ICON_KEYS}) for the active
 * theme, falling back to the bundled inline SVGs below — the library seam
 * `getExtendedIcon` documents. A theme restyles any glyph by naming its key:
 *   defineTheme({icons: {'richtext:bold': <MyBoldIcon />}});
 * Undo and redo point backward and forward in time, so they mirror under RTL
 * whichever glyph draws them.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$setBlocksType} from '@lexical/selection';
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
  type HeadingTagType,
} from '@lexical/rich-text';
import {
  $isListNode,
  ListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from '@lexical/list';
import {$getNearestNodeOfType, mergeRegister} from '@lexical/utils';
import {TOGGLE_LINK_COMMAND, $isLinkNode, $createLinkNode} from '@lexical/link';
import type {BaseProps} from '@astryxdesign/core';
import {Toolbar} from '@astryxdesign/core/Toolbar';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Selector, type SelectorOptionType} from '@astryxdesign/core/Selector';
import {ToggleButton} from '@astryxdesign/core/ToggleButton';
import {Divider} from '@astryxdesign/core/Divider';
import {Popover} from '@astryxdesign/core/Popover';
import {TextInput} from '@astryxdesign/core/TextInput';
import {HStack, StackItem} from '@astryxdesign/core/Layout';
import {Icon, getExtendedIcon} from '@astryxdesign/core/Icon';
import {useThemeName} from '@astryxdesign/core/theme';
import {isImeKeyEvent, isRenderable, rtlStyles} from '@astryxdesign/core/utils';
import {
  fontWeightVars,
  spacingVars,
  typeScaleVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {useTranslator} from '@astryxdesign/core/i18n';
import {
  FORMAT_TEXT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  CAN_UNDO_COMMAND,
  CAN_REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  KEY_DOWN_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_NORMAL,
  IS_APPLE,
  isExactShortcutMatch,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  $setSelection,
  $createParagraphNode,
  $createTextNode,
  type RangeSelection,
} from 'lexical';
import {sanitizeUrl} from './linkUtils';
import {$selectedExtensionNodesOnly} from './markdownExtensionNode';

/** Block types exposed by the toolbar's format selector. */
type BlockType =
  'paragraph' | 'h1' | 'h2' | 'h3' | 'quote' | 'bullet' | 'number';

/**
 * The platform-primary modifier for shortcuts: Cmd on Apple, Ctrl elsewhere.
 * Mirrors the Lexical playground's `CONTROL_OR_META`
 * (packages/lexical-playground/src/plugins/ShortcutsPlugin/shortcuts.ts).
 */
const CONTROL_OR_META = {ctrlKey: !IS_APPLE, metaKey: IS_APPLE};

interface LinkContext {
  selectedText: string;
  url: string;
  isLink: boolean;
}

// The link popover's anchor: a box around the Link button that takes no
// space of its own.
const linkAnchorStyles = stylex.create({
  wrapper: {
    display: 'inline-flex',
    flexShrink: 0,
  },
});

// A vertical Divider's default 100% height needs a definite parent height.
// Toolbar slots are sized by their controls instead, so let flexbox stretch
// these group separators across the slot's resolved height.
const toolbarDividerStyles = stylex.create({
  vertical: {
    alignSelf: 'stretch',
    height: 'auto',
  },
});

const glyphStyles = stylex.create({
  // A transform needs a box: the wrapper is inline-flex so the mirror applies.
  directional: {
    display: 'inline-flex',
  },
  text: {
    fontSize: typeScaleVars['--text-supporting-size'],
    fontWeight: fontWeightVars['--font-weight-bold'],
    fontVariantNumeric: 'tabular-nums',
  },
});

const toolbarScrollStyles = stylex.create({
  // Core Toolbar owns an 8px block inset. This transparent RichText-only
  // surface overlaps 4px of that inset at each block edge, so its controls and
  // following editor body retain a 4px visual gutter.
  compactToolbar: {
    '--astryx-section-padding-inline-start': spacingVars['--spacing-1'],
    '--astryx-section-padding-inline-end': spacingVars['--spacing-1'],
    marginBlockStart: `calc(-1 * ${spacingVars['--spacing-1']})`,
    marginBlockEnd: `calc(-1 * ${spacingVars['--spacing-1']})`,
  },
  // The row scrolls when it runs out of room, so a control keeps its own
  // width. A Selector's field may shrink, which squeezes its label to a
  // sliver, so it sits in a slot that may not.
  fixedSlot: {
    display: 'flex',
    flexShrink: 0,
  },
  actions: {
    flex: '1 1 0%',
    width: 0,
    maxWidth: '100%',
    minWidth: 0,
    overflowX: 'auto',
    overflowY: 'hidden',
    overscrollBehaviorX: 'contain',
    scrollbarWidth: 'thin',
  },
});

/**
 * Whether `event` is the insert-link shortcut (Cmd/Ctrl+K). Uses Lexical's
 * `isExactShortcutMatch`, which — unlike a loose `metaKey || ctrlKey` check —
 * requires exactly the primary modifier and rejects the combo when other
 * modifiers (Shift/Alt) are also held. Matches the playground's `isInsertLink`.
 */
function isInsertLink(event: KeyboardEvent): boolean {
  return isExactShortcutMatch(event, 'k', CONTROL_OR_META);
}

/**
 * Stable icon-registry keys for the toolbar's controls. A theme overrides any
 * of these by key: `defineTheme({icons: {'richtext:bold': <MyIcon />}})`.
 * Keys are namespaced (`richtext:*`) to avoid collisions with the core
 * semantic icon set.
 */
export const RICHTEXT_ICON_KEYS = {
  bold: 'richtext:bold',
  italic: 'richtext:italic',
  underline: 'richtext:underline',
  strikethrough: 'richtext:strikethrough',
  code: 'richtext:code',
  link: 'richtext:link',
  paragraph: 'richtext:paragraph',
  h1: 'richtext:h1',
  h2: 'richtext:h2',
  h3: 'richtext:h3',
  quote: 'richtext:quote',
  bullet: 'richtext:bullet',
  number: 'richtext:number',
  undo: 'richtext:undo',
  redo: 'richtext:redo',
} as const;

const INLINE_FORMAT_ACTIONS = [
  {format: 'bold', icon: 'bold'},
  {format: 'italic', icon: 'italic'},
  {format: 'underline', icon: 'underline'},
  {format: 'strikethrough', icon: 'strikethrough'},
  {format: 'code', icon: 'code'},
] as const;

type InlineFormat = (typeof INLINE_FORMAT_ACTIONS)[number]['format'];

/**
 * Bundled 16px inline default icons — no external icon dependency. These are
 * the fallbacks used when a theme hasn't registered an override for the
 * corresponding {@link RICHTEXT_ICON_KEYS} entry.
 */
const defaultToolbarIcons: Record<string, ReactNode> = {
  bold: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true">
      <path
        d="M6 4h7a4 4 0 0 1 0 8H6zM6 12h8a4 4 0 0 1 0 8H6z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  ),
  italic: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true">
      <path
        d="M10 4h6M8 20h6M14 4l-4 16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
  underline: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true">
      <path
        d="M6 4v6a6 6 0 0 0 12 0V4M5 21h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
  strikethrough: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true">
      <path
        d="M4 12h16M8 6a4 3 0 0 1 8 0M8 16a4 3 0 0 0 8 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
  code: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true">
      <path
        d="M9 8l-4 4 4 4M15 8l4 4-4 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  link: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true">
      <path
        d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  paragraph: <TextGlyph label="¶" />,
  h1: <TextGlyph label="H1" />,
  h2: <TextGlyph label="H2" />,
  h3: <TextGlyph label="H3" />,
  quote: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true">
      <path
        d="M6 17h3l2-4V7H5v6h3zM15 17h3l2-4V7h-6v6h3z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  ),
  bullet: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true">
      <path
        d="M9 6h11M9 12h11M9 18h11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="4.5" cy="6" r="1.5" fill="currentColor" />
      <circle cx="4.5" cy="12" r="1.5" fill="currentColor" />
      <circle cx="4.5" cy="18" r="1.5" fill="currentColor" />
    </svg>
  ),
  number: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true">
      <path
        d="M10 6h10M10 12h10M10 18h10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <text x="2" y="8" fontSize="6" fill="currentColor">
        1
      </text>
      <text x="2" y="14" fontSize="6" fill="currentColor">
        2
      </text>
      <text x="2" y="20" fontSize="6" fill="currentColor">
        3
      </text>
    </svg>
  ),
  undo: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true">
      <path
        d="M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  redo: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true">
      <path
        d="M15 7l5 5-5 5M20 12H9a5 5 0 0 0 0 10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
};

/** Renders a short text label as a toolbar glyph (for heading buttons). */
function TextGlyph({label}: {label: string}) {
  return (
    <span aria-hidden="true" {...stylex.props(glyphStyles.text)}>
      {label}
    </span>
  );
}

type ToolbarIconName = keyof typeof RICHTEXT_ICON_KEYS;

/**
 * Resolve a toolbar glyph for the active theme: the theme's icon for the
 * stable `richtext:*` key, then a globally registered one, then the bundled
 * inline default.
 */
function resolveIcon(
  name: ToolbarIconName,
  themeName: string | null | undefined,
): ReactNode {
  return getExtendedIcon(
    RICHTEXT_ICON_KEYS[name],
    defaultToolbarIcons[name],
    themeName,
  );
}

/** A glyph that points along the reading direction, mirrored under RTL. */
function DirectionalGlyph({children}: {children: ReactNode}) {
  return (
    <span
      aria-hidden="true"
      {...stylex.props(glyphStyles.directional, rtlStyles.mirror)}>
      {children}
    </span>
  );
}

/**
 * Remove's glyph. No shared icon name means "unlink", so it is fixed
 * component artwork until component icon slots exist.
 */
const REMOVE_LINK_GLYPH = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true">
    <path
      d="M18 13l2-2a5 5 0 0 0-7-7l-2 2M6 11l-2 2a5 5 0 0 0 7 7l2-2M8 2v3M2 8h3M16 22v-3M22 16h-3"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Room for a typical address beside the link form's icon buttons. */
const LINK_POPOVER_WIDTH = 320;

interface ToolbarLinkFormProps {
  /** The field's value: the address being entered. */
  url: string;
  /** The message for an address the toolbar refused, or empty. */
  error: string;
  /** Whether the selection is in a link, which Remove then unlinks. */
  isEditing: boolean;
  /** The toolbar's size, so the form's controls match its buttons. */
  size: 'sm' | 'md' | 'lg';
  onUrlChange: (url: string) => void;
  /** Applies the field's address; false when it was refused. */
  onApply: () => boolean;
  onRemove: () => void;
  onCancel: () => void;
}

/**
 * The link popover's content: one URL field, then Apply, Remove (only when
 * the selection is in a link), and Cancel as icon buttons. Enter in the field
 * applies, and Escape anywhere in the form cancels. A refused address shows
 * the field's error status and keeps focus in the field.
 */
function ToolbarLinkForm({
  url,
  error,
  isEditing,
  size,
  onUrlChange,
  onApply,
  onRemove,
  onCancel,
}: ToolbarLinkFormProps) {
  const t = useTranslator();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const apply = () => {
    if (!onApply()) {
      inputRef.current?.focus();
    }
  };
  const applyLabel = isEditing
    ? t('@astryx.richTextEditor.link.update')
    : t('@astryx.richTextEditor.link.add');
  const removeLabel = t('@astryx.richTextEditor.link.remove');
  const cancelLabel = t('@astryx.richTextEditor.link.cancel');
  return (
    <HStack
      gap={1}
      vAlign="start"
      onKeyDown={event => {
        // Escape that ends an IME composition is the input method's.
        if (event.key === 'Escape' && !isImeKeyEvent(event.nativeEvent)) {
          // Claimed here, so the popover's own Escape handling leaves it to
          // Cancel, which also gives the editor back its selection.
          event.preventDefault();
          onCancel();
        }
      }}>
      <StackItem size="fill">
        <TextInput
          ref={inputRef}
          label={t('@astryx.richTextEditor.link.url')}
          isLabelHidden
          value={url}
          size={size}
          width="100%"
          autoComplete="url"
          // A URL keyboard on touch screens and no spelling marks under an
          // address. The field stays plain text, so a bare domain reaches
          // the toolbar's own check, which makes it an https link.
          inputMode="url"
          hasSpellCheck={false}
          placeholder={t('@astryx.richTextEditor.link.urlPlaceholder')}
          status={error ? {type: 'error', message: error} : undefined}
          statusVariant="detached"
          onChange={onUrlChange}
          onEnter={apply}
          onKeyDown={event => {
            // Applying hands focus to the editor, which must not receive the
            // rest of this Enter as a new line over the linked words.
            if (event.key === 'Enter' && !isImeKeyEvent(event.nativeEvent)) {
              event.preventDefault();
            }
          }}
        />
      </StackItem>
      <IconButton
        label={applyLabel}
        icon={<Icon icon="check" />}
        variant="ghost"
        size={size}
        tooltip={applyLabel}
        onClick={apply}
      />
      {isEditing && (
        <IconButton
          label={removeLabel}
          icon={REMOVE_LINK_GLYPH}
          variant="ghost"
          size={size}
          tooltip={removeLabel}
          onClick={onRemove}
        />
      )}
      <IconButton
        label={cancelLabel}
        icon={<Icon icon="close" />}
        variant="ghost"
        size={size}
        tooltip={cancelLabel}
        onClick={onCancel}
      />
    </HStack>
  );
}

export interface RichTextEditorToolbarProps extends BaseProps<HTMLDivElement> {
  /**
   * Ref to the toolbar's root element. Base props pass through to the
   * underlying Astryx `Toolbar`: the ref, `className`, `style`, and `xstyle`
   * reach its root, and `data-*`, other `aria-*` attributes, and DOM
   * handlers reach the `role="toolbar"` element inside it. The toolbar names
   * itself, so pass `label` rather than `aria-label`.
   */
  ref?: Ref<HTMLDivElement>;
  /**
   * Accessible label for the toolbar element.
   * @default 'Text formatting', translated for the active locale
   */
  label?: string;
  /**
   * Which heading levels to expose in the block-format selector, in order.
   * @default ['h1', 'h2', 'h3']
   */
  headingLevels?: ReadonlyArray<'h1' | 'h2' | 'h3'>;
  /**
   * Toolbar size. Cascades to formatting controls and coordinates the
   * Toolbar's internal padding.
   * @default 'sm'
   */
  size?: 'sm' | 'md' | 'lg';
  /**
   * Whether to show the insert/edit-link button. By default, pressing it (or
   * Cmd/Ctrl+K in the editor) opens an Astryx Popover anchored to the button:
   * one URL field, applied with Enter, with Remove when the selection is in a
   * link. The popover is not modal. Escape or Cancel closes it and returns
   * focus and the selection to the editor; a URL that cannot be linked shows
   * an error under the field, which keeps focus. With a collapsed selection,
   * applying inserts the entered URL as link text at the caret; with a
   * non-empty selection it links the selected text.
   *
   * Requires `LinkNode` to be registered (it is, by default) — no extra setup.
   * The entered URL is sanitized (see `sanitizeUrl`) so only
   * http/https/mailto/tel links are written.
   * @default true
   */
  hasLink?: boolean;
  /**
   * Called to obtain a URL when the link button is pressed on a non-link
   * selection. Return the URL string to link, or `null`/`''` to cancel.
   * Receives the currently selected text as a hint. When omitted, the built-in
   * link popover is used. This synchronous override is retained
   * for consumers that already provide their own URL UI.
   */
  promptForUrl?: (selectedText: string) => string | null | undefined;
  /**
   * Whether links created via the toolbar open in a new tab. When `true`
   * (default), the created link carries `target="_blank"` and
   * `rel="noopener noreferrer"` — written into the link node's data (so it
   * serializes and round-trips), not patched onto the DOM. Set `false` to
   * create same-tab links.
   * @default true
   */
  hasNewTabLinks?: boolean;
  /**
   * Extra items rendered at the end of the toolbar (after a divider). Use this
   * to compose product-specific controls (e.g. mentions, AI) alongside the
   * default formatting buttons.
   */
  endContent?: ReactNode;
}

/**
 * A composable formatting toolbar for {@link RichTextEditor}, built from Astryx
 * `Toolbar` / `ToggleButton` primitives so it matches the active theme. Reads
 * the current selection to keep the active states in sync and dispatches the
 * standard Lexical formatting commands.
 *
 * Render it inside the editor's `toolbar` slot — it uses
 * `useLexicalComposerContext()` to reach the editor, so it must live within the
 * `LexicalComposer` the editor sets up.
 *
 * @example
 * ```
 * import {RichTextEditor, RichTextEditorToolbar} from '@astryxdesign/richtext';
 *
 * <RichTextEditor
 *   label="Notes"
 *   toolbar={<RichTextEditorToolbar />}
 * />
 * ```
 */
export function RichTextEditorToolbar({
  label: labelFromProps,
  headingLevels = ['h1', 'h2', 'h3'],
  size = 'sm',
  hasLink = true,
  promptForUrl,
  hasNewTabLinks = true,
  endContent,
  xstyle,
  ref,
  ...rest
}: RichTextEditorToolbarProps) {
  const [editor] = useLexicalComposerContext();
  const themeName = useThemeName();
  const icon = (name: ToolbarIconName) => resolveIcon(name, themeName);
  const t = useTranslator();
  const label = labelFromProps ?? t('@astryx.richTextEditor.toolbar.label');
  // Literal keys, so the catalog gate can verify every one.
  const headingLabels = {
    h1: t('@astryx.richTextEditor.toolbar.heading1'),
    h2: t('@astryx.richTextEditor.toolbar.heading2'),
    h3: t('@astryx.richTextEditor.toolbar.heading3'),
  };
  const inlineFormatLabels: Record<InlineFormat, string> = {
    bold: t('@astryx.richTextEditor.toolbar.bold'),
    italic: t('@astryx.richTextEditor.toolbar.italic'),
    underline: t('@astryx.richTextEditor.toolbar.underline'),
    strikethrough: t('@astryx.richTextEditor.toolbar.strikethrough'),
    code: t('@astryx.richTextEditor.toolbar.inlineCode'),
  };
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
  const [blockType, setBlockType] = useState<BlockType>('paragraph');
  const [isLink, setIsLink] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isEditable, setIsEditable] = useState(() => editor.isEditable());
  const savedSelectionRef = useRef<RangeSelection | null>(null);
  const lastLinkContextRef = useRef<LinkContext>({
    selectedText: '',
    url: '',
    isLink: false,
  });
  const linkButtonRef = useRef<HTMLButtonElement>(null);
  const linkAnchorRef = useRef<HTMLSpanElement>(null);
  const [isLinkPopoverOpen, setIsLinkPopoverOpen] = useState(false);
  const [isEditingLink, setIsEditingLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState('');

  const $syncToolbar = useCallback(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) && !$isNodeSelection(selection)) {
      return;
    }
    const formats = new Set<string>();
    // A selection of Markdown plugin nodes alone — a range around them, or
    // a node selection from a click — shows their formats. Any other node
    // selection, such as a rule, has none.
    const nodesOnly = $selectedExtensionNodesOnly(selection);
    for (const fmt of [
      'bold',
      'italic',
      'underline',
      'strikethrough',
      'code',
    ] as const) {
      if (
        nodesOnly != null
          ? nodesOnly.every(node => node.hasFormat(fmt))
          : $isRangeSelection(selection) && selection.hasFormat(fmt)
      ) {
        formats.add(fmt);
      }
    }
    setActiveFormats(formats);
    if (!$isRangeSelection(selection)) {
      return;
    }

    // Link active state — a link is "active" when the caret/selection anchor
    // sits inside a LinkNode (or its immediate parent is one):
    // `$isLinkNode(parent) || $isLinkNode(node)`.
    const node = selection.anchor.getNode();
    const parent = node.getParent();
    const linkNode = $isLinkNode(node)
      ? node
      : $isLinkNode(parent)
        ? parent
        : null;
    const selectionIsLink = linkNode != null;
    setIsLink(selectionIsLink);
    savedSelectionRef.current = selection.clone();
    lastLinkContextRef.current = {
      selectedText: selection.getTextContent(),
      url: linkNode?.getURL() ?? '',
      isLink: selectionIsLink,
    };
    const anchorNode = selection.anchor.getNode();
    const element =
      anchorNode.getKey() === 'root'
        ? anchorNode
        : anchorNode.getTopLevelElementOrThrow();
    if ($isListNode(element)) {
      const parentList = $getNearestNodeOfType<ListNode>(anchorNode, ListNode);
      const type = parentList
        ? parentList.getListType()
        : element.getListType();
      setBlockType(type === 'number' ? 'number' : 'bullet');
    } else if ($isHeadingNode(element)) {
      setBlockType(element.getTag() as BlockType);
    } else if ($isQuoteNode(element)) {
      setBlockType('quote');
    } else {
      setBlockType('paragraph');
    }
  }, []);

  const readLinkContext = useCallback((): LinkContext => {
    let context = lastLinkContextRef.current;
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        return;
      }
      const node = selection.anchor.getNode();
      const parent = node.getParent();
      const linkNode = $isLinkNode(node)
        ? node
        : $isLinkNode(parent)
          ? parent
          : null;
      savedSelectionRef.current = selection.clone();
      context = {
        selectedText: selection.getTextContent(),
        url: linkNode?.getURL() ?? '',
        isLink: linkNode != null,
      };
      lastLinkContextRef.current = context;
    });
    return context;
  }, [editor]);

  const restoreLinkSelection = useCallback(() => {
    const savedSelection = savedSelectionRef.current;
    if (!savedSelection) {
      return;
    }
    editor.update(() => {
      $setSelection(savedSelection.clone());
    });
  }, [editor]);

  const applyLinkValue = useCallback(
    (entered: string): boolean => {
      const trimmed = entered.trim();
      const url = sanitizeUrl(trimmed);
      if (url === 'about:blank') {
        return false;
      }

      const linkAttributes = hasNewTabLinks
        ? {target: '_blank', rel: 'noopener noreferrer'}
        : {};
      const savedSelection = savedSelectionRef.current;
      // One update restores the selection, decides, and applies. Inside a
      // command listener (Cmd/Ctrl+K) Lexical queues an update, so a flag set
      // in one update cannot steer code that runs after it.
      editor.update(() => {
        if (savedSelection) {
          $setSelection(savedSelection.clone());
        }
        const selection = $getSelection();
        if ($isRangeSelection(selection) && selection.isCollapsed()) {
          const node = selection.anchor.getNode();
          const isInLink = $isLinkNode(node) || $isLinkNode(node.getParent());
          // At a caret outside a link there is no text to link, so the URL
          // becomes the link's text. The toggle command would link the whole
          // text node around the caret instead.
          if (!isInLink) {
            const linkNode = $createLinkNode(url, linkAttributes);
            linkNode.append($createTextNode(trimmed));
            selection.insertNodes([linkNode]);
            return;
          }
        }
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, {url, ...linkAttributes});
      });
      return true;
    },
    [editor, hasNewTabLinks],
  );

  const toggleLink = useCallback(() => {
    if (!editor.isEditable()) {
      return;
    }

    const context = readLinkContext();
    if (promptForUrl) {
      // Preserve the existing synchronous extension point for consumers that
      // already provide their own URL UI.
      if (context.isLink) {
        restoreLinkSelection();
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
        return;
      }
      const entered = promptForUrl(context.selectedText);
      if (entered != null && entered.trim() !== '') {
        applyLinkValue(entered);
      }
      return;
    }

    // The field starts from the link's address, or from selected text that
    // already reads as one; otherwise it is empty and shows its placeholder.
    setLinkUrl(
      context.url ||
        (context.selectedText.startsWith('http') ? context.selectedText : ''),
    );
    setIsEditingLink(context.isLink);
    setLinkError('');
    // Cmd/Ctrl+K can open the form while the Link button is scrolled out of
    // view, in the page or in the toolbar's own row. Bring it back so the
    // popover opens beside it.
    linkButtonRef.current?.scrollIntoView?.({
      block: 'nearest',
      inline: 'nearest',
    });
    setIsLinkPopoverOpen(true);
  }, [
    applyLinkValue,
    editor,
    promptForUrl,
    readLinkContext,
    restoreLinkSelection,
  ]);

  const closeLinkPopover = useCallback(() => {
    setIsLinkPopoverOpen(false);
    setLinkError('');
  }, []);

  // The popover reports its own opening (a press on the Link button) and its
  // closing (a press outside it).
  const handleLinkPopoverOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        toggleLink();
      } else {
        closeLinkPopover();
      }
    },
    [closeLinkPopover, toggleLink],
  );

  // Closes the popover and gives the editor back its focus. The editable root
  // takes focus first and Lexical then draws its selection into it, so the
  // selection survives the field having held the page's selection.
  const closeLinkPopoverToEditor = useCallback(() => {
    closeLinkPopover();
    editor.getRootElement()?.focus({preventScroll: true});
    editor.focus();
  }, [closeLinkPopover, editor]);

  const cancelLinkPopover = useCallback(() => {
    restoreLinkSelection();
    closeLinkPopoverToEditor();
  }, [closeLinkPopoverToEditor, restoreLinkSelection]);

  const applyLink = useCallback((): boolean => {
    if (!applyLinkValue(linkUrl)) {
      setLinkError(t('@astryx.richTextEditor.link.invalidUrl'));
      return false;
    }
    closeLinkPopoverToEditor();
    return true;
  }, [applyLinkValue, closeLinkPopoverToEditor, linkUrl, t]);

  const removeLink = useCallback(() => {
    restoreLinkSelection();
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    closeLinkPopoverToEditor();
  }, [closeLinkPopoverToEditor, editor, restoreLinkSelection]);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({editorState}) => {
        editorState.read($syncToolbar);
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          $syncToolbar();
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        payload => {
          setCanUndo(payload);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        CAN_REDO_COMMAND,
        payload => {
          setCanRedo(payload);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerEditableListener(editable => {
        setIsEditable(editable);
      }),
      // Cmd/Ctrl+K opens link insertion. Detection mirrors the Lexical
      // playground's ShortcutsPlugin (isInsertLink → isExactShortcutMatch with
      // CONTROL_OR_META), so it fires only on the exact primary-modifier combo
      // and ignores Cmd+Shift+K etc. Only registered when the link button is
      // enabled. Returns true to consume the event so the browser's own
      // shortcut doesn't also fire.
      hasLink
        ? editor.registerCommand(
            KEY_DOWN_COMMAND,
            (event: KeyboardEvent) => {
              if (isInsertLink(event)) {
                event.preventDefault();
                toggleLink();
                return true;
              }
              return false;
            },
            COMMAND_PRIORITY_NORMAL,
          )
        : () => {},
    );
  }, [editor, $syncToolbar, hasLink, toggleLink]);

  const toggleInlineFormat = (format: InlineFormat) => {
    // FORMAT_TEXT_COMMAND payload is a TextFormatType; the values we pass are
    // all valid members.
    editor.dispatchCommand(
      FORMAT_TEXT_COMMAND,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      format as any,
    );
  };

  const setBlock = (next: BlockType) => {
    // Selector choices are idempotent: choosing the active block format keeps
    // it active instead of toggling it back to paragraph.
    if (!isEditable || blockType === next) {
      return;
    }
    if (next === 'bullet') {
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
      return;
    }
    if (next === 'number') {
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
      return;
    }
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        return;
      }
      $setBlocksType(selection, () => {
        if (next === 'quote') {
          return $createQuoteNode();
        }
        if (next === 'h1' || next === 'h2' || next === 'h3') {
          return $createHeadingNode(next as HeadingTagType);
        }
        return $createParagraphNode();
      });
    });
  };

  const blockOptions: SelectorOptionType[] = [
    {
      value: 'paragraph',
      label: t('@astryx.richTextEditor.toolbar.paragraph'),
      icon: icon('paragraph'),
    },
    ...headingLevels.map(level => ({
      value: level,
      label: headingLabels[level],
      icon: icon(level),
    })),
    {
      value: 'bullet',
      label: t('@astryx.richTextEditor.toolbar.bulletedList'),
      icon: icon('bullet'),
    },
    {
      value: 'number',
      label: t('@astryx.richTextEditor.toolbar.numberedList'),
      icon: icon('number'),
    },
    {
      value: 'quote',
      label: t('@astryx.richTextEditor.toolbar.blockQuote'),
      icon: icon('quote'),
    },
  ];

  return (
    <>
      <Toolbar
        {...rest}
        ref={ref}
        label={label}
        size={size}
        xstyle={[toolbarScrollStyles.compactToolbar, xstyle]}
        startContent={
          <HStack
            gap={1}
            role="group"
            aria-label={t('@astryx.richTextEditor.toolbar.actions')}
            xstyle={toolbarScrollStyles.actions}>
            <IconButton
              label={t('@astryx.richTextEditor.toolbar.undo')}
              icon={<DirectionalGlyph>{icon('undo')}</DirectionalGlyph>}
              variant="ghost"
              tooltip={t('@astryx.richTextEditor.toolbar.undo')}
              isDisabled={!isEditable || !canUndo}
              onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
            />
            <IconButton
              label={t('@astryx.richTextEditor.toolbar.redo')}
              icon={<DirectionalGlyph>{icon('redo')}</DirectionalGlyph>}
              variant="ghost"
              tooltip={t('@astryx.richTextEditor.toolbar.redo')}
              isDisabled={!isEditable || !canRedo}
              onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
            />
            <Divider
              orientation="vertical"
              aria-label={t('@astryx.richTextEditor.toolbar.historyDivider')}
              xstyle={toolbarDividerStyles.vertical}
            />
            <div {...stylex.props(toolbarScrollStyles.fixedSlot)}>
              <Selector
                label={t('@astryx.richTextEditor.toolbar.blockFormat')}
                isLabelHidden
                variant="ghost"
                size={size}
                value={blockType}
                options={blockOptions}
                startIcon={icon(blockType)}
                isDisabled={!isEditable}
                onChange={value => setBlock(value as BlockType)}
              />
            </div>
            <Divider
              orientation="vertical"
              aria-label={t('@astryx.richTextEditor.toolbar.formatDivider')}
              xstyle={toolbarDividerStyles.vertical}
            />
            {INLINE_FORMAT_ACTIONS.map(action => (
              <ToggleButton
                key={action.format}
                label={inlineFormatLabels[action.format]}
                icon={icon(action.icon)}
                size={size}
                isIconOnly
                isPressed={activeFormats.has(action.format)}
                isDisabled={!isEditable}
                onPressedChange={() => toggleInlineFormat(action.format)}
              />
            ))}
            {hasLink && (
              // The popover anchors to this wrapper, which a press never
              // scales, and finds the button inside it for its handlers.
              <span
                key="link"
                ref={linkAnchorRef}
                {...stylex.props(linkAnchorStyles.wrapper)}>
                <ToggleButton
                  ref={linkButtonRef}
                  label={t('@astryx.richTextEditor.toolbar.link')}
                  icon={icon('link')}
                  size={size}
                  isIconOnly
                  isPressed={isLink || isLinkPopoverOpen}
                  isDisabled={!isEditable}
                  onMouseDown={event => event.preventDefault()}
                  // The link popover owns a press on the button, and with it
                  // the button's popup state; `promptForUrl` replaces both.
                  onPressedChange={promptForUrl ? toggleLink : undefined}
                />
              </span>
            )}
            {isRenderable(endContent) && (
              <>
                <Divider orientation="vertical" />
                {endContent}
              </>
            )}
          </HStack>
        }
      />
      {/* A sibling of the toolbar, not inside it: the toolbar is one roving
          tab stop, which would leave the form's controls out of Tab. */}
      {hasLink && promptForUrl == null && (
        <Popover
          anchorRef={linkAnchorRef as RefObject<HTMLElement>}
          label={
            isEditingLink
              ? t('@astryx.richTextEditor.link.editTitle')
              : t('@astryx.richTextEditor.link.insertTitle')
          }
          isOpen={isLinkPopoverOpen}
          onOpenChange={handleLinkPopoverOpenChange}
          isModal={false}
          // Popover's focus entry focuses the URL field, the form's first
          // control. Cancel is its close control.
          hasCloseButton={false}
          // Above the toolbar, so the popover does not cover the editor's
          // first lines, where the linked words often are. It flips below
          // only when there is no room above.
          placement="above"
          alignment="start"
          width={LINK_POPOVER_WIDTH}
          padding={2}
          content={
            isLinkPopoverOpen ? (
              <ToolbarLinkForm
                url={linkUrl}
                error={linkError}
                isEditing={isEditingLink}
                size={size}
                onUrlChange={value => {
                  setLinkUrl(value);
                  setLinkError('');
                }}
                onApply={applyLink}
                onRemove={removeLink}
                onCancel={cancelLinkPopover}
              />
            ) : null
          }
        />
      )}
    </>
  );
}

RichTextEditorToolbar.displayName = 'RichTextEditorToolbar';
