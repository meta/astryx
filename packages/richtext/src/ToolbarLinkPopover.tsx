// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ToolbarLinkPopover.tsx
 * @input Uses React, @lexical/link, the lexical selection API, core Popover,
 *   useTranslator, linkEditing's toLinkHref, and linkForm's LinkForm.
 * @output Exports useToolbarLink, the link popover's state and actions for an
 *   editor, ToolbarLinkPopover, the non-modal popover that holds the URL
 *   form, and isInsertLink, the Cmd/Ctrl+K test.
 * @position Internal to @astryxdesign/richtext; the package entry exports
 *   none of it. A toolbar holds one link popover, anchored to its own Link
 *   button, so every Link button opens the same form with the same rules.
 *
 * SYNC: When modified, update:
 * - /packages/richtext/src/RichTextEditorToolbar.tsx (its Link button)
 * - /packages/richtext/src/RichTextEditorToolbarLink.test.tsx (tests)
 */

import {useCallback, useEffect, useRef, useState, type RefObject} from 'react';
import {mergeRegister} from '@lexical/utils';
import {TOGGLE_LINK_COMMAND, $isLinkNode, $createLinkNode} from '@lexical/link';
import {Popover} from '@astryxdesign/core/Popover';
import {useTranslator} from '@astryxdesign/core/i18n';
import {
  SELECTION_CHANGE_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  IS_APPLE,
  isExactShortcutMatch,
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  type LexicalEditor,
  type RangeSelection,
} from 'lexical';
import {toLinkHref} from './linkEditing';
import {LinkForm} from './linkForm';

/**
 * The platform-primary modifier for shortcuts: Cmd on Apple, Ctrl elsewhere.
 * Mirrors the Lexical playground's `CONTROL_OR_META`
 * (packages/lexical-playground/src/plugins/ShortcutsPlugin/shortcuts.ts).
 */
const CONTROL_OR_META = {ctrlKey: !IS_APPLE, metaKey: IS_APPLE};

/**
 * Whether `event` is the insert-link shortcut (Cmd/Ctrl+K). Uses Lexical's
 * `isExactShortcutMatch`, which — unlike a loose `metaKey || ctrlKey` check —
 * requires exactly the primary modifier and rejects the combo when other
 * modifiers (Shift/Alt) are also held. Matches the playground's `isInsertLink`.
 */
export function isInsertLink(event: KeyboardEvent): boolean {
  return isExactShortcutMatch(event, 'k', CONTROL_OR_META);
}

interface LinkContext {
  selectedText: string;
  url: string;
  isLink: boolean;
}

/** Room for a typical address beside the link form's icon buttons. */
const LINK_POPOVER_WIDTH = 320;

/** The link popover's state and actions for one editor. */
export interface ToolbarLink {
  /** Whether the popover is open. */
  readonly isOpen: boolean;
  /** Whether it opened for a link, which Remove then unlinks. */
  readonly isEditing: boolean;
  /** The field's value: the address being entered. */
  readonly url: string;
  /** The message for an address the rules refused, or empty. */
  readonly error: string;
  /**
   * Opens the popover for the selection. With `promptForUrl`, asks it
   * instead, or unlinks a selection that is in a link.
   */
  readonly toggle: () => void;
  /** The popover's own open and close reports. */
  readonly onOpenChange: (open: boolean) => void;
  readonly onUrlChange: (url: string) => void;
  /** Links the selection to the field's address; false when refused. */
  readonly apply: () => boolean;
  readonly remove: () => void;
  readonly cancel: () => void;
}

/**
 * The link popover's state for `editor`. It remembers the selection the
 * popover opened for, because focus in the field takes the page's selection
 * from the editor, and puts it back before linking, unlinking, or giving
 * focus back to the editor. `buttonRef` is the Link button, which opening the
 * popover scrolls into view.
 */
