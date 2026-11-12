// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file RichTextEditorLinkPopoverPlugin.tsx
 * @input Uses React (createPortal), @lexical/react (composer context),
 *   lexical, core Link, IconButton, Text, Layout, Icon, useLayerDismissal and
 *   useTranslator, and RichText's linkEditing, linkForm, editorReposition and
 *   useEditorFocusAndDrag
 * @output Exports RichTextEditorLinkPopoverPlugin, an opt-in plugin for the
 *   `plugins` prop, and its props type
 * @position The plugin's popover renders into the positioned element around
 *   the editable text, beside it and never inside it, and overlays the
 *   document without reflowing it. It places itself once per link and
 *   through the shared reposition scheduler, with no scroll listening.
 *   Escape closes it through the shared layer dismissal stack. Without the
 *   plugin, the editor's links behave as they do with no plugin at all. A
 *   read-only or disabled editor shows no popover and follows no Cmd/Ctrl-click.
 */

import * as stylex from '@stylexjs/stylex';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type JSX,
} from 'react';
import {createPortal} from 'react-dom';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$isLinkNode} from '@lexical/link';
import {
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  COMMAND_PRIORITY_HIGH,
  IS_APPLE,
  KEY_DOWN_COMMAND,
  isExactShortcutMatch,
  type LexicalEditor,
  type NodeKey,
} from 'lexical';
import {Link} from '@astryxdesign/core/Link';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Text} from '@astryxdesign/core/Text';
import {HStack, StackItem} from '@astryxdesign/core/Layout';
import {Icon} from '@astryxdesign/core/Icon';
import {useLayerDismissal} from '@astryxdesign/core/Layer';
import {useTranslator} from '@astryxdesign/core/i18n';
import {
  colorVars,
  radiusVars,
  shadowVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {registerEditorReposition} from './editorReposition';
import {
  $caretLink,
  $linkOf,
  displayUrl,
  openLinkInNewTab,
  removeLinkAt,
  setLinkUrlAt,
} from './linkEditing';
import {LinkForm, REMOVE_LINK_GLYPH} from './linkForm';
import {isOpenableUrl} from './linkUtils';
import {useEditorFocusAndDrag} from './useEditorFocusAndDrag';

/** The mask Lexical matches the primary shortcut modifier with. */
const PRIMARY_MODIFIER = {ctrlKey: !IS_APPLE, metaKey: IS_APPLE};

/** Whether the primary modifier is held: Cmd on Apple platforms, else Ctrl. */
function isPrimaryModifier(event: {metaKey: boolean; ctrlKey: boolean}) {
  return IS_APPLE ? event.metaKey : event.ctrlKey;
}

/** The popover's control size. */
const SIZE = 'sm';

/**
 * Edit's glyph. No shared icon name means "edit", so it is fixed component
 * artwork, as Remove's is.
 */
const EDIT_LINK_GLYPH = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true">
    <path
      d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16zM13.5 6.5l4 4"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const styles = stylex.create({
  popover: {
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
  // The form is as wide as the popover may be, so its field has room.
  editing: {
    width: 'min(100%, 25rem)',
  },
  unplaced: {
    visibility: 'hidden',
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
    // eslint-disable-next-line @astryx/no-physical-properties -- intentional: `left` is measured from the link's line box, already resolved for direction in linkPopoverPlacement. `insetInlineStart` would flip the anchor edge again in RTL.
    left,
  }),
});

/** The link the popover is for. */
interface LinkTarget {
  readonly key: NodeKey;
  readonly url: string;
}

type Place = {readonly top: number; readonly left: number};

/**
 * Where the popover sits in its container (the positioned element around the
 * content editable): under the link's line, start-aligned with it, and kept
 * inside the container's width. All rectangles are in viewport coordinates.
 */
export function linkPopoverPlacement({
  line,
  container,
  width,
  isRtl,
}: {
  readonly line: DOMRectReadOnly;
  readonly container: DOMRectReadOnly;
  readonly width: number;
  readonly isRtl: boolean;
}): Place {
  const start = isRtl
    ? line.right - container.left - width
    : line.left - container.left;
  return {
    top: line.bottom - container.top,
    left: Math.max(0, Math.min(start, container.width - width)),
  };
}

