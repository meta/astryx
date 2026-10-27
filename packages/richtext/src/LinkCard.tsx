// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file LinkCard.tsx
 * @input Uses React (createPortal), @lexical/react (composer context),
 *   @lexical/link, @lexical/utils, lexical, linkUtils, and core Link,
 *   IconButton, Text, TextInput, HStack, VStack, StackItem, and useTranslator.
 * @output Exports LinkCard, the card RichTextEditorToolbar shows for a link in
 *   an editable editor, and linkCardPlacement, the geometry that places it.
 * @position Rendered by RichTextEditorToolbar, which owns the glyphs it draws,
 *   while the editor is editable. The card renders into the positioned
 *   element that holds the content editable, a sibling of the editable text
 *   as CodeBlockHeaderPlugin's headers are, never inside it. It is absolutely
 *   positioned, so it overlays the document and never reflows it
 *   (spec:AST-061 FR9, DEC-2). It also makes Cmd-click (Ctrl-click off Apple
 *   platforms) follow a link, and marks the editor root so editorTheme draws
 *   its links with a text cursor until that modifier is held over one.
 *
 * SYNC: When modified, update:
 * - /packages/richtext/src/RichTextEditorToolbar.tsx (renders it)
 * - /packages/richtext/src/editorTheme.ts (follow cursor attributes)
 * - /packages/richtext/src/LinkCard.test.tsx (tests)
 * - /packages/richtext/src/RichTextEditor.doc.mjs (link docs)
 */

