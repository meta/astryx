// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useEditorFocusAndDrag.ts
 * @input A Lexical editor
 * @output Exports useEditorFocusAndDrag: whether focus is in the editor's
 *   frame, and whether a pointer is dragging a selection in its text
 * @position Internal to RichText, for chrome that shows beside the editable
 *   text (RichTextEditorLinkPopoverPlugin, the selection format bar). The
 *   frame is the positioned element around the content editable, which also
 *   holds that chrome, so focus in the chrome counts as focus in the editor.
 *   The listeners attach through `registerRootListener`; the root element
 *   is never kept in React state.
 */

import {useEffect, useState} from 'react';
import type {LexicalEditor} from 'lexical';

export interface EditorFocusAndDrag {
  /** Whether focus is in the editable text or the chrome beside it. */
  readonly isFocusWithin: boolean;
  /** Whether a pointer pressed in the editable text and is still down. */
  readonly isDragging: boolean;
}

export function useEditorFocusAndDrag(
  editor: LexicalEditor,
): EditorFocusAndDrag {
  const [isFocusWithin, setIsFocusWithin] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Syncs with the root element Lexical attaches, and with the document's
  // pointer releases.
  useEffect(() => {
    let detach: (() => void) | null = null;
    const endDrag = () => setIsDragging(false);
    const unregister = editor.registerRootListener(root => {
      detach?.();
      detach = null;
      if (root == null) {
        setIsFocusWithin(false);
        setIsDragging(false);
        return;
      }
      const frame = root.parentElement ?? root;
      const onFocusIn = () => setIsFocusWithin(true);
      // Where focus is going, not where it is: mid-move it is on the body.
      const onFocusOut = (event: FocusEvent) => {
        const next = event.relatedTarget;
        setIsFocusWithin(next instanceof Node && frame.contains(next));
      };
      const onPointerDown = (event: PointerEvent) => {
        if (event.button === 0) {
          setIsDragging(true);
        }
      };
      frame.addEventListener('focusin', onFocusIn);
      frame.addEventListener('focusout', onFocusOut);
      root.addEventListener('pointerdown', onPointerDown);
      const view = root.ownerDocument.defaultView ?? window;
      view.addEventListener('pointerup', endDrag);
      view.addEventListener('pointercancel', endDrag);
      // Focus may already be in the editor as the listeners attach.
      const active = frame.ownerDocument.activeElement;
      setIsFocusWithin(active != null && frame.contains(active));
      detach = () => {
        frame.removeEventListener('focusin', onFocusIn);
        frame.removeEventListener('focusout', onFocusOut);
        root.removeEventListener('pointerdown', onPointerDown);
        view.removeEventListener('pointerup', endDrag);
        view.removeEventListener('pointercancel', endDrag);
      };
    });
    return () => {
      unregister();
      detach?.();
    };
  }, [editor]);

  return {isFocusWithin, isDragging};
}