/** The line box of the link `key` that holds the caret, else its last. */
function caretLineOf(editor: LexicalEditor, key: NodeKey): DOMRect | null {
  const link = editor.getElementByKey(key);
  if (link == null) {
    return null;
  }
  const rects = Array.from(link.getClientRects());
  if (rects.length === 0) {
    rects.push(link.getBoundingClientRect());
  }
  const last = rects[rects.length - 1];
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

/** The caret's link, as `{key, url}`, read from the editor state. */
function readCaretLink(editor: LexicalEditor): LinkTarget | null {
  return editor.getEditorState().read(() => {
    const link = $caretLink();
    return link == null ? null : {key: link.getKey(), url: link.getURL()};
  });
}

/** Whether `key` still names a link in the editor state. */
function isLinkKey(editor: LexicalEditor, key: NodeKey): boolean {
  return editor.getEditorState().read(() => $isLinkNode($getNodeByKey(key)));
}

function LinkDetails({
  url,
  onEdit,
  onRemove,
}: {
  readonly url: string;
  readonly onEdit: () => void;
  readonly onRemove: () => void;
}) {
  const t = useTranslator();
  const isOpenable = isOpenableUrl(url);
  const openLabel = t('@astryx.richTextEditor.linkPopover.openInNewTab');
  const editLabel = t('@astryx.richTextEditor.linkPopover.edit');
  const removeLabel = t('@astryx.richTextEditor.link.remove');
  return (
    <HStack gap={1} vAlign="center">
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
              openLinkInNewTab(url);
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
          icon={<Icon icon="externalLink" />}
          variant="ghost"
          size={SIZE}
          tooltip={openLabel}
          onClick={() => openLinkInNewTab(url)}
        />
      )}
      <IconButton
        label={editLabel}
        icon={EDIT_LINK_GLYPH}
        variant="ghost"
        size={SIZE}
        tooltip={editLabel}
        onClick={onEdit}
      />
      <IconButton
        label={removeLabel}
        icon={REMOVE_LINK_GLYPH}
        variant="ghost"
        size={SIZE}
        tooltip={removeLabel}
        onClick={onRemove}
      />
    </HStack>
  );
}

function EditLink({
  editor,
  target,
  hasNewTabLinks,
  onDone,
}: {
  readonly editor: LexicalEditor;
  readonly target: LinkTarget;
  readonly hasNewTabLinks: boolean;
  readonly onDone: () => void;
}) {
  const t = useTranslator();
  const [url, setUrl] = useState(target.url);
  const [error, setError] = useState('');
  return (
    <LinkForm
      url={url}
      error={error}
      isEditing
      size={SIZE}
      // The popover is no Popover, so the field focuses itself as Edit opens.
      hasAutoFocus
      onUrlChange={next => {
        setUrl(next);
        setError('');
      }}
      onApply={() => {
        if (!setLinkUrlAt(editor, target.key, url, {hasNewTabLinks})) {
          setError(t('@astryx.richTextEditor.link.invalidUrl'));
          return false;
        }
        onDone();
        return true;
      }}
      onRemove={() => {
        removeLinkAt(editor, target.key);
        onDone();
      }}
      onCancel={onDone}
    />
  );
}

export interface RichTextEditorLinkPopoverPluginProps {
  /**
   * Whether a link the popover edits opens in a new tab: `target="_blank"`
   * and `rel="noopener noreferrer"`, as `RichTextEditorToolbar`'s
   * `hasNewTabLinks` writes them. Off, an edited link has neither.
   * @default true
   */
  hasNewTabLinks?: boolean;
}

/**
 * An opt-in plugin for `RichTextEditor`'s `plugins` prop. With the caret in a
 * link (a click on it, or arrowing into it) while the editor has focus, it
 * shows a popover under the link's line with the link's address (which opens
 * it in a new tab), Open in new tab, Edit, and Remove. Edit, or Cmd/Ctrl+K
 * with the caret in a link, shows the link form the toolbar's link popover
 * uses. Escape closes the popover and keeps it away until the caret is in
 * another link. Cmd-click (Ctrl-click off Apple platforms) on a link opens it
 * in a new tab. Resting the pointer on a link does nothing.
 *
 * @example
 * ```
 * <RichTextEditor label="Notes" plugins={<RichTextEditorLinkPopoverPlugin />} />
 * ```
 */
