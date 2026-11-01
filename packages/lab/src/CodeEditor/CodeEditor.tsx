// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CodeEditor.tsx
 * @input Uses React, StyleX, theme tokens, CSS Custom Highlight API,
 *   VisuallyHidden (core)
 * @output Exports CodeEditor component and CodeEditorProps
 * @position Core implementation; editable code input (lab/experimental)
 *
 * SYNC: When modified, update:
 * - /packages/lab/src/CodeEditor/index.ts (exports if types change)
 * - /packages/lab/src/CodeBlock/tokenizer.ts (shared tokenizer)
 * - /packages/lab/src/CodeBlock/highlightStyles.ts (::highlight rules)
 */

'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useCallback,
  useState,
} from 'react';
import type {BaseProps} from '@astryxdesign/core';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  radiusVars,
  textSizeVars,
  typographyVars,
  typeScaleVars,
  borderVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {mergeProps} from '@astryxdesign/core/utils';
import {
  tokenize,
  tokenizeAsync,
  SYNC_TOKENIZE_THRESHOLD,
} from '@astryxdesign/core/CodeBlock';
import type {TokenLine} from '@astryxdesign/core/CodeBlock';
import {themeProps} from '@astryxdesign/core/utils';
import {
  ensureHighlightStyles,
  applyHighlightRangesFlat,
} from '@astryxdesign/core/CodeBlock';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = stylex.create({
  root: {
    position: 'relative',
    display: 'flex',
    borderRadius: radiusVars['--radius-element'],
    backgroundColor: colorVars['--color-background-muted'],
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
    overflow: 'hidden',
  },
  rootFocused: {
    borderColor: colorVars['--color-accent'],
    boxShadow: `0 0 0 1px ${colorVars['--color-accent']}`,
  },
  gutter: {
    flexShrink: 0,
    paddingBlock: spacingVars['--spacing-3'],
    paddingInlineStart: spacingVars['--spacing-4'],
    paddingInlineEnd: spacingVars['--spacing-3'],
    textAlign: 'end',
    userSelect: 'none',
    color: colorVars['--color-text-disabled'],
    borderInlineEndWidth: borderVars['--border-width'],
    borderInlineEndStyle: 'solid',
    borderInlineEndColor: colorVars['--color-border'],
  },
  gutterLine: {
    fontFamily: typographyVars['--font-family-code'],
    lineHeight: typeScaleVars['--text-code-leading'],
  },
  editorContainer: {
    display: 'flex',
    flex: 1,
    overflow: 'auto',
  },
  editor: {
    display: 'block',
    minHeight: '3em',
    paddingBlock: spacingVars['--spacing-3'],
    paddingInline: spacingVars['--spacing-4'],
    margin: 0,
    fontFamily: typographyVars['--font-family-code'],
    color: colorVars['--color-text-primary'],
    tabSize: 2,
    whiteSpace: 'pre',
    wordBreak: 'normal',
    overflowWrap: 'normal',
    outline: 'none',
    caretColor: colorVars['--color-text-primary'],
    lineHeight: typeScaleVars['--text-code-leading'],
  },
  placeholder: {
    position: 'absolute',
    top: spacingVars['--spacing-3'],
    left: spacingVars['--spacing-4'],
    color: colorVars['--color-text-disabled'],
    fontFamily: typographyVars['--font-family-code'],
    lineHeight: typeScaleVars['--text-code-leading'],
    pointerEvents: 'none',
    userSelect: 'none',
  },
  sizeSm: {
    fontSize: textSizeVars['--font-size-sm'],
  },
  sizeMd: {
    fontSize: textSizeVars['--font-size-base'],
  },
  gutterSm: {
    fontSize: textSizeVars['--font-size-sm'],
  },
  gutterMd: {
    fontSize: textSizeVars['--font-size-base'],
  },
});

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CodeEditorProps extends Omit<
  BaseProps<HTMLDivElement>,
  'onChange'
> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled value */
  value: string;
  /** Change handler */
  onChange: (value: string) => void;
  /** Language for highlighting. @default "plaintext" */
  language?: string;
  /** Label for the code editor — used as the accessible name of the editable region. */
  label: string;
  /** Show line numbers. @default false */
  hasLineNumbers?: boolean;
  /** Read-only mode. @default false */
  isReadOnly?: boolean;
  /** Placeholder when empty */
  placeholder?: string;
  /** Max height before scrolling */
  maxHeight?: number | string;
  /** Text size. @default "md" */
  size?: 'sm' | 'md';
  /** Custom tokenizer */
  tokenizer?: (code: string, language: string) => TokenLine[];
  /**
   * Hint exposed to assistive technology (via aria-describedby) explaining
   * how to move focus out of the editor. English default — the lab package
   * has no i18n catalog yet, so override this prop to localize.
   * @default 'Press Escape then Tab to move focus out of the editor.'
   */
  escapeHint?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasHighlightAPI(): boolean {
  return (
    typeof CSS !== 'undefined' &&
    'highlights' in CSS &&
    typeof Highlight !== 'undefined'
  );
}

const AUTO_CLOSE_PAIRS: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '"': '"',
  "'": "'",
  '`': '`',
};

/**
 * Modifier keys that must NOT re-arm Tab indentation after Escape has armed
 * "tab moves focus" mode — otherwise the Shift keydown that precedes
 * Shift+Tab would cancel the mode before Tab arrives.
 */
const MODE_NEUTRAL_KEYS = new Set([
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'CapsLock',
]);

/** Place a collapsed caret at a character offset within an element's text. */
function setCaretAtTextOffset(el: HTMLElement, offset: number): void {
  const sel = window.getSelection();
  if (!sel) {
    return;
  }
  const range = document.createRange();
  let remaining = offset;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) {
      range.setStart(node, remaining);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    remaining -= length;
    node = walker.nextNode();
  }
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

let editorInstanceCounter = 0;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * An editable code input using contentEditable="plaintext-only".
 *
 * Uses CSS Custom Highlight API for syntax coloring. Supports
 * auto-indent, tab insertion, Shift+Tab outdent, and bracket auto-closing.
 *
 * Because Tab is captured for indentation, pressing Escape arms a one-shot
 * "tab moves focus" mode so keyboard users can leave the editor (WCAG 2.1.2).
 * The escape is advertised to assistive technology via a visually hidden
 * aria-describedby hint (see `escapeHint`).
 *
 * The editor carries an explicit tabindex="0" (including when read-only) so
 * the scrollable container passes axe's scrollable-region-focusable check.
 *
 * @example
 * ```
 * const [code, setCode] = useState('');
 * <CodeEditor
 *   label="Source code"
 *   value={code}
 *   onChange={setCode}
 *   language="typescript"
 *   hasLineNumbers
 * />
 * ```
 */