import * as stylex from '@stylexjs/stylex';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import {createPortal} from 'react-dom';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$isAutoLinkNode, $isLinkNode, type LinkNode} from '@lexical/link';
import {$findMatchingParent} from '@lexical/utils';
import {
  $addUpdateTag,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  $createTextNode,
  COMMAND_PRIORITY_HIGH,
  HISTORY_PUSH_TAG,
  IS_APPLE,
  KEY_DOWN_COMMAND,
  isExactShortcutMatch,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from 'lexical';
import {Link} from '@astryxdesign/core/Link';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {HStack, StackItem, VStack} from '@astryxdesign/core/Layout';
import {useTranslator} from '@astryxdesign/core/i18n';
import {isImeKeyEvent} from '@astryxdesign/core/utils';
import {
  colorVars,
  radiusVars,
  shadowVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {isOpenableUrl, sanitizeUrl} from './linkUtils';

/** How long the pointer rests on a link before its card opens. */
const HOVER_OPEN_MS = 300;
/** How long the card stays after the pointer leaves, so it can be reached. */
const HOVER_CLOSE_MS = 250;

/**
 * On the editor root while its links follow on Cmd/Ctrl-click: editorTheme
 * then draws them with a text cursor, as a plain click places the caret.
 */
export const LINK_FOLLOW_ROOT_ATTRIBUTE = 'data-richtext-follow-links';
/**
 * On the link under the pointer while the follow modifier is held:
 * editorTheme draws that one link with a pointer cursor. Only that link is
 * marked, so pressing the modifier restyles one element, not every link.
 */
export const LINK_FOLLOW_ATTRIBUTE = 'data-richtext-link-follow';

/** The mask Lexical matches the primary shortcut modifier with. */
const PRIMARY_MODIFIER = {ctrlKey: !IS_APPLE, metaKey: IS_APPLE};

const styles = stylex.create({
  card: {
    position: 'absolute',
    zIndex: 1,
    boxSizing: 'border-box',
    // Its own width wherever it sits, so the width it is placed by holds.
    width: 'max-content',
    maxWidth: 'min(100%, 25rem)',
    marginBlockStart: spacingVars['--spacing-1'],
    padding: spacingVars['--spacing-2'],
    backgroundColor: colorVars['--color-background-popover'],
    borderRadius: radiusVars['--radius-container'],
    boxShadow: shadowVars['--shadow-med'],
  },
  // The Edit form is as wide as the card may be, so its fields have room.
  editing: {
    width: 'min(100%, 25rem)',
  },
  unplaced: {
    visibility: 'hidden',
  },
  glyph: {
    display: 'inline-flex',
    flexShrink: 0,
    color: colorVars['--color-icon-secondary'],
  },
  // A long address ends in an ellipsis; the tooltip carries all of it.
  address: {
    display: 'block',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  placement: (top: number, left: number) => ({
    top,
    // eslint-disable-next-line @astryx/no-physical-properties -- intentional: `left` is measured from the link's line box, already resolved for direction in linkCardPlacement. `insetInlineStart` would flip the anchor edge again in RTL.
    left,
  }),
});

/** The link a card is open for. */
interface LinkTarget {
  readonly key: NodeKey;
  readonly url: string;
  /** How it was found: the pointer resting on it, or the caret inside it. */
  readonly via: 'hover' | 'caret';
  /** For `hover`, the pointer's viewport y, so a link that wraps lines gets
   *  the card under the line the pointer is on. */
  readonly pointerY?: number;
}

/** The link `node` is in, if any. An unlinked autolink reads as text. */
function $linkOf(node: LexicalNode | null): LinkNode | null {
  const link = node == null ? null : $findMatchingParent(node, $isLinkNode);
  return $isLinkNode(link) && !($isAutoLinkNode(link) && link.getIsUnlinked())
    ? link
    : null;
}

/** The link a collapsed selection (the caret) is in, or null. */
function $caretLink(): LinkNode | null {
  const selection = $getSelection();
  return $isRangeSelection(selection) && selection.isCollapsed()
    ? $linkOf(selection.anchor.getNode())
    : null;
}

/** Whether the follow modifier is held: Cmd on Apple platforms, else Ctrl. */
function isFollowModifier(event: {metaKey: boolean; ctrlKey: boolean}) {
  return IS_APPLE ? event.metaKey : event.ctrlKey;
}

/** The address as a person reads it: no web scheme, no trailing slash. */
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

/** Opens a stored link in a new tab; an address that is not safe to open
 *  never opens. */
function openLink(url: string): void {
  if (isOpenableUrl(url)) {
    window.open(sanitizeUrl(url), '_blank', 'noopener,noreferrer');
  }
}

/** Removes every text run and line break in `link` but `keep`, at any
 *  depth, then the wrappers that leaves empty. */
function $keepOnlyRun(link: ElementNode, keep: LexicalNode): void {
  const prune = (element: ElementNode): void => {
    for (const child of element.getChildren()) {
      if (child.is(keep)) {
        continue;
      }
      if ($isElementNode(child)) {
        prune(child);
        if (child.isEmpty()) {
          child.remove();
        }
      } else {
        child.remove();
      }
    }
  };
  prune(link);
}

/** Whether a link holds anything but text runs and line breaks. */
function $holdsInlineAtom(link: ElementNode): boolean {
  return link
    .getChildren()
    .some(child =>
      $isElementNode(child)
        ? $holdsInlineAtom(child)
        : !$isTextNode(child) && !$isLineBreakNode(child),
    );
}

type SetLinkResult =
  {readonly ok: true} | {readonly ok: false; readonly field: 'text' | 'url'};

/**
 * Removes the link `key` and keeps its words, as one undo step. An autolink
 * is marked unlinked instead, so the autolink plugin does not link its words
 * again.
 */
function removeLinkAt(editor: LexicalEditor, key: NodeKey): void {
  editor.update(
    () => {
      const node = $getNodeByKey(key);
      if (!$isLinkNode(node)) {
        return;
      }
      $addUpdateTag(HISTORY_PUSH_TAG);
      if ($isAutoLinkNode(node)) {
        node.setIsUnlinked(true);
        return;
      }
      for (const child of node.getChildren()) {
        node.insertBefore(child);
      }
      node.remove();
    },
    {discrete: true},
  );
}

/**
 * Sets the link `key`'s address and, when `text` differs from its words, its
 * words, as one undo step. The address goes through the toolbar's own rules
 * (`sanitizeUrl`); an empty address removes the link and keeps its words.
 * Empty text keeps the link's words. New words go in the link's first text
 * run, so they keep its format, and the rest of its runs and line breaks go;
 * a link that holds more than text (an inline plugin node) keeps its words.
 */
function setLinkAt(
  editor: LexicalEditor,
  key: NodeKey,
  {text, url}: {readonly text: string; readonly url: string},
): SetLinkResult {
  if (url.trim() === '') {
    removeLinkAt(editor, key);
    return {ok: true};
  }
  const href = sanitizeUrl(url);
  if (href === 'about:blank') {
    return {ok: false, field: 'url'};
  }
  let result: SetLinkResult = {ok: true};
  editor.update(
    () => {
      const node = $getNodeByKey(key);
      if (!$isLinkNode(node)) {
        return;
      }
      const rewords = text.trim() !== '' && text !== node.getTextContent();
      if (rewords && $holdsInlineAtom(node)) {
        result = {ok: false, field: 'text'};
        return;
      }
      $addUpdateTag(HISTORY_PUSH_TAG);
      node.setURL(href);
      if (!rewords) {
        return;
      }
      const first = node.getAllTextNodes()[0];
      const words = first ?? $createTextNode(text);
      if (first == null) {
        node.append(words);
      } else {
        words.setTextContent(text);
      }
      // The caret moves into the new words before the rest of the link's
      // text goes, so the selection never points at a removed node.
      words.select(text.length, text.length);
      $keepOnlyRun(node, words);
    },
    {discrete: true},
  );
  return result;
}

/**
 * Where the card sits in its container (the positioned element around the
 * content editable): under the link's line, start-aligned with it, and kept
 * inside the container's width. All rectangles are in viewport coordinates.
 */
export function linkCardPlacement({
  line,
  container,
  cardWidth,
  isRtl,
}: {
  readonly line: DOMRectReadOnly;
  readonly container: DOMRectReadOnly;
  readonly cardWidth: number;
  readonly isRtl: boolean;
}): {top: number; left: number} {
  const start = isRtl
    ? line.right - container.left - cardWidth
    : line.left - container.left;
  return {
    top: line.bottom - container.top,
    left: Math.max(0, Math.min(start, container.width - cardWidth)),
  };
}

type Place = {readonly top: number; readonly left: number};

/** Keeps the previous place when a new measurement lands on it. */
function samePlace(previous: Place | null, next: Place | null): Place | null {
  return previous != null &&
    next != null &&
    previous.top === next.top &&
    previous.left === next.left
    ? previous
    : next;
}

/** The line box of the link `target` names that the card goes under. */
function lineOf(editor: LexicalEditor, target: LinkTarget): DOMRect | null {
  const link = editor.getElementByKey(target.key);
  if (link == null) {
    return null;
  }
  const rects = Array.from(link.getClientRects());
  if (rects.length === 0) {
    rects.push(link.getBoundingClientRect());
  }
  const last = rects[rects.length - 1];
  if (target.via === 'hover' && target.pointerY != null) {
    const y = target.pointerY;
    return rects.find(rect => y >= rect.top && y <= rect.bottom) ?? last;
  }
  const selection = link.ownerDocument.getSelection();
  const range =
    selection != null && selection.rangeCount > 0
      ? selection.getRangeAt(0)
      : null;
  if (range == null || !link.contains(range.startContainer)) {
    return last;
  }
  const caret = range.getClientRects()[0] ?? range.getBoundingClientRect();
  return (
    rects.find(
      rect => caret.top >= rect.top - 1 && caret.bottom <= rect.bottom + 1,
    ) ?? last
  );
}

/** The editor's root element, as Lexical attaches and replaces it. */
function useRootElement(editor: LexicalEditor): HTMLElement | null {
  const [root, setRoot] = useState(() => editor.getRootElement());
  useEffect(() => editor.registerRootListener(next => setRoot(next)), [editor]);
  return root;
}

/**
 * The link the card is for: the one the pointer rests on, else the one
 * holding the caret while focus is in the editor or the card. `hold` and
 * `release` keep a hovered link's card while the pointer is over the card;
 * `dismiss` closes it until the pointer finds a link again or the caret is in
 * another link.
 */
function useLinkTarget(
  editor: LexicalEditor,
  root: HTMLElement | null,
): {
  readonly target: LinkTarget | null;
  readonly hold: () => void;
  readonly release: () => void;
  readonly dismiss: () => void;
} {
  const readCaret = useCallback(
    () =>
      editor.getEditorState().read(() => {
        const link = $caretLink();
        return link == null ? null : {key: link.getKey(), url: link.getURL()};
      }),
    [editor],
  );
  const [caret, setCaret] = useState(readCaret);
  const lastCaretRef = useRef(caret);
  const [hovered, setHovered] = useState<LinkTarget | null>(null);
  const [focused, setFocused] = useState(false);
  // Escape keeps the caret's card away until the caret is in another link
  // (or leaves and comes back).
  const [isCaretDismissed, setIsCaretDismissed] = useState(false);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearOpen = useCallback(() => {
    if (openTimerRef.current != null) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);
  const clearClose = useCallback(() => {
    if (closeTimerRef.current != null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);
  const openSoon = useCallback(
    (link: LinkTarget, delay: number) => {
      clearClose();
      clearOpen();
      openTimerRef.current = setTimeout(() => {
        openTimerRef.current = null;
        setHovered(link);
      }, delay);
    },
    [clearClose, clearOpen],
  );
  const closeSoon = useCallback(() => {
    clearOpen();
    clearClose();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setHovered(null);
    }, HOVER_CLOSE_MS);
  }, [clearClose, clearOpen]);

  useEffect(
    () =>
      editor.registerUpdateListener(() => {
        const next = readCaret();
        const previous = lastCaretRef.current;
        if (previous?.key === next?.key && previous?.url === next?.url) {
          return;
        }
        if (previous?.key !== next?.key) {
          setIsCaretDismissed(false);
        }
        lastCaretRef.current = next;
        setCaret(next);
      }),
    [editor, readCaret],
  );

  useEffect(() => {
    if (root == null) {
      return;
    }
    // The positioned element around the editable text holds the card too, so
    // focus in either one counts.
    const frame = root.parentElement ?? root;
    const onOver = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element
          ? event.target.closest('a[href]')
          : null;
      if (anchor == null || !root.contains(anchor)) {
        return;
      }
      const link = editor.read(() => {
        const node = $linkOf($getNearestNodeFromDOMNode(anchor));
        return node == null ? null : {key: node.getKey(), url: node.getURL()};
      });
      if (link != null) {
        // With the follow modifier held the card opens at once: the person
        // is aiming at the link.
        openSoon(
          {...link, pointerY: event.clientY, via: 'hover'},
          isFollowModifier(event) ? 0 : HOVER_OPEN_MS,
        );
      }
    };
    const onOut = (event: MouseEvent) => {
      const from =
        event.target instanceof Element
          ? event.target.closest('a[href]')
          : null;
      const to = event.relatedTarget;
      if (from != null && !(to instanceof Node && from.contains(to))) {
        closeSoon();
      }
    };
    const onFocusIn = () => setFocused(true);
    // Where focus is going, not where it is: mid-move it is on the body, and
    // reading that would drop the card focus is moving into.
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      setFocused(next instanceof Node && frame.contains(next));
    };
    root.addEventListener('mouseover', onOver);
    root.addEventListener('mouseout', onOut);
    frame.addEventListener('focusin', onFocusIn);
    frame.addEventListener('focusout', onFocusOut);
    // Focus may already be in the editor as the listeners attach.
    const active = frame.ownerDocument.activeElement;
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- reads where focus is, which only the DOM holds
    setFocused(active != null && frame.contains(active));
    return () => {
      root.removeEventListener('mouseover', onOver);
      root.removeEventListener('mouseout', onOut);
      frame.removeEventListener('focusin', onFocusIn);
      frame.removeEventListener('focusout', onFocusOut);
      clearOpen();
      clearClose();
    };
  }, [clearClose, clearOpen, closeSoon, editor, openSoon, root]);

  const target = useMemo(
    (): LinkTarget | null =>
      hovered ??
      (focused && caret != null && !isCaretDismissed
        ? {...caret, via: 'caret'}
        : null),
    [caret, focused, hovered, isCaretDismissed],
  );

  return {
    target,
    hold: clearClose,
    release: closeSoon,
    // A hovered link's card goes until the pointer finds a link again; the
    // caret's, until the caret is in another link.
    dismiss: useCallback(() => {
      clearOpen();
      clearClose();
      setHovered(null);
      setIsCaretDismissed(true);
    }, [clearClose, clearOpen]),
  };
}

/**
 * Whether the follow modifier is held. While it is, the link under the
 * pointer carries LINK_FOLLOW_ATTRIBUTE, which editorTheme turns into a
 * pointer cursor: a click there follows the link.
 */
function useFollowModifier(root: HTMLElement | null): boolean {
  const [held, setHeld] = useState(false);
  const pointerOverRef = useRef<EventTarget | null>(null);
  useEffect(() => {
    const update = (event: KeyboardEvent | MouseEvent) => {
      if (event.type === 'mousemove') {
        pointerOverRef.current = event.target;
      }
      setHeld(isFollowModifier(event));
    };
    const clear = () => setHeld(false);
    window.addEventListener('keydown', update);
    window.addEventListener('keyup', update);
    window.addEventListener('mousemove', update);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', update);
      window.removeEventListener('keyup', update);
      window.removeEventListener('mousemove', update);
      window.removeEventListener('blur', clear);
    };
  }, []);
  useEffect(() => {
    if (root == null || !held) {
      return;
    }
    let marked: Element | null = null;
    const mark = (target: EventTarget | null) => {
      const link = target instanceof Element ? target.closest('a') : null;
      const next = link != null && root.contains(link) ? link : null;
      if (next === marked) {
        return;
      }
      marked?.removeAttribute(LINK_FOLLOW_ATTRIBUTE);
      marked = next;
      marked?.setAttribute(LINK_FOLLOW_ATTRIBUTE, '');
    };
    mark(pointerOverRef.current);
    const onOver = (event: MouseEvent) => mark(event.target);
    root.addEventListener('mouseover', onOver);
    return () => {
      root.removeEventListener('mouseover', onOver);
      marked?.removeAttribute(LINK_FOLLOW_ATTRIBUTE);
    };
  }, [held, root]);
  return held;
}

/** The glyphs the card draws, resolved by the toolbar for the active theme. */
export interface LinkCardIcons {
  readonly link: ReactNode;
  readonly openLink: ReactNode;
  readonly editLink: ReactNode;
  readonly removeLink: ReactNode;
  readonly applyLink: ReactNode;
  readonly cancel: ReactNode;
}

interface LinkCardProps {
  /** The toolbar's size, so the card's controls match its buttons. */
  readonly size: 'sm' | 'md' | 'lg';
  readonly icons: LinkCardIcons;
  /** Hides the card, as while the toolbar's own link popover is open. */
  readonly isHidden?: boolean;
}

/**
 * The link's Text and Link fields, applied together (Enter in either field,
 * or Apply). Cancel or Escape leaves both as they were.
 */
function EditLinkForm({
  editor,
  target,
  size,
  icons,
  onDone,
}: {
  readonly editor: LexicalEditor;
  readonly target: LinkTarget;
  readonly size: 'sm' | 'md' | 'lg';
  readonly icons: LinkCardIcons;
  readonly onDone: () => void;
}) {
  const t = useTranslator();
  // Drafts start from the link being edited; the card remounts the form for
  // each link.
  const [text, setText] = useState(() =>
    editor.read(() => $getNodeByKey(target.key)?.getTextContent() ?? ''),
  );
  const [url, setUrl] = useState(target.url);
  const [error, setError] = useState<SetLinkResult | null>(null);
  const textRef = useRef<HTMLInputElement | null>(null);
  const urlRef = useRef<HTMLInputElement | null>(null);
  const setUrlInput = useCallback((input: HTMLInputElement | null) => {
    urlRef.current = input;
    // TextInput has no props for these native hints: a URL keyboard on touch
    // screens, and no spelling marks under an address.
    input?.setAttribute('inputmode', 'url');
    input?.setAttribute('spellcheck', 'false');
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      textRef.current?.focus();
      textRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const apply = () => {
    const result = setLinkAt(editor, target.key, {text, url});
    if (!result.ok) {
      setError(result);
      (result.field === 'text' ? textRef : urlRef).current?.focus();
      return;
    }
    onDone();
  };
  // Applying hands focus to the editor, which must not receive the rest of
  // this Enter as a new line.
  const claimEnter = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !isImeKeyEvent(event.nativeEvent)) {
      event.preventDefault();
    }
  };
  const applyLabel = t('@astryx.richTextEditor.link.update');
  const cancelLabel = t('@astryx.richTextEditor.link.cancel');
  return (
    <VStack gap={2}>
      <TextInput
        ref={textRef}
        label={t('@astryx.richTextEditor.linkCard.text')}
        value={text}
        size={size}
        width="100%"
        autoComplete="off"
        status={
          error?.ok === false && error.field === 'text'
            ? {
                type: 'error',
                message: t('@astryx.richTextEditor.linkCard.textNotEditable'),
              }
            : undefined
        }
        statusVariant="detached"
        onChange={value => {
          setText(value);
          setError(null);
        }}
        onEnter={apply}
        onKeyDown={claimEnter}
      />
      <TextInput
        ref={setUrlInput}
        label={t('@astryx.richTextEditor.linkCard.url')}
        value={url}
        size={size}
        width="100%"
        autoComplete="url"
        placeholder={t('@astryx.richTextEditor.link.urlPlaceholder')}
        status={
          error?.ok === false && error.field === 'url'
            ? {
                type: 'error',
                message: t('@astryx.richTextEditor.link.invalidUrl'),
              }
            : undefined
        }
        statusVariant="detached"
        onChange={value => {
          setUrl(value);
          setError(null);
        }}
        onEnter={apply}
        onKeyDown={claimEnter}
      />
      <HStack gap={1} hAlign="end">
        <IconButton
          label={cancelLabel}
          icon={icons.cancel}
          variant="ghost"
          size={size}
          tooltip={cancelLabel}
          onClick={onDone}
        />
        <IconButton
          label={applyLabel}
          icon={icons.applyLink}
          variant="ghost"
          size={size}
          tooltip={applyLabel}
          onClick={apply}
        />
      </HStack>
    </VStack>
  );
}

/** The card's reading view: the address (which opens the link when it is
 *  safe to), Open in new tab, Edit, Remove, and the follow shortcut. */
function LinkDetails({
  url,
  size,
  icons,
  isModifierHeld,
  onEdit,
  onRemove,
}: {
  readonly url: string;
  readonly size: 'sm' | 'md' | 'lg';
  readonly icons: LinkCardIcons;
  readonly isModifierHeld: boolean;
  readonly onEdit: () => void;
  readonly onRemove: () => void;
}) {
  const t = useTranslator();
  const isOpenable = isOpenableUrl(url);
  const openLabel = t('@astryx.richTextEditor.linkCard.openInNewTab');
  const editLabel = t('@astryx.richTextEditor.linkCard.edit');
  const removeLabel = t('@astryx.richTextEditor.link.remove');
  return (
    <VStack gap={1}>
      <HStack gap={1} vAlign="center">
        <span aria-hidden="true" {...stylex.props(styles.glyph)}>
          {icons.link}
        </span>
        <StackItem size="fill">
          {isOpenable ? (
            <Link
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              tooltip={url}
              isStandalone
              xstyle={styles.address}
              onClick={event => {
                event.preventDefault();
                openLink(url);
              }}>
              {displayUrl(url)}
            </Link>
          ) : (
            <Text maxLines={1}>{url}</Text>
          )}
        </StackItem>
        {isOpenable && (
          <IconButton
            label={openLabel}
            icon={icons.openLink}
            variant="ghost"
            size={size}
            tooltip={openLabel}
            onClick={() => openLink(url)}
          />
        )}
        <IconButton
          label={editLabel}
          icon={icons.editLink}
          variant="ghost"
          size={size}
          tooltip={editLabel}
          onClick={onEdit}
        />
        <IconButton
          label={removeLabel}
          icon={icons.removeLink}
          variant="ghost"
          size={size}
          tooltip={removeLabel}
          onClick={onRemove}
        />
      </HStack>
      {isOpenable && (
        <Text
          type="supporting"
          color={isModifierHeld ? 'primary' : 'secondary'}>
          {t('@astryx.richTextEditor.linkCard.openHint', {
            platform: IS_APPLE ? 'apple' : 'other',
          })}
        </Text>
      )}
    </VStack>
  );
}

/**
 * The card for a link in an editable editor, opened by resting the pointer on
 * the link or putting the caret in it: the link's address, Open in new tab,
 * Edit (its words and address, also Cmd/Ctrl+K with the caret in it), Remove,
 * and the follow shortcut. Cmd-click (Ctrl-click off Apple platforms) on a
 * link follows it. Escape in the card returns focus to the editor and keeps
 * the card away until a link is targeted again.
 */
export function LinkCard({
  size,
  icons,
  isHidden = false,
}: LinkCardProps): JSX.Element | null {
  const [editor] = useLexicalComposerContext();
  const t = useTranslator();
  const root = useRootElement(editor);
  const container = root?.parentElement ?? null;
  const found = useLinkTarget(editor, root);
  const isModifierHeld = useFollowModifier(root);
  // While its link is being edited, the card stays on that link even when
  // the pointer or the caret leaves it.
  const [editing, setEditing] = useState<LinkTarget | null>(null);
  const target = isHidden ? null : (editing ?? found.target);
  const cardRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const targetId = target == null ? null : `${target.key}:${target.url}`;
  const isEditing = editing != null;

  // Links in this editor follow on Cmd/Ctrl-click while the card is here, so
  // they read as text until the modifier is held over one.
  useEffect(() => {
    if (root == null) {
      return;
    }
    const follow = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element
          ? event.target.closest('a[href]')
          : null;
      if (
        !isFollowModifier(event) ||
        anchor == null ||
        !root.contains(anchor)
      ) {
        return;
      }
      const url = editor.read(
        () => $linkOf($getNearestNodeFromDOMNode(anchor))?.getURL() ?? null,
      );
      if (url != null && isOpenableUrl(url)) {
        event.preventDefault();
        openLink(url);
      }
    };
    root.addEventListener('click', follow);
    root.setAttribute(LINK_FOLLOW_ROOT_ATTRIBUTE, '');
    return () => {
      root.removeEventListener('click', follow);
      root.removeAttribute(LINK_FOLLOW_ROOT_ATTRIBUTE);
    };
  }, [editor, root]);

  // Cmd/Ctrl+K with the caret in a link edits it; anywhere else the toolbar
  // handles the shortcut.
  useEffect(
    () =>
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        event => {
          if (!isExactShortcutMatch(event, 'k', PRIMARY_MODIFIER)) {
            return false;
          }
          const link = editor.read(() => {
            const node = $caretLink();
            return node == null
              ? null
              : {key: node.getKey(), url: node.getURL()};
          });
          if (link == null) {
            return false;
          }
          event.preventDefault();
          setEditing({...link, via: 'caret'});
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    [editor],
  );

  const measure = useCallback(() => {
    const card = cardRef.current;
    if (target == null || card == null || container == null) {
      return null;
    }
    const line = lineOf(editor, target);
    if (line == null) {
      return null;
    }
    return linkCardPlacement({
      line,
      container: container.getBoundingClientRect(),
      cardWidth: card.offsetWidth,
      isRtl: getComputedStyle(container).direction === 'rtl',
    });
  }, [container, editor, target]);

  useLayoutEffect(() => {
    const next = measure();
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- places the card from a layout measurement before it paints
    setPlace(previous => samePlace(previous, next));
    // `isEditing` changes the card's width, so its clamp is redone.
  }, [measure, targetId, isEditing]);

  // The card follows its link when the document or the editor's size
  // changes, or a region inside it scrolls.
  useEffect(() => {
    if (target == null || container == null) {
      return;
    }
    let frame = 0;
    const schedule = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          const next = measure();
          setPlace(previous => samePlace(previous, next));
        });
      }
    };
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(schedule);
    observer?.observe(container);
    const unregister = editor.registerUpdateListener(schedule);
    container.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      unregister();
      container.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
    };
  }, [container, editor, measure, target]);

  if (target == null || container == null) {
    return null;
  }
  const returnToEditor = () => {
    editor.getRootElement()?.focus({preventScroll: true});
    editor.focus();
  };
  const finishEditing = () => {
    setEditing(null);
    returnToEditor();
  };
  return createPortal(
    <div
      ref={cardRef}
      role="group"
      aria-label={t('@astryx.richTextEditor.linkCard.label')}
      {...stylex.props(
        styles.card,
        isEditing && styles.editing,
        place == null
          ? styles.unplaced
          : styles.placement(place.top, place.left),
      )}
      onMouseEnter={found.hold}
      onMouseLeave={found.release}
      // Keeps the editor's focus and selection, except in the fields.
      onMouseDown={event => {
        if (!(event.target instanceof HTMLInputElement)) {
          event.preventDefault();
        }
      }}
      onKeyDown={event => {
        if (event.key !== 'Escape' || isImeKeyEvent(event.nativeEvent)) {
          return;
        }
        event.preventDefault();
        if (isEditing) {
          finishEditing();
          return;
        }
        found.dismiss();
        returnToEditor();
      }}>
      {isEditing ? (
        <EditLinkForm
          key={targetId}
          editor={editor}
          target={target}
          size={size}
          icons={icons}
          onDone={finishEditing}
        />
      ) : (
        <LinkDetails
          url={target.url}
          size={size}
          icons={icons}
          isModifierHeld={isModifierHeld}
          onEdit={() => setEditing(target)}
          onRemove={() => {
            removeLinkAt(editor, target.key);
            found.dismiss();
            returnToEditor();
          }}
        />
      )}
    </div>,
    container,
  );
}