export function RichTextEditorLinkPopoverPlugin({
  hasNewTabLinks = true,
}: RichTextEditorLinkPopoverPluginProps = {}): JSX.Element | null {
  const [editor] = useLexicalComposerContext();
  const t = useTranslator();
  const {isFocusWithin, isDragging} = useEditorFocusAndDrag(editor);
  const [caret, setCaret] = useState(() => readCaretLink(editor));
  const [isEditable, setIsEditable] = useState(() => editor.isEditable());
  // Escape keeps the caret's popover away until the caret is in another link.
  const [dismissedKey, setDismissedKey] = useState<NodeKey | null>(null);
  // The link being edited, while the form is open.
  const [editing, setEditing] = useState<LinkTarget | null>(null);
  // Bumped as Lexical attaches a root element, so the portal container is
  // read again. The root itself is never kept in state.
  const [, rerenderForRoot] = useReducer((count: number) => count + 1, 0);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<Place | null>(null);

  // The form goes when focus leaves the editor and the popover, or when its
  // link no longer exists.
  const editingTarget =
    editing != null &&
    isEditable &&
    isFocusWithin &&
    isLinkKey(editor, editing.key)
      ? editing
      : null;
  const caretTarget =
    isEditable &&
    isFocusWithin &&
    !isDragging &&
    caret != null &&
    caret.key !== dismissedKey
      ? caret
      : null;
  const target = editingTarget ?? caretTarget;
  const container = editor.getRootElement()?.parentElement ?? null;

  // Syncs the caret's link and the editable state from Lexical, and the
  // portal container from the root element Lexical attaches.
  useEffect(() => {
    const unregisterEditable = editor.registerEditableListener(setIsEditable);
    let last = readCaretLink(editor);
    const unregisterUpdate = editor.registerUpdateListener(() => {
      const next = readCaretLink(editor);
      if (next?.key === last?.key && next?.url === last?.url) {
        return;
      }
      // A caret that leaves the dismissed link ends the dismissal.
      if (next?.key !== last?.key) {
        setDismissedKey(null);
      }
      last = next;
      setCaret(next);
    });
    const unregisterRoot = editor.registerRootListener(() => rerenderForRoot());
    return () => {
      unregisterEditable();
      unregisterUpdate();
      unregisterRoot();
    };
  }, [editor]);

  // Syncs with the root element Lexical attaches: Cmd-click (Ctrl-click off
  // Apple platforms) on a link in an editable editor opens it in a new tab.
  useEffect(() => {
    let detach: (() => void) | null = null;
    const unregister = editor.registerRootListener(root => {
      detach?.();
      detach = null;
      if (root == null) {
        return;
      }
      const follow = (event: MouseEvent) => {
        if (!editor.isEditable() || !isPrimaryModifier(event)) {
          return;
        }
        const anchor =
          event.target instanceof Element
            ? event.target.closest('a[href]')
            : null;
        if (anchor == null || !root.contains(anchor)) {
          return;
        }
        const url = editor.read(
          () => $linkOf($getNearestNodeFromDOMNode(anchor))?.getURL() ?? null,
        );
        if (url != null) {
          event.preventDefault();
          openLinkInNewTab(url);
        }
      };
      root.addEventListener('click', follow);
      detach = () => root.removeEventListener('click', follow);
    });
    return () => {
      unregister();
      detach?.();
    };
  }, [editor]);

  // Syncs Lexical's key command: Cmd/Ctrl+K with the caret in a link edits
  // it. Anywhere else the shortcut stays the toolbar's.
  useEffect(
    () =>
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        event => {
          if (!isExactShortcutMatch(event, 'k', PRIMARY_MODIFIER)) {
            return false;
          }
          const link = readCaretLink(editor);
          if (link == null) {
            return false;
          }
          event.preventDefault();
          setEditing(link);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    [editor],
  );

  const measure = useCallback((): Place | null => {
    const popover = popoverRef.current;
    const box = editor.getRootElement()?.parentElement;
    if (target == null || popover == null || box == null) {
      return null;
    }
    const line = caretLineOf(editor, target.key);
    return line == null
      ? null
      : linkPopoverPlacement({
          line,
          container: box.getBoundingClientRect(),
          width: popover.offsetWidth,
          isRtl: getComputedStyle(box).direction === 'rtl',
        });
  }, [editor, target]);

  const applyPlace = useCallback((next: Place | null) => {
    setPlace(previous =>
      previous != null &&
      next != null &&
      previous.top === next.top &&
      previous.left === next.left
        ? previous
        : next,
    );
  }, []);

  const targetKey = target?.key ?? null;
  const isEditing = editingTarget != null;
  // Places the popover once per target before it paints. Editing changes its
  // width, so the clamp is redone then too.
  useLayoutEffect(() => {
    applyPlace(measure());
  }, [applyPlace, measure, targetKey, isEditing]);

  // Syncs the placement with the editor's layout through the shared
  // reposition scheduler, while the popover shows.
  useEffect(
    () =>
      targetKey == null
        ? undefined
        : registerEditorReposition(editor, () => applyPlace(measure())),
    [applyPlace, editor, measure, targetKey],
  );

  const returnToEditor = () => {
    editor.getRootElement()?.focus({preventScroll: true});
    editor.focus();
  };
  const close = () => {
    if (editingTarget != null) {
      setEditing(null);
    } else if (caret != null) {
      setDismissedKey(caret.key);
    }
    returnToEditor();
  };

  useLayerDismissal({
    isActive: target != null,
    onDismiss: close,
    getContainer: () => popoverRef.current,
  });

  if (target == null || container == null) {
    return null;
  }
  return createPortal(
    <div
      ref={popoverRef}
      role="group"
      aria-label={t('@astryx.richTextEditor.linkPopover.label')}
      {...stylex.props(
        styles.popover,
        isEditing && styles.editing,
        place == null
          ? styles.unplaced
          : styles.placement(place.top, place.left),
      )}
      // Keeps the editor's focus and selection, except in the field.
      onMouseDown={event => {
        if (!(event.target instanceof HTMLInputElement)) {
          event.preventDefault();
        }
      }}>
      {isEditing ? (
        <EditLink
          key={target.key}
          editor={editor}
          target={target}
          hasNewTabLinks={hasNewTabLinks}
          onDone={() => {
            setEditing(null);
            returnToEditor();
          }}
        />
      ) : (
        <LinkDetails
          url={target.url}
          onEdit={() => setEditing(target)}
          onRemove={() => {
            removeLinkAt(editor, target.key);
            returnToEditor();
          }}
        />
      )}
    </div>,
    container,
  );
}
