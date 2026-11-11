// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file editorReposition.ts
 * @input A Lexical editor and a measure function
 * @output Exports registerEditorReposition
 * @position Internal to RichText. The one reposition scheduler for chrome
 *   placed beside the editable text (code block headers, task checkboxes,
 *   the link popover plugin's popover): it measures once per frame after an
 *   editor update, a resize of the editor's root, or a window resize. It
 *   does not listen to scroll: that chrome sits in the positioned element
 *   around the editable text, so it scrolls with it.
 */

import type {LexicalEditor} from 'lexical';

/** Calls `measure` once per frame after each layout change; returns the
 *  unregister function. */
export function registerEditorReposition(
  editor: LexicalEditor,
  measure: () => void,
): () => void {
  let frame = 0;
  const run = () => {
    frame = 0;
    measure();
  };
  const schedule = () => {
    if (frame === 0) {
      frame = requestAnimationFrame(run);
    }
  };
  const observer =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
  const unregisterRoot = editor.registerRootListener(root => {
    observer?.disconnect();
    if (root != null) {
      observer?.observe(root);
    }
    schedule();
  });
  const unregisterUpdate = editor.registerUpdateListener(schedule);
  window.addEventListener('resize', schedule);
  schedule();
  return () => {
    cancelAnimationFrame(frame);
    observer?.disconnect();
    unregisterRoot();
    unregisterUpdate();
    window.removeEventListener('resize', schedule);
  };
}
