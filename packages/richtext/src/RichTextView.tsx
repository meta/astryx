// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file RichTextView.tsx
 * @input Uses React, Lexical (lexical + @lexical/react, composed through
 *   LexicalExtensionComposer), mergeProps from core utils, design tokens,
 *   TableScrollRegionPlugin
 * @output Exports RichTextView component and RichTextViewProps
 * @position Read-only renderer for serialized Lexical editor state, exposed to
 *   assistive technology as document content rather than a form field;
 *   exported from @astryxdesign/richtext
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/richtext/src/RichTextEditor.test.tsx
 * - /packages/richtext/src/index.ts
 * - /apps/storybook/stories/RichTextEditor.stories.tsx
 */

import {useEffect, useRef, useState, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {sharedEditorTheme} from './editorTheme';
import type {BaseProps} from '@astryxdesign/core';
import {mergeProps} from '@astryxdesign/core/utils';
import {
  colorVars,
  typeScaleVars,
  typographyVars,
} from '@astryxdesign/core/theme/tokens.stylex';

import {LexicalExtensionComposer} from '@lexical/react/LexicalExtensionComposer';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {RichTextPlugin} from '@lexical/react/LexicalRichTextPlugin';
import {ContentEditable} from '@lexical/react/LexicalContentEditable';
import {LexicalErrorBoundary} from '@lexical/react/LexicalErrorBoundary';
import {TablePlugin} from '@lexical/react/LexicalTablePlugin';
import {TableScrollRegionPlugin} from './TableScrollRegionPlugin';
import {TableColumnFloorPlugin} from './TableColumnFloorPlugin';
import {CodeBlockHeaderPlugin} from './CodeBlockHeaderPlugin';
import {CodeSyntaxPlugin} from './CodeSyntaxPlugin';
import {MarkdownExtensionsPlugin} from './MarkdownExtensionsPlugin';
import type {RichTextMarkdownExtension} from './markdownExtensions';
import type {CodeLanguage} from '@astryxdesign/core/CodeBlock';
import {TaskCheckboxPlugin} from './TaskCheckboxPlugin';
import type {
  AnyLexicalExtension,
  Klass,
  LexicalNode,
  EditorThemeClasses,
} from 'lexical';
import {defineExtension} from 'lexical';
import {TextSemanticsExtension} from './textSemantics';
// The same node set as the editor, so anything it writes renders here.
import {DEFAULT_NODES} from './editorNodes';

const styles = stylex.create({
  root: {
    width: '100%',
    // Holds the code block headers and task checkboxes drawn over the
    // content.
    position: 'relative',
    // The document's body text, as core Markdown and the editor set it
    // (spec:AST-061 FR2). Without it, blocks the theme leaves unsized —
    // list items, quotes, table cells — take the host page's font.
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-body-size'],
    lineHeight: typeScaleVars['--text-body-leading'],
    color: colorVars['--color-text-primary'],
  },
});

/**
 * Lexical's `ContentEditable` renders `role="textbox"` and widget-only ARIA
 * (`aria-autocomplete`, `aria-readonly`) even when the editor is not editable.
 * A view renders document content, not a form field, so all three are cleared:
 *
 * - A textbox is a widget, so an unnamed one fails axe
 *   `aria-input-field-name` — and a view has no name to give, because it is
 *   content rather than a labelled input.
 * - The widget role exposes the rendered document to assistive technology
 *   as a form field rather than as the content it is.
 * - Widget-only ARIA is invalid without a widget role, so clearing only the
 *   role would trade `aria-input-field-name` for `aria-allowed-attr`.
 *
 * `role` must be `null`, not `undefined`: Lexical substitutes its `textbox`
 * default for `undefined`. The ARIA keys reach the element through Lexical's
 * trailing prop spread, which is why `undefined` clears them. A proposed
 * upstream fix (facebook/lexical#9270) would make these overrides no-ops.
 *
 * A caller who wants read-only form-field semantics instead wants
 * `<RichTextEditor isReadOnly />`, which is a labelled field by construction.
 */
const VIEW_CONTENT_EDITABLE_PROPS = {
  'aria-autocomplete': undefined,
  'aria-readonly': undefined,
  role: null as unknown as undefined,
} as const;

/** The view imports and exports no Markdown, so it uses no transformers. */
const NO_TRANSFORMERS: ReadonlyArray<never> = [];

export interface RichTextViewProps extends BaseProps {
  /**
   * Serialized editor state to render (a JSON string produced by
   * `JSON.stringify(editorState.toJSON())`).
   */
  value: string;
  /**
   * Additional Lexical nodes to register beyond the default OSS set. Must match
   * the nodes used to author `value` so custom node types deserialize.
   */
  nodes?: ReadonlyArray<Klass<LexicalNode>>;
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
  /**
   * Additional read-only plugins to render inside the composer (e.g. hover
   * cards, decorators).
   */
  plugins?: ReactNode;
  /** The Lexical composer namespace. @default 'astryx-view' */
  namespace?: string;
  /**
   * Called when `value` cannot be parsed/rendered (e.g. malformed JSON, or
   * state authored with node types not registered via `nodes`). A read-only
   * view renders *persisted* content — exactly where stale or foreign-schema
   * state shows up — so by default a parse failure renders `errorFallback`
   * instead of throwing and taking down the host. Provide `onParseError` to log or
   * report it.
   */
  onParseError?: (error: Error) => void;
  /**
   * What to render when `value` fails to parse/render. Defaults to `null`
   * (renders nothing). Pass a node to show a placeholder/empty state.
   * @default null
   */
  errorFallback?: ReactNode;
}

/**
 * Keeps the rendered content in sync with the `value` prop after mount.
 *
 * The editor's initial state is seeded once, when the composer mounts, so a
 * plain `<RichTextView value={changingValue} />` would freeze at its first
 * value — the content would never update when `value` changed. This plugin runs
 * inside the composer context and re-applies `value` whenever it changes, so the
 * read-only view stays reactive (e.g. previewing content edited elsewhere).
 *
 * The initial `value` is already applied via the extension's
 * `$initialEditorState`, so we skip the first run to avoid a redundant re-parse
 * on mount.
 *
 * This mirrors the canonical Lexical pattern for applying externally-sourced
 * serialized state after mount: the Lexical Playground's ActionsPlugin does the
 * same `editor.setEditorState(editor.parseEditorState(...))` from inside a
 * plugin (see facebook/lexical
 * packages/lexical-playground/src/plugins/ActionsPlugin/index.tsx). It is
 * necessary because the composer builds the editor once and reads the initial
 * state exactly once at that point, so a changed prop cannot re-seed the editor
 * on its own. A read-only view has no history, so we skip the Playground's
 * accompanying CLEAR_HISTORY_COMMAND.
 *
 * `parseEditorState` / `setEditorState` are methods on the editor instance, so
 * this plugin needs no module-level Lexical imports of its own.
 */
function SyncValuePlugin({value}: {value: string}): null {
  const [editor] = useLexicalComposerContext();
  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    editor.setEditorState(editor.parseEditorState(value));
  }, [editor, value]);
  return null;
}

