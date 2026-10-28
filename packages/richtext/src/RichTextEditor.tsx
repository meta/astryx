// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file RichTextEditor.tsx
 * @input Uses React, useId, Lexical (lexical + @lexical/react, composed through
 *   LexicalExtensionComposer), Field, VisuallyHidden, useInputStatusIcon,
 *   mergeProps, design tokens
 * @output Exports an accessibly labelled RichTextEditor component with a flush
 *   top toolbar slot, configurable editable-surface minimum height, and distinct
 *   read-only and disabled states that follow prop changes, RichTextEditorProps,
 *   RichTextEditorStatus, RichTextEditorStatusType, RichTextEditorSize
 * @position @astryxdesign/richtext implementation; consumed by the package index.ts and
 *   re-exported from @astryxdesign/richtext. Tested by RichTextEditor.test.tsx.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/richtext/src/RichTextEditor.doc.mjs (props table, features, implementation notes)
 * - /packages/richtext/src/RichTextEditor.test.tsx (tests for new/changed behavior)
 * - /packages/richtext/src/index.ts (exports if types change)
 * - /apps/storybook/stories/RichTextEditor.stories.tsx (storybook stories)
 *
 * NOTE: `lexical` and `@lexical/*` are OPTIONAL peer dependencies — install them to
 * use this component.
 */

