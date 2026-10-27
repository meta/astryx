// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ToolbarLinkPopover.tsx
 * @input Uses React, @lexical/link (TOGGLE_LINK_COMMAND, link nodes), the
 *   lexical selection API, linkUtils' sanitizeUrl, and core Popover,
 *   IconButton, TextInput, HStack, StackItem, isImeKeyEvent, and
 *   useTranslator.
 * @output Exports useToolbarLink, the link popover's state and actions for an
 *   editor, ToolbarLinkPopover, the non-modal popover with its URL form, and
 *   isInsertLink, the Cmd/Ctrl+K test.
 * @position Internal to @astryxdesign/richtext; the package entry exports
 *   none of it. RichTextEditorToolbar and RichTextEditorSelectionToolbar each
 *   hold one popover, anchored to their own Link button and passed the
 *   glyphs they resolve, so both open the same form with the same rules.
 *
 * SYNC: When modified, update:
 * - /packages/richtext/src/RichTextEditorToolbar.tsx (its Link button)
 * - /packages/richtext/src/RichTextEditorSelectionToolbar.tsx (its Link button)
 * - /packages/richtext/src/RichTextEditorToolbarLink.test.tsx (tests)
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {TOGGLE_LINK_COMMAND, $isLinkNode, $createLinkNode} from '@lexical/link';
import {Popover} from '@astryxdesign/core/Popover';
import {IconButton} from '@astryxdesign/core/IconButton';
import {TextInput} from '@astryxdesign/core/TextInput';
import {HStack, StackItem} from '@astryxdesign/core/Layout';
import {isImeKeyEvent} from '@astryxdesign/core/utils';
import {useTranslator} from '@astryxdesign/core/i18n';
import {
  IS_APPLE,
  isExactShortcutMatch,
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  type LexicalEditor,
  type RangeSelection,
} from 'lexical';
import {sanitizeUrl} from './linkUtils';

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

/** The glyphs the link form draws, resolved by the toolbar that holds it. */
export interface ToolbarLinkIcons {
  readonly applyLink: ReactNode;
  readonly removeLink: ReactNode;
  readonly cancel: ReactNode;
}

interface ToolbarLinkFormProps {
  /** The field's value: the address being entered. */
  url: string;
  /** The message for an address the toolbar refused, or empty. */
  error: string;
  /** Whether the selection is in a link, which Remove then unlinks. */
  isEditing: boolean;
  /** The toolbar's size, so the form's controls match its buttons. */
  size: 'sm' | 'md' | 'lg';
  /** The resolved glyphs for the form's icon buttons. */
  icons: ToolbarLinkIcons;
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
  icons,
  onUrlChange,
  onApply,
  onRemove,
  onCancel,
}: ToolbarLinkFormProps) {
  const t = useTranslator();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const setInput = useCallback((input: HTMLInputElement | null) => {
    inputRef.current = input;
    // TextInput has no props for these native hints: a URL keyboard on touch
    // screens, and no spelling marks under an address. The field stays plain
    // text, so a bare domain is not refused before the toolbar's own check
    // turns it into an https link.
    input?.setAttribute('inputmode', 'url');
    input?.setAttribute('spellcheck', 'false');
  }, []);
  // The field takes focus as the form opens, a frame later so the popover is
  // shown by then, whichever control comes first in its markup.
  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
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
          ref={setInput}
          label={t('@astryx.richTextEditor.link.url')}
          isLabelHidden
          value={url}
          size={size}
          width="100%"
          autoComplete="url"
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
        icon={icons.applyLink}
        variant="ghost"
        size={size}
        tooltip={applyLabel}
        onClick={apply}
      />
      {isEditing && (
        <IconButton
          label={removeLabel}
          icon={icons.removeLink}
          variant="ghost"
          size={size}
          tooltip={removeLabel}
          onClick={onRemove}
        />
      )}
      <IconButton
        label={cancelLabel}
        icon={icons.cancel}
        variant="ghost"
        size={size}
        tooltip={cancelLabel}
        onClick={onCancel}
      />
    </HStack>
  );
}

/** The link popover's state and actions for one editor. */
export interface ToolbarLink {
  /** Whether the popover is open. */
  readonly isOpen: boolean;
  /** Whether it opened for a link, which Apply then retargets. */
  readonly isEditing: boolean;
  readonly url: string;
  readonly error: string;
  /**
   * Opens the popover for the selection, from its link's address or from
   * selected text that already reads as one. With `promptForUrl`, asks it
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
 * focus back to the editor.
 */
export function useToolbarLink(
  editor: LexicalEditor,
  {
    hasNewTabLinks,
    promptForUrl,
  }: {
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

  // The selection as the popover will find it: the last range selection, so
  // a press that moved the editor's selection elsewhere first still links
  // the words that were selected.
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

  useEffect(
    () =>
      editor.registerUpdateListener(({editorState}) => {
        editorState.read($noteSelection);
      }),
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
      const href = sanitizeUrl(trimmed);
      if (href === 'about:blank') {
        return false;
      }

      restoreLinkSelection();
      const linkAttributes = hasNewTabLinks
        ? {target: '_blank', rel: 'noopener noreferrer'}
        : {};
      const handled = editor.dispatchCommand(TOGGLE_LINK_COMMAND, {
        url: href,
        ...linkAttributes,
      });
      if (!handled) {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection) && selection.isCollapsed()) {
            const linkNode = $createLinkNode(href, linkAttributes);
            linkNode.append($createTextNode(trimmed));
            selection.insertNodes([linkNode]);
          }
        });
      }
      return true;
    },
    [editor, hasNewTabLinks, restoreLinkSelection],
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
    setIsOpen(true);
  }, [
    applyLinkValue,
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
 * The non-modal popover the Link button opens, anchored to it, holding the
 * URL form. It is the button's popup: it sets the button's popup state and
 * opens on a press of it. Render it beside the toolbar that holds the button,
 * not inside it: the toolbar is one roving tab stop, which would leave the
 * form's controls out of Tab and take its arrow keys.
 */
export function ToolbarLinkPopover({
  link,
  anchorRef,
  size,
  icons,
}: {
  link: ToolbarLink;
  anchorRef: RefObject<HTMLElement | null>;
  size: 'sm' | 'md' | 'lg';
  icons: ToolbarLinkIcons;
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
      // The form focuses its field, and Cancel is its close control.
      hasAutoFocus={false}
      hasCloseButton={false}
      placement="below"
      alignment="start"
      width={LINK_POPOVER_WIDTH}
      padding={2}
      content={
        link.isOpen ? (
          <ToolbarLinkForm
            url={link.url}
            error={link.error}
            isEditing={link.isEditing}
            size={size}
            icons={icons}
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