/**
 * A read-only renderer for serialized Lexical content. Renders the same styled
 * output as {@link RichTextEditor} without any editing affordances.
 *
 * The output is document content, not a form field: headings, lists and links
 * keep their own roles for assistive technology, and the view takes no label.
 * For a labelled, read-only field, use `<RichTextEditor isReadOnly />`. A
 * table wider than the view scrolls inside a region named "Table" that takes a
 * tab stop while it overflows, as core `Table` does.
 *
 * @example
 * ```
 * import {RichTextView} from '@astryxdesign/richtext';
 * <RichTextView value={storedEditorStateJSON} />
 * ```
 */
export function RichTextView({
  value,
  nodes,
  markdownExtensions,
  codeLanguages,
  plugins,
  namespace = 'astryx-view',
  onParseError,
  errorFallback = null,
  xstyle,
  className,
  style,
  ...rest
}: RichTextViewProps) {
  const themeRef = useRef<EditorThemeClasses | null>(null);
  if (themeRef.current === null) {
    themeRef.current = sharedEditorTheme();
  }

  // Built on first render (and again after an error, below) rather than per
  // render: LexicalExtensionComposer re-creates the editor whenever the
  // extension's identity changes, and `value` updates are applied in place by
  // SyncValuePlugin instead.
  const extensionRef = useRef<AnyLexicalExtension | null>(null);

  const [hasError, setHasError] = useState(false);

  // Reset the error state when the value changes so a corrected value recovers.
  const lastValueRef = useRef(value);
  if (lastValueRef.current !== value && hasError) {
    lastValueRef.current = value;
    setHasError(false);
  } else {
    lastValueRef.current = value;
  }

  // A parse failure is recorded during render (below, or from Lexical's
  // `onError` while the composer builds the editor) but reported to the
  // consumer only after commit. Updating this component's own state during
  // render is allowed; running a consumer's callback is not — a callback that
  // updates its own component would do so during another component's render,
  // and StrictMode or a discarded concurrent render would repeat it or run it
  // for output that never commits. This Effect synchronizes the consumer's
  // `onParseError`, reporting each distinct failure exactly once.
  const pendingErrorRef = useRef<Error | null>(null);
  const reportedErrorRef = useRef<Error | null>(null);
  useEffect(() => {
    const error = pendingErrorRef.current;
    if (error !== null && error !== reportedErrorRef.current) {
      reportedErrorRef.current = error;
      onParseError?.(error);
    }
  });

  const handleError = (error: Error) => {
    pendingErrorRef.current = error;
    setHasError(true);
  };

  // Validate `value` parses as JSON before handing it to Lexical. Malformed
  // JSON would otherwise throw synchronously while the composer builds the
  // editor and escape any error boundary, taking down the host on the render
  // path.
  if (!hasError) {
    try {
      JSON.parse(value);
    } catch (err) {
      handleError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  if (hasError) {
    // The composer subtree is unmounted while the fallback renders. Drop the
    // extension so that recovering from the error builds a fresh one, seeded
    // with the corrected `value`.
    extensionRef.current = null;
    return (
      <div
        {...mergeProps(stylex.props(styles.root, xstyle), className, style)}
        {...rest}>
        {errorFallback}
      </div>
    );
  }

  if (extensionRef.current === null) {
    extensionRef.current = defineExtension({
      name: '@astryxdesign/richtext/RichTextView',
      namespace,
      theme: themeRef.current,
      editable: false,
      nodes: nodes ? [...DEFAULT_NODES, ...nodes] : [...DEFAULT_NODES],
      // Struck text is a deletion.
      dependencies: [TextSemanticsExtension],
      $initialEditorState: value,
      // A read-only view renders persisted content; a bad node/schema should not
      // crash the host. Surface it via onParseError + fallback instead of re-throwing.
      onError: handleError,
    });
  }

  return (
    <div
      {...mergeProps(stylex.props(styles.root, xstyle), className, style)}
      {...rest}>
      <LexicalExtensionComposer
        extension={extensionRef.current}
        contentEditable={null}>
        <SyncValuePlugin value={value} />
        {/* Same table configuration as the editor, so a wide table scrolls
            inside its own wrapper instead of widening the page. */}
        <TablePlugin
          hasCellMerge={false}
          hasCellBackgroundColor={false}
          hasTabHandler={false}
          hasHorizontalScroll
        />
        <TableScrollRegionPlugin />
        <TableColumnFloorPlugin />
        <RichTextPlugin
          contentEditable={<ContentEditable {...VIEW_CONTENT_EDITABLE_PROPS} />}
          placeholder={null}
          ErrorBoundary={LexicalErrorBoundary}
        />
        {/* After the content, so the copy buttons and checkboxes follow it
            in tab order. */}
        <CodeBlockHeaderPlugin codeLanguages={codeLanguages} />
        <CodeSyntaxPlugin codeLanguages={codeLanguages} />
        {markdownExtensions != null && markdownExtensions.length > 0 ? (
          <MarkdownExtensionsPlugin
            extensions={markdownExtensions}
            transformers={NO_TRANSFORMERS}
          />
        ) : null}
        <TaskCheckboxPlugin isReadOnly />
        {plugins}
      </LexicalExtensionComposer>
    </div>
  );
}

RichTextView.displayName = 'RichTextView';
