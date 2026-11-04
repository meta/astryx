// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useChatComposerTokens.ts
 * @input Uses React refs, state, DOM APIs
 * @output Exports useChatComposerTokens hook for inline token management
 * @position Utility hook — extracted from ChatComposerInput
 *
 * Manages inline token chips in a contentEditable element:
 * - Insert tokens (badge or custom render) at cursor position
 * - Backspace handling near tokens (removes token + trailing NBSP)
 * - Paste handling near tokens (prevents broken state)
 * - Portal tracking for React rendering inside DOM-created spans
 * - Serialization awareness (data-astryx-token attributes)
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Chat/index.ts (exports)
 * - /packages/core/src/Chat/ChatComposerInput.tsx (consumer)
 */

import {useCallback, useState} from 'react';
import {ensureCaretInside, insertTextAtCursor} from './chatComposerSelection';
import type {
  ChatComposerToken,
  ChatComposerTokenCustom,
} from './ChatComposerInput';

// =============================================================================
// Types
// =============================================================================

export interface TokenPortal {
  id: string;
  span: HTMLSpanElement;
  token: ChatComposerToken;
}

export interface UseChatComposerTokensOptions {
  /** Ref to the contentEditable element. */
  editableRef: React.RefObject<HTMLDivElement | null>;
  /** Called after token insertion/removal to sync state. */
  onEmitChange: () => void;
}

export interface UseChatComposerTokensReturn {
  /** Active token portals — render via createPortal in the component. */
  tokenPortals: TokenPortal[];
  /** Expand a token — replace the token span with its text value. */
  expandToken: (id: string) => void;
  /** Insert a token at the current cursor position. */
  insertToken: (token: ChatComposerToken) => string | undefined;
  /** Handle keydown — intercepts Backspace near tokens. Returns true if handled. */
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
  /** Handle paste — prevents pasting into token spans. Returns true if handled. */
  handlePaste: (e: React.ClipboardEvent) => boolean;
  /** Clean up orphaned portals (call after content changes). */
  cleanupPortals: () => void;
}

// =============================================================================
// Helpers
// =============================================================================

/** Type guard: does this token use the custom render path? */
export function isCustomToken(
  token: ChatComposerToken,
): token is ChatComposerTokenCustom {
  return 'render' in token && typeof token.render === 'function';
}

/** Check if a node is inside or is a token span. */
function isInsideToken(node: Node): HTMLElement | null {
  let current: Node | null = node;
  while (current) {
    if (
      current instanceof HTMLElement &&
      current.hasAttribute('data-astryx-token')
    ) {
      return current;
    }
    current = current.parentNode;
  }
  return null;
}

// =============================================================================
// Hook
// =============================================================================