export function CodeEditor({
  value,
  onChange,
  language = 'plaintext',
  hasLineNumbers = false,
  isReadOnly = false,
  placeholder,
  maxHeight,
  size = 'md',
  tokenizer: customTokenizer,
  label,
  escapeHint = 'Press Escape then Tab to move focus out of the editor.',
  xstyle,
  className,
  style,
  ref,
  ...props
}: CodeEditorProps) {
  const editorRef = useRef<HTMLElement>(null);
  const [instanceId] = useState(() => ++editorInstanceCounter);
  const [focused, setFocused] = useState(false);
  const isComposingRef = useRef(false);
  // One-shot "tab moves focus" mode, armed by Escape (WCAG 2.1.2 — the
  // standard escape from a code editor's Tab-to-indent keyboard trap).
  const tabMovesFocusRef = useRef(false);
  const hintId = useId();

  const lines = value.split('\n');

  // Sync textContent with controlled value
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) {
      return;
    }
    if (el.textContent !== value) {
      el.textContent = value;
    }
  }, [value]);

  // Ensure styles are always injected
  useLayoutEffect(() => {
    ensureHighlightStyles();
  }, []);

  // Apply CSS Custom Highlight API ranges — small code
  useLayoutEffect(() => {
    if (value.length >= SYNC_TOKENIZE_THRESHOLD) {
      return;
    }
    if (!hasHighlightAPI()) {
      return;
    }

    const el = editorRef.current;
    if (!el) {
      return;
    }

    const tok = customTokenizer ?? tokenize;
    const tokens = tok(value, language);
    if (tokens.length === 0) {
      return;
    }

    return applyHighlightRangesFlat(el, tokens);
  }, [value, language, customTokenizer, instanceId]);

  // Apply CSS Custom Highlight API ranges — large code (async)
  useEffect(() => {
    if (value.length < SYNC_TOKENIZE_THRESHOLD) {
      return;
    }
    if (!hasHighlightAPI()) {
      return;
    }

    const el = editorRef.current;
    if (!el) {
      return;
    }

    const abortController = new AbortController();
    let cleanup: (() => void) | undefined;

    tokenizeAsync(value, language, abortController.signal).then(tokens => {
      if (abortController.signal.aborted) {
        return;
      }
      if (tokens.length === 0) {
        return;
      }
      cleanup = applyHighlightRangesFlat(el, tokens);
    });

    return () => {
      abortController.abort();
      cleanup?.();
    };
  }, [value, language, customTokenizer, instanceId]);

  const handleInput = useCallback(() => {
    if (isComposingRef.current) {
      return;
    }
    const el = editorRef.current;
    if (!el) {
      return;
    }
    const newValue = el.textContent ?? '';
    onChange(newValue);
  }, [onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (isReadOnly) {
        return;
      }

      // Escape arms one-shot "tab moves focus" mode so keyboard users can
      // leave the editor. Only engage when nothing inside the editor (e.g.
      // an embedded popover/autocomplete) already consumed the Escape.
      if (e.key === 'Escape') {
        if (!e.defaultPrevented) {
          tabMovesFocusRef.current = true;
        }
        return;
      }

      if (e.key === 'Tab') {
        // Tab-moves-focus mode: let the browser handle Tab / Shift+Tab
        // natively so focus leaves the editor. One-shot — disarm.
        if (tabMovesFocusRef.current) {
          tabMovesFocusRef.current = false;
          return;
        }

        e.preventDefault();
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) {
          return;
        }
        const el = editorRef.current;
        if (!el) {
          return;
        }

        // Shift+Tab: outdent — remove up to two leading spaces on the
        // current line.
        if (e.shiftKey) {
          const range = sel.getRangeAt(0);
          const preCaretRange = range.cloneRange();
          preCaretRange.selectNodeContents(el);
          preCaretRange.setEnd(range.startContainer, range.startOffset);
          const cursorOffset = preCaretRange.toString().length;

          const fullText = el.textContent ?? '';
          const lineStart = fullText.lastIndexOf('\n', cursorOffset - 1) + 1;
          const line = fullText.slice(lineStart);
          const removeCount = line.startsWith('  ')
            ? 2
            : line.startsWith(' ')
              ? 1
              : 0;
          if (removeCount === 0) {
            return;
          }
          const newText =
            fullText.slice(0, lineStart) +
            fullText.slice(lineStart + removeCount);
          el.textContent = newText;
          const removedBeforeCursor = Math.min(
            removeCount,
            Math.max(0, cursorOffset - lineStart),
          );
          setCaretAtTextOffset(el, cursorOffset - removedBeforeCursor);
          onChange(newText);
          return;
        }

        // Tab: insert 2 spaces
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode('  ');
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        sel.removeAllRanges();
        sel.addRange(range);
        onChange(el.textContent ?? '');
        return;
      }

      // Any other non-modifier key re-arms Tab indentation. Modifiers are
      // excluded so Escape → Shift+Tab still moves focus backward (the
      // Shift keydown fires before the Tab keydown).
      if (!MODE_NEUTRAL_KEYS.has(e.key)) {
        tabMovesFocusRef.current = false;
      }

      // Enter key: preserve indentation
      if (e.key === 'Enter') {
        e.preventDefault();
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) {
          return;
        }

        const el = editorRef.current;
        if (!el) {
          return;
        }
        const fullText = el.textContent ?? '';

        // Find cursor offset
        const range = sel.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(el);
        preCaretRange.setEnd(range.startContainer, range.startOffset);
        const cursorOffset = preCaretRange.toString().length;

        // Find current line and its indentation
        const beforeCursor = fullText.slice(0, cursorOffset);
        const lastNewline = beforeCursor.lastIndexOf('\n');
        const currentLine = beforeCursor.slice(lastNewline + 1);
        const indent = currentLine.match(/^(\s*)/)?.[1] ?? '';

        // Insert newline + indent
        const insertText = '\n' + indent;
        range.deleteContents();
        const textNode = document.createTextNode(insertText);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        sel.removeAllRanges();
        sel.addRange(range);
        onChange(el.textContent ?? '');
        return;
      }

      // Auto-close brackets and quotes
      const closeChar = AUTO_CLOSE_PAIRS[e.key];
      if (closeChar) {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) {
          return;
        }
        const range = sel.getRangeAt(0);

        // Only auto-close if no text is selected
        if (!range.collapsed) {
          return;
        }

        e.preventDefault();
        const textNode = document.createTextNode(e.key + closeChar);
        range.deleteContents();
        range.insertNode(textNode);
        // Place cursor between the pair
        range.setStart(textNode, 1);
        range.setEnd(textNode, 1);
        sel.removeAllRanges();
        sel.addRange(range);
        const el = editorRef.current;
        if (el) {
          onChange(el.textContent ?? '');
        }
      }
    },
    [isReadOnly, onChange],
  );

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
    handleInput();
  }, [handleInput]);

  const sizeStyle = size === 'sm' ? styles.sizeSm : styles.sizeMd;
  const gutterSizeStyle = size === 'sm' ? styles.gutterSm : styles.gutterMd;
  const showPlaceholder = placeholder && value === '';

  const containerStyle: React.CSSProperties | undefined = maxHeight
    ? {maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight}
    : undefined;

  return (
    <div
      ref={ref}
      {...mergeProps(
        themeProps('codeeditor', {size, language}),
        stylex.props(styles.root, focused && styles.rootFocused, xstyle),
        className,
        style,
      )}
      {...props}>
      <div {...stylex.props(styles.editorContainer)} style={containerStyle}>
        {hasLineNumbers && (
          <div
            {...stylex.props(styles.gutter, gutterSizeStyle)}
            aria-hidden="true">
            {lines.map((_, i) => (
              <div key={i} {...stylex.props(styles.gutterLine)}>
                {i + 1}
              </div>
            ))}
          </div>
        )}
        <div style={{position: 'relative', flex: 1}}>
          {showPlaceholder && (
            <div {...stylex.props(styles.placeholder, sizeStyle)}>
              {placeholder}
            </div>
          )}
          <code
            ref={editorRef}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            contentEditable={isReadOnly ? false : ('plaintext-only' as any)}
            // Explicit tabindex: editing hosts have an effective tabIndex of 0
            // already, but axe reads the attribute, and contenteditable is not
            // on its natively-focusable whitelist — without it a maxHeight
            // editor fails scrollable-region-focusable. Also keeps read-only
            // editors keyboard-focusable, like a readonly textarea.
            tabIndex={0}
            role="textbox"
            aria-multiline="true"
            aria-label={label}
            aria-readonly={isReadOnly}
            aria-describedby={isReadOnly ? undefined : hintId}
            spellCheck={false}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              tabMovesFocusRef.current = false;
            }}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            {...stylex.props(styles.editor, sizeStyle)}
          />
          {!isReadOnly && (
            <VisuallyHidden id={hintId}>{escapeHint}</VisuallyHidden>
          )}
        </div>
      </div>
    </div>
  );
}

CodeEditor.displayName = 'CodeEditor';