export function useToolbarLink(
  editor: LexicalEditor,
  {
    buttonRef,
    hasNewTabLinks,
    promptForUrl,
  }: {
    buttonRef: RefObject<HTMLElement | null>;
    hasNewTabLinks: boolean;
    promptForUrl?: (selectedText: string) => string | null | undefined;
  },
): ToolbarLink {
  const t = useTranslator();
  const savedSelectionRef = useRef<RangeSelection | null>(null);
  const lastLinkContextRef = useRef<LinkContext>({
    selectedText: '',
    url: '',
    isLink: false,
  });
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  // The selection the popover will act on: the last range selection, so a
  // press that moved the editor's selection elsewhere first still links the
  // words that were selected.
  const $noteSelection = useCallback((): LinkContext | null => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      return null;
    }
    const node = selection.anchor.getNode();
    const parent = node.getParent();
    const linkNode = $isLinkNode(node)
      ? node
      : $isLinkNode(parent)
        ? parent
        : null;
    savedSelectionRef.current = selection.clone();
    lastLinkContextRef.current = {
      selectedText: selection.getTextContent(),
      url: linkNode?.getURL() ?? '',
      isLink: linkNode != null,
    };
    return lastLinkContextRef.current;
  }, []);

  // Syncs with the Lexical editor's update and selection-change listeners.
  useEffect(
    () =>
      mergeRegister(
        editor.registerUpdateListener(({editorState}) => {
          editorState.read($noteSelection);
        }),
        editor.registerCommand(
          SELECTION_CHANGE_COMMAND,
          () => {
            $noteSelection();
            return false;
          },
          COMMAND_PRIORITY_CRITICAL,
        ),
      ),
    [$noteSelection, editor],
  );

  const readLinkContext = useCallback(
    (): LinkContext =>
      editor.getEditorState().read($noteSelection) ??
      lastLinkContextRef.current,
    [$noteSelection, editor],
  );

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
      const href = toLinkHref(trimmed);
      if (href == null) {
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
            const linkNode = $createLinkNode(href, linkAttributes);
            linkNode.append($createTextNode(trimmed));
            selection.insertNodes([linkNode]);
            return;
          }
        }
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, {
          url: href,
          ...linkAttributes,
        });
      });
      return true;
    },
    [editor, hasNewTabLinks],
  );

  const toggle = useCallback(() => {
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
    setUrl(
      context.url ||
        (context.selectedText.startsWith('http') ? context.selectedText : ''),
    );
    setIsEditing(context.isLink);
    setError('');
    // Cmd/Ctrl+K can open the form while the Link button is scrolled out of
    // view, in the page or in the toolbar's own row. Bring it back so the
    // popover opens beside it.
    buttonRef.current?.scrollIntoView?.({
      block: 'nearest',
      inline: 'nearest',
    });
    setIsOpen(true);
  }, [
    applyLinkValue,
    buttonRef,
    editor,
    promptForUrl,
    readLinkContext,
    restoreLinkSelection,
  ]);

  const close = useCallback(() => {
    setIsOpen(false);
    setError('');
  }, []);

  // The popover reports its own opening (a press on the Link button) and its
  // closing (a press outside it).
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        toggle();
      } else {
        close();
      }
    },
    [close, toggle],
  );

  // Closes the popover and gives the editor back its focus. The editable root
  // takes focus first and Lexical then draws its selection into it, so the
  // selection survives the field having held the page's selection.
  const closeToEditor = useCallback(() => {
    close();
    editor.getRootElement()?.focus({preventScroll: true});
    editor.focus();
  }, [close, editor]);

  const cancel = useCallback(() => {
    restoreLinkSelection();
    closeToEditor();
  }, [closeToEditor, restoreLinkSelection]);

  const apply = useCallback((): boolean => {
    if (!applyLinkValue(url)) {
      setError(t('@astryx.richTextEditor.link.invalidUrl'));
      return false;
    }
    closeToEditor();
    return true;
  }, [applyLinkValue, closeToEditor, t, url]);

  const remove = useCallback(() => {
    restoreLinkSelection();
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    closeToEditor();
  }, [closeToEditor, editor, restoreLinkSelection]);

  const onUrlChange = useCallback((value: string) => {
    setUrl(value);
    setError('');
  }, []);

  return {
    isOpen,
    isEditing,
    url,
    error,
    toggle,
    onOpenChange,
    onUrlChange,
    apply,
    remove,
    cancel,
  };
}

/**
 * The non-modal popover a Link button opens, holding the URL form. It anchors
 * to `anchorRef`, an element around the button that a press never scales,
 * and finds the button inside it: it sets the button's popup state and opens
 * on a press of it. Render it beside the toolbar that holds the button, not
 * inside it: the toolbar is one roving tab stop, which would leave the form's
 * controls out of Tab and take its arrow keys.
 */
export function ToolbarLinkPopover({
  link,
  anchorRef,
  size,
}: {
  link: ToolbarLink;
  anchorRef: RefObject<HTMLElement | null>;
  /** The toolbar's size, so the form's controls match its buttons. */
  size: 'sm' | 'md' | 'lg';
}) {
  const t = useTranslator();
  return (
    <Popover
      anchorRef={anchorRef as RefObject<HTMLElement>}
      label={
        link.isEditing
          ? t('@astryx.richTextEditor.link.editTitle')
          : t('@astryx.richTextEditor.link.insertTitle')
      }
      isOpen={link.isOpen}
      onOpenChange={link.onOpenChange}
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
        link.isOpen ? (
          <LinkForm
            url={link.url}
            error={link.error}
            isEditing={link.isEditing}
            size={size}
            onUrlChange={link.onUrlChange}
            onApply={link.apply}
            onRemove={link.remove}
            onCancel={link.cancel}
          />
        ) : null
      }
    />
  );
}