export function useChatComposerTokens({
  editableRef,
  onEmitChange,
}: UseChatComposerTokensOptions): UseChatComposerTokensReturn {
  const [tokenPortals, setTokenPortals] = useState<TokenPortal[]>([]);

  // --- Insert token at cursor ---
  const insertToken = useCallback(
    (token: ChatComposerToken): string | undefined => {
      const editable = editableRef.current;
      if (!editable) {
        return;
      }

      // Place a caret at the end of the editable if there's no Range
      // inside it (programmatic focus does not create one).
      const selection = ensureCaretInside(editable);
      if (!selection || selection.rangeCount === 0) {
        return;
      }

      const range = selection.getRangeAt(0);

      // Create a non-editable container — React will portal the Badge into it
      const span = document.createElement('span');
      const id = `token-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      span.setAttribute('data-astryx-token', '');
      span.setAttribute('data-astryx-token-value', token.value);
      span.setAttribute('data-astryx-token-id', id);
      span.contentEditable = 'false';
      span.style.display = 'inline-flex';
      span.style.alignItems = 'center';
      span.style.height = '1lh';
      span.style.verticalAlign = 'top';

      range.deleteContents();
      range.insertNode(span);

      // Add a non-breaking space after the token and move cursor there
      const space = document.createTextNode('\u00A0');
      span.after(space);

      const newRange = document.createRange();
      newRange.setStartAfter(space);
      newRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(newRange);

      // Register for portal rendering
      setTokenPortals(prev => [...prev, {id, span, token}]);
      return id;
    },
    [editableRef],
  );

  // --- Backspace near tokens ---
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (e.key !== 'Backspace') {
        return false;
      }

      const selection = window.getSelection();
      if (!selection || !selection.isCollapsed || selection.rangeCount === 0) {
        return false;
      }

      const range = selection.getRangeAt(0);
      const {startContainer, startOffset} = range;

      // Case 1: Cursor at start of text node right after a token —
      // let the browser handle it (it will select/delete the token)
      if (
        startContainer.nodeType === Node.TEXT_NODE &&
        startOffset === 0 &&
        startContainer.previousSibling instanceof HTMLElement &&
        startContainer.previousSibling.hasAttribute('data-astryx-token')
      ) {
        return false;
      }

      // Case 2: Cursor in or after the trailing NBSP — remove both
      // the NBSP and the token in one action
      if (
        startContainer.nodeType === Node.TEXT_NODE &&
        startContainer.textContent === '\u00A0' &&
        startOffset <= 1 &&
        startContainer.previousSibling instanceof HTMLElement &&
        startContainer.previousSibling.hasAttribute('data-astryx-token')
      ) {
        e.preventDefault();
        const tokenSpan = startContainer.previousSibling;
        const parent = startContainer.parentNode;
        if (parent) {
          parent.removeChild(startContainer);
          parent.removeChild(tokenSpan);
        }
        onEmitChange();
        return true;
      }

      return false;
    },
    [onEmitChange],
  );

  // --- Paste near tokens ---
  const handlePaste = useCallback(
    (e: React.ClipboardEvent): boolean => {
      const editable = editableRef.current;
      if (!editable) {
        return false;
      }

      const selection = ensureCaretInside(editable);
      if (!selection || selection.rangeCount === 0) {
        return false;
      }

      const range = selection.getRangeAt(0);

      // If selection overlaps a token, collapse to after the token
      // and insert there instead of breaking the token
      const tokenEl = isInsideToken(range.startContainer);
      if (tokenEl) {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');

        // Move cursor after the token's trailing space
        const space = tokenEl.nextSibling;
        const newRange = document.createRange();
        if (space && space.nodeType === Node.TEXT_NODE) {
          newRange.setStartAfter(space);
        } else {
          newRange.setStartAfter(tokenEl);
        }
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);

        insertTextAtCursor(editable, text);
        onEmitChange();
        return true;
      }

      return false;
    },
    [editableRef, onEmitChange],
  );

  // --- Expand token (replace with text) ---
  const expandToken = useCallback(
    (id: string) => {
      const editable = editableRef.current;
      if (!editable) {
        return;
      }

      const portal = tokenPortals.find(p => p.id === id);
      if (!portal) {
        return;
      }

      const {span} = portal;
      const value = span.getAttribute('data-astryx-token-value') ?? '';
      const textNode = document.createTextNode(value);

      // Remove the trailing NBSP if present
      const next = span.nextSibling;
      if (next?.nodeType === Node.TEXT_NODE && next.textContent === '\u00A0') {
        next.remove();
      }

      span.replaceWith(textNode);

      // Place cursor at end of inserted text
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.setStartAfter(textNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }

      // Remove from portals
      setTokenPortals(prev => prev.filter(p => p.id !== id));
      onEmitChange();
    },
    [editableRef, tokenPortals, onEmitChange],
  );

  // --- Cleanup orphaned portals ---
  const cleanupPortals = useCallback(() => {
    setTokenPortals(prev =>
      prev.filter(p => editableRef.current?.contains(p.span)),
    );
  }, [editableRef]);

  return {
    tokenPortals,
    expandToken,
    insertToken,
    handleKeyDown,
    handlePaste,
    cleanupPortals,
  };
}
