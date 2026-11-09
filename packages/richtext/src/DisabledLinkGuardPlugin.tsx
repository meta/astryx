// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file DisabledLinkGuardPlugin.tsx
 * @input The composer's editor, and whether RichTextEditor is disabled
 * @output DisabledLinkGuardPlugin (internal; not re-exported from index.ts):
 *   while the editor is disabled, its links add no tab stop and never navigate
 * @position Rendered by RichTextEditor inside its LexicalExtensionComposer
 *
 * A disabled editor is not editable, so the browser treats each link in it as
 * a live link: a tab stop that navigates on a click or on Enter. A disabled
 * control must not navigate, and it keeps the focus order it has when enabled,
 * where its links are not tab stops.
 */

import {useEffect} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';

// Enter on a focused link and a screen reader's activation arrive as a click.
// A middle click arrives as auxclick.
function preventLinkActivation(event: MouseEvent) {
  if (event.target instanceof Element && event.target.closest('a[href]')) {
    event.preventDefault();
  }
}

/**
 * Guards the links under one root element. It records the links it changes,
 * so it restores only those.
 */
function createLinkGuard(root: HTMLElement) {
  const guarded = new Set<Element>();
  const guard = () => {
    for (const link of root.querySelectorAll('a[href]')) {
      if (!guarded.has(link)) {
        guarded.add(link);
        link.setAttribute('tabindex', '-1');
        // Assistive technology announces each link as disabled. Only the
        // link ignores the pointer, so a wide table still scrolls.
        link.setAttribute('aria-disabled', 'true');
        if (link instanceof HTMLElement) {
          link.style.pointerEvents = 'none';
        }
      }
    }
  };
  guard();
  root.addEventListener('click', preventLinkActivation, true);
  root.addEventListener('auxclick', preventLinkActivation, true);
  return {
    guard,
    release() {
      for (const link of guarded) {
        link.removeAttribute('tabindex');
        link.removeAttribute('aria-disabled');
        if (link instanceof HTMLElement) {
          link.style.removeProperty('pointer-events');
        }
      }
      guarded.clear();
      root.removeEventListener('click', preventLinkActivation, true);
      root.removeEventListener('auxclick', preventLinkActivation, true);
    },
  };
}

export function DisabledLinkGuardPlugin({isDisabled}: {isDisabled: boolean}) {
  const [editor] = useLexicalComposerContext();
  // Synchronizes the editor's link elements, which Lexical renders and owns,
  // with the disabled state: guarded while disabled, restored when enabled.
  useEffect(() => {
    if (!isDisabled) {
      return undefined;
    }
    let linkGuard: ReturnType<typeof createLinkGuard> | null = null;
    const unregisterRoot = editor.registerRootListener(next => {
      linkGuard?.release();
      linkGuard = next == null ? null : createLinkGuard(next);
    });
    // A new or changed document renders new link elements.
    const unregisterUpdate = editor.registerUpdateListener(() => {
      linkGuard?.guard();
    });
    return () => {
      unregisterUpdate();
      unregisterRoot();
      linkGuard?.release();
    };
  }, [editor, isDisabled]);
  return null;
}