import {
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  typographyVars,
  typeScaleVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {sharedEditorTheme} from './editorTheme';
import {
  Field,
  inputWrapperStyles,
  inputStatusBorderStyles,
  inputStatusHoverShadowStyles,
  inputStatusFocusWithinStyles,
  type FieldStatusVariant,
} from '@astryxdesign/core/Field';
import type {BaseProps} from '@astryxdesign/core';
import {useInputStatusIcon} from '@astryxdesign/core/hooks';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';
import {useTranslator} from '@astryxdesign/core/i18n';
import {mergeProps, themeProps, type SizeValue} from '@astryxdesign/core/utils';
import {useSize} from '@astryxdesign/core/SizeContext';

import {LexicalExtensionComposer} from '@lexical/react/LexicalExtensionComposer';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {RichTextPlugin} from '@lexical/react/LexicalRichTextPlugin';
import {ContentEditable} from '@lexical/react/LexicalContentEditable';
import {LexicalErrorBoundary} from '@lexical/react/LexicalErrorBoundary';
import {HistoryPlugin} from '@lexical/react/LexicalHistoryPlugin';
import {ListPlugin} from '@lexical/react/LexicalListPlugin';
import {LinkPlugin} from '@lexical/react/LexicalLinkPlugin';
import {TabIndentationPlugin} from '@lexical/react/LexicalTabIndentationPlugin';
import {MarkdownShortcutPlugin} from '@lexical/react/LexicalMarkdownShortcutPlugin';
import {OnChangePlugin} from '@lexical/react/LexicalOnChangePlugin';
import {TablePlugin} from '@lexical/react/LexicalTablePlugin';
import {HorizontalRuleExtension} from '@lexical/extension';
import {TextSemanticsExtension} from './textSemantics';
import {TableColumnFloorPlugin} from './TableColumnFloorPlugin';
import {CodeBlockHeaderPlugin} from './CodeBlockHeaderPlugin';
import {CodeSyntaxPlugin} from './CodeSyntaxPlugin';
import {MarkdownExtensionsPlugin} from './MarkdownExtensionsPlugin';
import type {RichTextMarkdownExtension} from './markdownExtensions';
import type {CodeLanguage} from '@astryxdesign/core/CodeBlock';
import {TaskCheckboxPlugin} from './TaskCheckboxPlugin';
import {type Transformer} from '@lexical/markdown';
import {$generateHtmlFromNodes} from '@lexical/html';
import {DEFAULT_NODES} from './editorNodes';
import {$exportMarkdownKeepingSource} from './markdownSource';
import {DEFAULT_TRANSFORMERS} from './markdownTable';
import {
  BLUR_COMMAND,
  COMMAND_PRIORITY_LOW,
  defineExtension,
  KEY_DOWN_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  mergeRegister,
  type AnyLexicalExtension,
  type EditorState,
  type Klass,
  type LexicalEditor,
  type LexicalNode,
  type EditorThemeClasses,
} from 'lexical';

/**
 * Serialized state for an empty editor: a root containing a single empty
 * paragraph. Used by the imperative `clear()` handle.
 *
 * We deliberately reset the editor via `editor.setEditorState(...)` rather than
 * an `editor.update(() => { $getRoot()... })` callback, because `$getRoot` /
 * `$createParagraphNode` are *runtime value* imports from the top-level
 * `lexical` package. In the sandbox's Next build a top-level `lexical` value
 * import forces Babel to transpile lexical's raw `src/*.ts` (which uses
 * `declare` class fields) and fails the build. `parseEditorState` /
 * `setEditorState` are methods on the editor instance, so no top-level
 * `lexical` value import is needed. Setting a fresh state still notifies update
 * listeners, so `onChange` fires.
 */
const EMPTY_EDITOR_STATE_JSON = JSON.stringify({
  root: {
    children: [
      {
        children: [],
        direction: null,
        format: '',
        indent: 0,
        type: 'paragraph',
        version: 1,
      },
    ],
    direction: null,
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
});

const styles = stylex.create({
  wrapper: {
    // Establish a new container boundary so Toolbar's Section does not escape
    // padding inherited from an ancestor Section outside the editor field.
    '--container-padding-inline-start': '0px',
    '--container-padding-inline-end': '0px',
    '--container-padding-block-start': '0px',
    '--container-padding-block-end': '0px',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: spacingVars['--spacing-0'],
    paddingBlock: spacingVars['--spacing-0'],
    paddingInline: spacingVars['--spacing-0'],
    minHeight: 'auto',
  },
  editorBody: {
    position: 'relative',
    boxSizing: 'border-box',
    width: '100%',
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-2'],
  },
  editorBodyWithToolbar: {
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: colorVars['--color-border'],
  },
  editorBodyWithStatus: {
    // Reserve the same trailing space as TextArea: the normal text inset plus
    // room for the 20px status icon and its gap.
    paddingInlineEnd: `calc(${spacingVars['--spacing-2']} + ${spacingVars['--spacing-6']})`,
  },
  contentEditable: {
    display: 'block',
    width: '100%',
    borderWidth: 0,
    borderStyle: 'none',
    padding: 0,
    outline: 'none',
    color: colorVars['--color-text-primary'],
  },
  placeholder: {
    position: 'absolute',
    top: spacingVars['--spacing-0'],
    insetInlineStart: 0,
    pointerEvents: 'none',
    userSelect: 'none',
    color: colorVars['--color-text-secondary'],
  },
  editorRoot: {
    position: 'relative',
    width: '100%',
    // ContentEditable and Lexical's sibling placeholder inherit one shared
    // text style. This keeps their leading and coarse-pointer sizing identical
    // to TextInput/TextArea without duplicating placeholder typography. The
    // 16px floor is iOS-only: iOS Safari zooms the page when a focused
    // control sits under 16px, and only iOS WebKit implements
    // -webkit-touch-callout to key the coarse-pointer floor to it.
    fontFamily: typographyVars['--font-family-body'],
    fontSize: {
      default: typeScaleVars['--text-body-size'],
      '@media (pointer: coarse)': {
        '@supports (-webkit-touch-callout: none)': `max(1rem, ${typeScaleVars['--text-body-size']})`,
      },
    },
    lineHeight: typeScaleVars['--text-body-leading'],
  },
  statusIcon: {
    position: 'absolute',
    top: spacingVars['--spacing-2'],
    insetInlineEnd: spacingVars['--spacing-2'],
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
  },
  disabled: {
    // Per #5335: `default`, not `not-allowed`. A disabled control already
    // carries its own visual treatment, and `not-allowed` is unpaintable on
    // the part of the library sealed behind `pointer-events: none`, so the
    // library cannot promise it consistently.
    cursor: {
      default: 'default',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  counter: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: spacingVars['--spacing-1'],
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-supporting-size'],
    color: colorVars['--color-text-secondary'],
  },
  counterError: {
    color: colorVars['--color-text-error'],
  },
});

const dynamicStyles = stylex.create({
  contentEditableMinHeight: (minHeight: SizeValue) => ({minHeight}),
});

const editorBodySizeStyles = stylex.create({
  // Only `lg` adds block padding; `sm` and `md` take the base body spacing.
  // An empty entry each would read as deliberate size-specific styling.
  lg: {
    paddingBlock: spacingVars['--spacing-2'],
  },
});

/**
 * Fraction of `maxLength` at which the character counter begins announcing
 * remaining/over-limit characters to screen readers. Matches TextArea.
 */
const COUNTER_WARNING_THRESHOLD = 0.8;

export type RichTextEditorStatusType = 'warning' | 'error' | 'success';

export type RichTextEditorSize = 'sm' | 'md' | 'lg';

export interface RichTextEditorStatus {
  /** The type of status to display. */
  type: RichTextEditorStatusType;
  /** Optional message to display below the editor. */
  message?: string;
}

/**
 * Imperative handle exposed via `ref`. Lets callers focus, clear, and read the
 * editor without wiring a custom plugin. Available after mount.
 */
export interface RichTextEditorRef {
  /**
   * Move focus into the editor's editable surface. No-op when the editor is
   * read-only or disabled.
   */
  focus: () => void;
  /**
   * Remove all content, resetting the editor to a single empty paragraph.
   * No-op when the editor is read-only or disabled.
   */
  clear: () => void;
  /** Read the current `EditorState`. Serialize with `.toJSON()` to persist. */
  getEditorState: () => EditorState;
  /**
   * Serialize the current content to a Markdown string, using the same
   * `transformers` the editor is configured with (so custom transformers
   * layered in via the `transformers` prop are honored). Content imported
   * with `markdownToEditorStateJSON` comes back as written: blocks nobody
   * changed byte for byte, and only edited or added blocks in canonical
   * Markdown.
   */
  getMarkdown: () => string;
  /**
   * Serialize the current content to an HTML string via
   * `$generateHtmlFromNodes`. Requires a DOM (available in the browser and in
   * jsdom-based tests). Useful for copy/paste, email, or non-Lexical consumers.
   */
  getHTML: () => string;
  /**
   * Access the underlying `LexicalEditor` instance for advanced use cases
   * (custom commands, listeners, node transforms).
   */
  getEditor: () => LexicalEditor;
}

export interface RichTextEditorProps extends Omit<
  BaseProps,
  'onChange' | 'defaultValue'
> {
  /**
   * Imperative handle for callers that manage the editor from outside. In
   * React 19 `ref` is an ordinary prop, so it is declared here rather than
   * supplied by a `forwardRef` wrapper.
   */
  ref?: Ref<RichTextEditorRef>;
  /** Label text for the editor (always rendered for accessibility). */
  label: string;
  /**
   * Whether to visually hide the label (still accessible to screen readers).
   * @default false
   */
  isLabelHidden?: boolean;
  /** Description text displayed between the label and editor. */
  description?: string;
  /**
   * Whether the field is optional. Mutually exclusive with isRequired.
   * @default false
   */
  isOptional?: boolean;
  /**
   * Whether the field is required. Mutually exclusive with isOptional.
   * @default false
   */
  isRequired?: boolean;
  /**
   * Initial serialized editor state (a JSON string produced by
   * `JSON.stringify(editorState.toJSON())`), used to seed the editor on mount.
   * The editor is uncontrolled: this is read once.
   */
  defaultValue?: string;
  /**
   * Callback fired when the editor content changes. Receives the current
   * `EditorState` and the `LexicalEditor` instance. Serialize with
   * `editorState.toJSON()` for persistence.
   */
  onChange?: (editorState: EditorState, editor: LexicalEditor) => void;
  /** Placeholder text shown when the editor is empty. */
  placeholder?: string;
  /**
   * Whether the editor is read-only (non-editable). The content stays at full
   * opacity, in the tab order, and announced as read-only, so people can still
   * reach, read, and copy it. Takes effect when changed after mount.
   * @default false
   */
  isReadOnly?: boolean;
  /**
   * Whether the editor is disabled: non-editable, dimmed, out of the tab
   * order, and announced as disabled. Wins when `isReadOnly` is also set.
   * Takes effect when changed after mount.
   * @default false
   */
  isDisabled?: boolean;
  /**
   * Status indicator. When set, displays a colored border. If message is
   * provided, displays a message box below the editor.
   */
  status?: RichTextEditorStatus;
  /**
   * How the status message is placed relative to the editor.
   * - 'attached': message overlaps directly below the editor and the status
   *   icon remains inside the editing surface
   * - 'detached': message floats below with its own leading status icon
   * - 'tooltip': no message box; the in-editor status icon becomes a focusable
   *   info-tip button that reveals the message
   * @default 'attached'
   */
  statusVariant?: FieldStatusVariant;
  /**
   * Width of the field. Numbers are treated as pixels, strings are used as-is
   * (e.g. `'100%'`).
   */
  width?: SizeValue;
  /**
   * Minimum height of the editable content surface. Numbers are treated as
   * pixels, strings are used as CSS lengths.
   * @default '4.5rem'
   */
  minHeight?: SizeValue;
  /** Tooltip text to display in an info icon at the end of the label. */
  labelTooltip?: string;
  /**
   * The size of the editor, affecting internal padding.
   * @default 'md'
   */
  size?: RichTextEditorSize;
  /**
   * Additional Lexical nodes to register beyond the default OSS set
   * (Heading, Quote, List, Link, Code). Use this extension point to plug in
   * custom nodes (e.g. mentions, images) without forking the editor.
   */
  nodes?: ReadonlyArray<Klass<LexicalNode>>;
  /**
   * Toolbar content rendered edge-to-edge at the top of the field, before the
   * padded editing surface. Pass `<RichTextEditorToolbar />` here so the
   * toolbar stays inside the Lexical composer while retaining correct visual
   * and keyboard order.
   */
  toolbar?: ReactNode;
  /**
   * Additional Lexical plugins to render inside the composer. Use this to
   * compose extra behaviour (mentions, autolink, etc.) on top of the base
   * editor. Plugins receive the editor via `useLexicalComposerContext()`.
   */
  plugins?: ReactNode;
  /**
   * Whether to enable Markdown shortcut typing (e.g. `# ` for a heading,
   * `- ` for a list). Uses the `transformers` prop (defaults to the standard
   * `@lexical/markdown` transformers plus GFM tables).
   * @default true
   */
  hasMarkdownShortcuts?: boolean;
  /**
   * Markdown transformers — the single source of truth for markdown behaviour.
   * Defaults to the standard `@lexical/markdown` `TRANSFORMERS` plus GFM
   * tables. A custom array replaces the default, tables included.
   *
   * The same array drives all three markdown operations in Lexical (see the
   * lexical-playground reference, where one `PLAYGROUND_TRANSFORMERS` array
   * feeds each):
   *  - shortcut typing        — `registerMarkdownShortcuts` (wired here today)
   *  - markdown -> state       — `$convertFromMarkdownString` (future import API)
   *  - state -> markdown       — `$convertToMarkdownString` (future `getMarkdown`)
   *
   * Pass a custom array to support additional node types (e.g. custom
   * transformers layered in via the `nodes` extension point) consistently
   * across all three. Shortcut typing is only applied when
   * `hasMarkdownShortcuts` is true; the array is still the intended input for
   * the serialization APIs added in later phases.
   */
  transformers?: ReadonlyArray<Transformer>;
  /**
   * Markdown plugins whose nodes this surface draws, each adopted with
   * `createRichTextExtension` (spec:AST-064). A plugin node renders exactly as
   * core `Markdown` renders it, and one whose plugin is not given here shows
   * its source. Pass the extensions the content was converted with. Create
   * them in a client module: they hold the plugins' functions, so they are not
   * serializable props.
   */
  markdownExtensions?: ReadonlyArray<RichTextMarkdownExtension>;
  /**
   * CodeBlock language values a fence may name, each imported on its own,
   * such as `graphql` from `@astryxdesign/core/CodeBlock/languages/graphql`,
   * or made with `createCodeLanguage`. Pass the same list as `Markdown`'s
   * `codeLanguages`, so reading and editing paint and label the same
   * languages (spec:AST-061).
   */
  codeLanguages?: ReadonlyArray<CodeLanguage>;
  /** Whether to automatically focus the editor on mount. @default false */
  hasAutoFocus?: boolean;
  /**
   * Screen-reader hint describing how to move focus out of the editor, since
   * Tab is bound to indentation (press Escape, then Tab). Rendered visually
   * hidden and referenced from the editor's `aria-describedby`. Override it
   * to change the text, or pass an empty string to omit the hint entirely
   * (e.g. when the host app provides its own instructions).
   * @default 'Press Escape then Tab to move focus out of the editor.', translated for the active locale
   */
  tabEscapeHint?: string;
  /**
   * Maximum number of characters. When set, a character counter
   * (current/max) is displayed below the editor. Like TextArea, this does
   * NOT enforce the limit natively — the counter shows error styling when the
   * plain-text length exceeds the limit. Count is the editor's plain-text
   * content length.
   */
  maxLength?: number;
  /**
   * The Lexical composer namespace, used for editor identity.
   * @default 'astryx-editor'
   */
  namespace?: string;
}

/**
 * A WYSIWYG rich-text editor built on Lexical, styled with Astryx design
 * tokens. Ships from `@astryxdesign/richtext`. `lexical` and `@lexical/*` are
 * optional peer dependencies — install them to use this component.
 *
 * The editor is intentionally minimal and extensible: pass `toolbar`, `nodes`,
 * and `plugins` to layer richer behaviour (formatting, mentions, hover cards)
 * on top without forking.
 *
 * The forwarded `RichTextEditorRef` exposes imperative `focus()` and `clear()`
 * methods for callers that manage the editor from outside.
 *
 * @example
 * ```
 * import {RichTextEditor, type RichTextEditorRef} from '@astryxdesign/richtext';
 * const ref = useRef<RichTextEditorRef>(null);
 * <RichTextEditor
 *   ref={ref}
 *   label="Notes"
 *   placeholder="Write something..."
 *   onChange={state => save(JSON.stringify(state.toJSON()))}
 * />
 * ```
 */
export const RichTextEditor = function RichTextEditor({
  label,
  isLabelHidden = false,
  description,
  isOptional = false,
  isRequired = false,
  defaultValue,
  onChange,
  placeholder,
  isReadOnly = false,
  isDisabled = false,
  status,
  statusVariant = 'attached',
  width,
  minHeight = '4.5rem',
  labelTooltip,
  size: sizeProp,
  nodes,
  toolbar,
  plugins,
  hasMarkdownShortcuts = true,
  transformers = DEFAULT_TRANSFORMERS,
  markdownExtensions,
  codeLanguages,
  hasAutoFocus = false,
  tabEscapeHint: tabEscapeHintFromProps,
  maxLength,
  namespace = 'astryx-editor',
  xstyle,
  className,
  style,
  ref,
  ...rest
}: RichTextEditorProps) {
  const size = useSize(sizeProp, 'md');
  const t = useTranslator();
  const tabEscapeHint =
    tabEscapeHintFromProps ?? t('@astryx.richTextEditor.tabEscapeHint');
  const inputID = useId();
  const labelID = useId();
  const descriptionID = useId();
  const statusMessageID = useId();
  const placeholderID = useId();
  const counterID = useId();
  const tabEscapeHintID = useId();

  // Plain-text character count, tracked from inside the composer via
  // CharCountPlugin. Only used when maxLength is set.
  const [charCount, setCharCount] = useState(0);

  // Theme is stable per render; build once.
  const themeRef = useRef<EditorThemeClasses | null>(null);
  if (themeRef.current === null) {
    themeRef.current = sharedEditorTheme();
  }

  const editable = !isReadOnly && !isDisabled;

  // Stabilize the transformers array so MarkdownShortcutPlugin doesn't
  // re-register on every render. `[...transformers]` would allocate a new
  // array each time; memoize on the prop identity instead. (React Compiler
  // isn't running the transform in this repo, so this isn't auto-memoized.)
  const markdownTransformers = useMemo(() => [...transformers], [transformers]);

  // The extension replaces LexicalComposer's `initialConfig`: it carries the
  // same editor configuration (namespace, theme, nodes, editability, initial
  // state) in the shape LexicalBuilder consumes.
  //
  // LexicalExtensionComposer re-creates the editor whenever the extension's
  // identity changes, whereas LexicalComposer read `initialConfig` exactly once
  // on mount. Build it on first render and keep it, so the editor's lifetime —
  // and the content it holds — is unaffected by later renders (a consumer
  // passing an inline `nodes={[...]}` array would otherwise blow away the
  // editor's content on every render).
  const extensionRef = useRef<AnyLexicalExtension | null>(null);
  if (extensionRef.current === null) {
    extensionRef.current = defineExtension({
      name: '@astryxdesign/richtext/RichTextEditor',
      namespace,
      theme: themeRef.current,
      editable,
      nodes: nodes ? [...DEFAULT_NODES, ...nodes] : [...DEFAULT_NODES],
      // Horizontal rules select on click and show their selection; struck
      // text is a deletion.
      dependencies: [HorizontalRuleExtension, TextSemanticsExtension],
      // `undefined` (not `null`) leaves Lexical's default initializer in place,
      // which seeds the empty document with one paragraph — what
      // LexicalComposer did when no `editorState` was given. `null` would mean
      // "start from a genuinely empty root".
      $initialEditorState: defaultValue ?? undefined,
      onError(error: Error) {
        // Surface errors to the host app rather than swallowing them.
        throw error;
      },
    });
  }

  const hasTabEscapeHint = editable && tabEscapeHint !== '';
  const hasToolbar = toolbar != null && typeof toolbar !== 'boolean';

  const {statusIcon, describedBy: statusTooltipDescribedBy} =
    useInputStatusIcon({
      status,
      statusVariant,
    });

  const ariaDescribedBy =
    [
      description ? descriptionID : null,
      statusVariant !== 'tooltip' && status?.message ? statusMessageID : null,
      // Tooltip status renders no FieldStatus message box. Reference the
      // tooltip layer so assistive technology still receives the message.
      statusTooltipDescribedBy,
      placeholder ? placeholderID : null,
      maxLength != null ? counterID : null,
      hasTabEscapeHint ? tabEscapeHintID : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <Field
      label={label}
      isLabelHidden={isLabelHidden}
      description={description}
      inputID={inputID}
      labelID={labelID}
      descriptionID={description ? descriptionID : undefined}
      isOptional={isOptional}
      isRequired={isRequired}
      isDisabled={isDisabled}
      status={
        status
          ? {
              type: status.type,
              message: status.message,
              messageID: status.message ? statusMessageID : undefined,
            }
          : undefined
      }
      statusVariant={statusVariant}
      labelTooltip={labelTooltip}
      width={width}>
      <div
        {...mergeProps(
          themeProps('rich-text-editor', {
            size,
            status: status?.type ?? null,
          }),
          stylex.props(
            inputWrapperStyles.base,
            styles.wrapper,
            // Only disabled is dimmed, matching TextArea: a read-only editor
            // keeps full-opacity text and stays keyboard-reachable.
            isDisabled && inputWrapperStyles.disabled,
            isDisabled && styles.disabled,
            status && inputStatusBorderStyles[status.type],
            status &&
              !isDisabled &&
              !isReadOnly &&
              inputStatusHoverShadowStyles[status.type],
            status && inputStatusFocusWithinStyles[status.type],
            xstyle,
          ),
          className,
          style,
        )}>
        <LexicalExtensionComposer
          extension={extensionRef.current}
          contentEditable={null}>
          {hasToolbar ? toolbar : null}
          <div
            {...stylex.props(
              styles.editorBody,
              hasToolbar && styles.editorBodyWithToolbar,
              !!statusIcon && styles.editorBodyWithStatus,
              size === 'lg' && editorBodySizeStyles.lg,
            )}>
            <div {...stylex.props(styles.editorRoot)}>
              <RichTextPlugin
                contentEditable={
                  <EditorContentEditable
                    id={inputID}
                    ariaLabel={isLabelHidden ? label : undefined}
                    ariaLabelledBy={isLabelHidden ? undefined : labelID}
                    ariaDescribedBy={ariaDescribedBy}
                    ariaRequired={isRequired && !isOptional}
                    ariaInvalid={status?.type === 'error'}
                    isReadOnly={isReadOnly}
                    isDisabled={isDisabled}
                    placeholderText={placeholder}
                    placeholderID={placeholderID}
                    minHeight={minHeight}
                    rest={rest}
                  />
                }
                placeholder={null}
                ErrorBoundary={LexicalErrorBoundary}
              />
              <HistoryPlugin />
              <ListPlugin />
              <TaskCheckboxPlugin isReadOnly={isReadOnly || isDisabled} />
              <LinkPlugin />
              {/* Tab keeps its editor meaning inside a table (indent, and
                  Escape then Tab to leave the editor); arrow keys move
                  between cells. GFM tables have no merged cells or cell
                  colors, and a wide table scrolls inside its own wrapper. */}
              <TablePlugin
                hasCellMerge={false}
                hasCellBackgroundColor={false}
                hasTabHandler={false}
                hasHorizontalScroll
              />
              <TableColumnFloorPlugin />
              <CodeBlockHeaderPlugin codeLanguages={codeLanguages} />
              <CodeSyntaxPlugin codeLanguages={codeLanguages} />
              {markdownExtensions != null && markdownExtensions.length > 0 ? (
                <MarkdownExtensionsPlugin
                  extensions={markdownExtensions}
                  transformers={markdownTransformers}
                />
              ) : null}
              <TabIndentationPlugin />
              <TabFocusEscapePlugin />
              {hasMarkdownShortcuts && (
                <MarkdownShortcutPlugin transformers={markdownTransformers} />
              )}
              {hasAutoFocus && <AutoFocusOnMount />}
              {onChange && (
                <OnChangePlugin
                  onChange={onChange}
                  ignoreHistoryMergeTagChange
                  ignoreSelectionChange
                />
              )}
              {plugins}
              <EditorRefBridge
                editorRef={ref}
                editable={editable}
                transformers={markdownTransformers}
              />
              {maxLength != null && (
                <CharCountPlugin onCountChange={setCharCount} />
              )}
            </div>
            {statusIcon && (
              <div {...stylex.props(styles.statusIcon)}>{statusIcon}</div>
            )}
          </div>
        </LexicalExtensionComposer>
        {hasTabEscapeHint && (
          <VisuallyHidden id={tabEscapeHintID}>{tabEscapeHint}</VisuallyHidden>
        )}
      </div>
      {maxLength != null && (
        <div
          id={counterID}
          {...stylex.props(
            styles.counter,
            charCount > maxLength && styles.counterError,
          )}>
          {charCount}/{maxLength}
          <VisuallyHidden aria-live="polite">
            {charCount >= maxLength * COUNTER_WARNING_THRESHOLD
              ? charCount > maxLength
                ? t('@astryx.textArea.charactersOverLimit', {
                    count: charCount - maxLength,
                  })
                : t('@astryx.textArea.charactersRemaining', {
                    count: maxLength - charCount,
                  })
              : ''}
          </VisuallyHidden>
        </div>
      )}
    </Field>
  );
};

// Keeps the editor inside `@astryx/require-baseprops-passthrough`, which only
// checks components that assign a top-level `displayName`. Without it, a
// dropped `className`, `style` or `xstyle` on the root stops warning.
RichTextEditor.displayName = 'RichTextEditor';

/**
 * Keys that must not cancel an armed Tab escape: Escape (arming again),
 * Tab (the escape itself) and bare modifier presses — the Shift keydown that
 * precedes Shift+Tab must not disarm, or Escape → Shift+Tab could never
 * escape backwards.
 */
const ESCAPE_REARM_EXEMPT_KEYS = new Set([
  'Escape',
  'Tab',
  'Shift',
  'Control',
  'Alt',
  'Meta',
]);

/**
 * WCAG 2.1.2 (No Keyboard Trap) escape for TabIndentationPlugin.
 *
 * TabIndentationPlugin rebinds Tab to indent/outdent, which would otherwise
 * trap keyboard focus inside the editor. This plugin restores an exit: after
 * Escape is pressed, the next Tab (or Shift+Tab) performs native focus
 * movement instead of indenting; pressing any other non-modifier key — or
 * leaving the editor — re-arms indentation.
 *
 * Mechanics: TabIndentationPlugin handles KEY_TAB_COMMAND at
 * COMMAND_PRIORITY_EDITOR (0), the lowest priority, and Lexical runs command
 * listeners from the highest priority down, stopping at the first one that
 * returns true. Registering at COMMAND_PRIORITY_LOW (1) therefore runs first;
 * when the escape is armed we return true WITHOUT calling
 * `event.preventDefault()`, so the indentation handler never sees the event
 * and the browser performs its default Tab focus navigation.
 */
function TabFocusEscapePlugin(): null {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    let escapeArmed = false;
    return mergeRegister(
      editor.registerCommand<KeyboardEvent>(
        KEY_ESCAPE_COMMAND,
        () => {
          escapeArmed = true;
          // Consumed: this supersedes @lexical/rich-text's default Escape
          // handler (COMMAND_PRIORITY_EDITOR), which blurs the editor and
          // drops focus on the document body — disorienting, and it would
          // immediately disarm via BLUR_COMMAND below. Consumer plugins that
          // handle Escape (e.g. to close a popover) register at a higher
          // priority and still run first.
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand<KeyboardEvent>(
        KEY_TAB_COMMAND,
        () => {
          if (!escapeArmed) {
            return false;
          }
          escapeArmed = false;
          // Consume the command (blocks indentation) but leave the event's
          // default alone so focus moves natively.
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand<KeyboardEvent>(
        KEY_DOWN_COMMAND,
        event => {
          if (escapeArmed && !ESCAPE_REARM_EXEMPT_KEYS.has(event.key)) {
            escapeArmed = false;
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          escapeArmed = false;
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor]);
  return null;
}

/**
 * Focuses the editor on mount. Split into its own plugin so it runs inside the
 * composer context.
 */
function AutoFocusOnMount(): null {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editor.focus();
  }, [editor]);
  return null;
}

/**
 * Wires the imperative `RichTextEditorRef` handle. Split into its own plugin so
 * it runs inside the composer context and can reach the `LexicalEditor` via
 * `useLexicalComposerContext()`. Renders nothing.
 *
 * `focus()` and `clear()` are gated on `editable` so a read-only or disabled
 * editor cannot be mutated or focused through the imperative handle — matching
 * the behaviour of the editable surface itself.
 */
function EditorRefBridge({
  editorRef,
  editable,
  transformers,
}: {
  // Optional, matching the public `ref` prop: with `forwardRef` gone, React
  // no longer supplies `null` when the caller passes nothing.
  editorRef: Ref<RichTextEditorRef> | undefined;
  editable: boolean;
  transformers: Array<Transformer>;
}): null {
  const [editor] = useLexicalComposerContext();

  // The extension applies `editable` once, when the composer builds the
  // editor, so a later isReadOnly/isDisabled change would leave
  // contenteditable at its mount value while the wrapper styling and ARIA
  // follow the props. Sync the editor on a prop change only: the mount value
  // is already applied, and this bridge renders after `plugins`, so
  // re-asserting it on mount would undo a plugin that set editability during
  // its own mount.
  const syncedEditableRef = useRef(editable);
  useEffect(() => {
    if (syncedEditableRef.current === editable) {
      return;
    }
    syncedEditableRef.current = editable;
    editor.setEditable(editable);
  }, [editor, editable]);

  useImperativeHandle(
    editorRef,
    () => ({
      focus: () => {
        if (!editable) {
          return;
        }
        editor.focus();
      },
      clear: () => {
        if (!editable) {
          return;
        }
        // Reset to a single empty paragraph via a fresh EditorState. Uses the
        // editor instance's own parse/set methods so we avoid a top-level
        // `lexical` value import (see EMPTY_EDITOR_STATE_JSON). This still
        // notifies update listeners, so `onChange` fires.
        editor.setEditorState(editor.parseEditorState(EMPTY_EDITOR_STATE_JSON));
      },
      getEditorState: () => editor.getEditorState(),
      getMarkdown: () =>
        // Untouched blocks export exactly as imported and changed blocks in
        // canonical form (spec:AST-062). Honors the same transformers the
        // editor uses for shortcuts, so custom transformers round-trip. Reads
        // the state without changing it.
        editor
          .getEditorState()
          .read(() => $exportMarkdownKeepingSource(transformers)),
      getHTML: () =>
        // $generateHtmlFromNodes serializes the whole document (null selection)
        // to HTML; must run in a read context and requires a DOM.
        // `@lexical/html` is a subpackage (built dist) — safe.
        editor
          .getEditorState()
          .read(() => $generateHtmlFromNodes(editor, null)),
      getEditor: () => editor,
    }),
    [editor, editable, transformers],
  );
  return null;
}

/**
 * Tracks the editor's plain-text length and reports it to the host component.
 * Split into its own plugin so it runs inside the composer context and can
 * read the editor state via `useLexicalComposerContext()`. Renders nothing.
 */
function CharCountPlugin({
  onCountChange,
}: {
  onCountChange: (count: number) => void;
}): null {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    // Report the initial count (e.g. seeded via defaultValue) from the mounted
    // root element's text, then track changes via registerTextContentListener,
    // which hands us the plain-text content directly.
    //
    // We deliberately avoid importing `$getRoot` from the top-level `lexical`
    // package: that is a *runtime value* import, and in the sandbox's Next
    // build it forces Babel to transpile lexical's raw `src/*.ts` (which uses
    // `declare` class fields) and fails. Both APIs used here are methods on the
    // editor instance, so no top-level `lexical` value import is needed.
    onCountChange(editor.getRootElement()?.textContent?.length ?? 0);
    return editor.registerTextContentListener(textContent => {
      onCountChange(textContent.length);
    });
  }, [editor, onCountChange]);
  return null;
}

/**
 * Renders the Lexical ContentEditable. Split out so the placeholder
 * discriminated union (`placeholder` + `aria-placeholder` present together, or
 * neither) is satisfied by two concrete branches rather than a spread.
 */
function EditorContentEditable({
  id,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  ariaRequired,
  ariaInvalid,
  isReadOnly,
  isDisabled,
  placeholderText,
  placeholderID,
  minHeight,
  rest,
}: {
  id: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  ariaRequired: boolean;
  ariaInvalid: boolean;
  isReadOnly: boolean;
  isDisabled: boolean;
  placeholderText?: string;
  placeholderID: string;
  minHeight: SizeValue;
  rest: Record<string, unknown>;
}) {
  const shared = {
    id,
    role: 'textbox' as const,
    'aria-multiline': 'true' as const,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    'aria-describedby': ariaDescribedBy,
    'aria-required': ariaRequired ? ('true' as const) : undefined,
    'aria-invalid': ariaInvalid ? ('true' as const) : undefined,
    // Lexical announces every non-editable surface as aria-readonly and
    // leaves it out of the tab order. Split the two states: read-only stays
    // reachable and is announced read-only; disabled is announced disabled
    // instead. These keys land after Lexical's computed attributes, so the
    // disabled branch's explicit `undefined` removes the wrong read-only
    // announcement. With neither prop set no keys are passed, so a plugin
    // that drives editor.setEditable keeps Lexical's own aria-readonly.
    ...(isDisabled
      ? {'aria-disabled': 'true' as const, 'aria-readonly': undefined}
      : isReadOnly
        ? {tabIndex: 0, 'aria-readonly': 'true' as const}
        : null),
    ...stylex.props(
      styles.contentEditable,
      dynamicStyles.contentEditableMinHeight(minHeight),
    ),
    ...rest,
  };
  if (placeholderText) {
    return (
      <ContentEditable
        {...shared}
        aria-placeholder={placeholderText}
        placeholder={() => (
          <div
            id={placeholderID}
            aria-hidden="true"
            {...stylex.props(styles.placeholder)}>
            {placeholderText}
          </div>
        )}
      />
    );
  }
  return <ContentEditable {...shared} />;
}
