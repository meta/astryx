// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file RichTextEditorSelectionToolbar.tsx
 * @input Uses React, @lexical/react (composer context), @lexical/link,
 *   @lexical/table, lexical, core Layer, Toolbar, ToggleButton, Divider,
 *   isImeKeyEvent, and useTranslator, plus the glyphs and inline formats
 *   RichTextEditorToolbar shares and the link popover in ToolbarLinkPopover.
 * @output Exports RichTextEditorSelectionToolbar, the toolbar a non-collapsed
 *   selection shows while the editor is editable, and its props and format
 *   type.
 * @position @astryxdesign/richtext. Rendered in RichTextEditor's `plugins`
 *   slot, beside the editable text. Its surface is an anchored layer: a
 *   one-pixel anchor sits at the selection inside the positioned element
 *   that holds the editable text, and CSS anchor positioning keeps the
 *   toolbar on it, so the toolbar scrolls with the text and is never clipped.
 *
 * SYNC: When modified, update:
 * - /packages/richtext/src/index.ts (exports)
 * - /packages/richtext/src/publicSurface.test.ts (export list)
 * - /packages/richtext/src/RichTextEditorSelectionToolbar.test.tsx (tests)
 * - /packages/richtext/src/RichTextEditor.doc.mjs (usage notes)
 * - /packages/richtext/README.md (overview)
 * - /apps/storybook/stories/RichTextEditor.stories.tsx (story)
 */

import * as stylex from '@stylexjs/stylex';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$isLinkNode} from '@lexical/link';
import {$isTableCellNode, $isTableSelection} from '@lexical/table';
import {mergeRegister} from '@lexical/utils';
import {
  $getSelection,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  KEY_DOWN_COMMAND,
  type BaseSelection,
  type LexicalEditor,
} from 'lexical';
import type {BaseProps} from '@astryxdesign/core';
import {useLayer, type LayerPlacement} from '@astryxdesign/core/Layer';
import {Toolbar} from '@astryxdesign/core/Toolbar';
import {ToggleButton} from '@astryxdesign/core/ToggleButton';
import {Divider} from '@astryxdesign/core/Divider';
import {HStack} from '@astryxdesign/core/Layout';
import {isImeKeyEvent, isRenderable} from '@astryxdesign/core/utils';
import {useTranslator} from '@astryxdesign/core/i18n';
import {
  colorVars,
  radiusVars,
  shadowVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {
  $inlineFormatsOf,
  INLINE_FORMAT_ACTIONS,
  formatSelection,
  inlineFormatLabels,
  useToolbarIcon,
  type InlineFormat,
} from './RichTextEditorToolbar';
import {
  ToolbarLinkPopover,
  isInsertLink,
  useToolbarLink,
} from './ToolbarLinkPopover';

/** One of the inline formats the toolbar offers. */
export type RichTextEditorSelectionToolbarFormat = InlineFormat;

export interface RichTextEditorSelectionToolbarProps extends BaseProps<HTMLDivElement> {
  /**
   * Ref to the toolbar's root element. Base props pass through to the
   * underlying Astryx `Toolbar`: the ref, `className`, `style`, and `xstyle`
   * reach its root, and `data-*`, other `aria-*` attributes, and DOM
   * handlers reach the `role="toolbar"` element inside it. The toolbar names
   * itself, so pass `label` rather than `aria-label`.
   */
  ref?: Ref<HTMLDivElement>;
  /**
   * Accessible label for the toolbar element.
   * @default 'Selected text', translated for the active locale
   */
  label?: string;
  /**
   * Which inline formats to offer, in order.
   * @default ['bold', 'italic', 'underline', 'strikethrough', 'code']
   */
  formats?: ReadonlyArray<RichTextEditorSelectionToolbarFormat>;
  /**
   * Whether to offer Link, which opens the same link popover as
   * `RichTextEditorToolbar`'s Link button, anchored to this one. A
   * selection of table cells offers no Link.
   * @default true
   */
  hasLink?: boolean;
  /**
   * Whether links created here open in a new tab: `target="_blank"` and
   * `rel="noopener noreferrer"` are written into the link node's data. Match
   * the value given to `RichTextEditorToolbar`.
   * @default true
   */
  hasNewTabLinks?: boolean;
  /**
   * Extra controls at the end of the toolbar, after a divider: actions on
   * the selected text, such as Comment.
   */
  endContent?: ReactNode;
}

/** Room between the toolbar and the selection, and inside its band. */
const GAP = 8;

const ALL_FORMATS: ReadonlyArray<InlineFormat> = INLINE_FORMAT_ACTIONS.map(
  action => action.format,
);

/** The selection the toolbar is for: its identity, formats, and link. */
interface SelectionFacts {
  readonly key: string;
  readonly isTable: boolean;
  readonly isLink: boolean;
  readonly formats: ReadonlySet<InlineFormat>;
}

function $readFacts(): SelectionFacts | null {
  const selection = $getSelection();
  if ($isTableSelection(selection)) {
    if (!selection.getNodes().some($isTableCellNode)) {
      return null;
    }
    return {
      key: `table:${selection.tableKey}:${selection.anchor.key}:${selection.focus.key}`,
      isTable: true,
      isLink: false,
      formats: $inlineFormatsOf(selection),
    };
  }
  if (
    !$isRangeSelection(selection) ||
    selection.isCollapsed() ||
    selection.getTextContent().trim() === ''
  ) {
    return null;
  }
  const node = selection.anchor.getNode();
  const {anchor, focus} = selection;
  return {
    key: `${anchor.key}:${anchor.offset}:${focus.key}:${focus.offset}`,
    isTable: false,
    isLink: $isLinkNode(node) || $isLinkNode(node.getParent()),
    formats: $inlineFormatsOf(selection),
  };
}

function sameFacts(a: SelectionFacts | null, b: SelectionFacts | null) {
  if (a == null || b == null) {
    return a === b;
  }
  return (
    a.key === b.key &&
    a.isLink === b.isLink &&
    a.formats.size === b.formats.size &&
    [...a.formats].every(format => b.formats.has(format))
  );
}

function isBackward(selection: Selection): boolean {
  const {anchorNode, anchorOffset, focusNode, focusOffset} = selection;
  if (anchorNode == null || focusNode == null) {
    return false;
  }
  if (anchorNode === focusNode) {
    return focusOffset < anchorOffset;
  }
  return (
    (anchorNode.compareDocumentPosition(focusNode) &
      Node.DOCUMENT_POSITION_PRECEDING) !==
    0
  );
}

/* Where the selection's focus is drawn: a caret-wide box at its focus, else
   the line box at that end of the selection. */
function focusRect(
  selection: Selection,
  rects: ReadonlyArray<DOMRect>,
  backward: boolean,
): DOMRect {
  const {focusNode, focusOffset} = selection;
  if (focusNode != null) {
    const probe = focusNode.ownerDocument?.createRange();
    try {
      probe?.setStart(focusNode, focusOffset);
      probe?.collapse(true);
      const caret = Array.from(probe?.getClientRects() ?? []).find(
        rect => rect.height > 0,
      );
      if (caret != null) {
        return caret;
      }
    } catch {
      // A focus the editor has just moved: the line box decides.
    }
  }
  return backward ? rects[0] : rects[rects.length - 1];
}

/** The selection's line boxes and focus, read from the page. */
function measureSelection(
  editor: LexicalEditor,
  root: HTMLElement,
  facts: SelectionFacts,
): {
  rects: DOMRect[];
  focus: DOMRect;
  isBackward: boolean;
} | null {
  if (facts.isTable) {
    const cells = editor.getEditorState().read(() => {
      const selection = $getSelection();
      return $isTableSelection(selection)
        ? selection
            .getNodes()
            .filter($isTableCellNode)
            .map(cell => cell.getKey())
        : [];
    });
    const rects = cells
      .map(key => editor.getElementByKey(key)?.getBoundingClientRect())
      .filter((rect): rect is DOMRect => rect != null);
    if (rects.length === 0) {
      return null;
    }
    return {rects, focus: rects[rects.length - 1], isBackward: false};
  }
  const selection = root.ownerDocument.getSelection();
  if (
    selection == null ||
    selection.rangeCount === 0 ||
    !root.contains(selection.anchorNode)
  ) {
    // The page's selection is elsewhere, in the link field: keep the place.
    return null;
  }
  const range = selection.getRangeAt(0);
  const drawn = Array.from(range.getClientRects()).filter(
    rect => rect.width > 0 || rect.height > 0,
  );
  const rects = drawn.length > 0 ? drawn : [range.getBoundingClientRect()];
  const backward = isBackward(selection);
  return {
    rects,
    focus: focusRect(selection, rects, backward),
    isBackward: backward,
  };
}

/**
 * Writes the anchor's box in the element that positions it: one pixel wide at
 * the selection's focus, as tall as the selected lines. The toolbar is
 * anchored to it with CSS, so this runs when the selection or the text's
 * layout changes, never to follow a scroll. Returns the side to prefer: below
 * a selection made downwards over lines, above any other.
 */
function placeAnchor(
  anchor: HTMLElement,
  container: HTMLElement,
  measured: {
    rects: ReadonlyArray<DOMRect>;
    focus: DOMRect;
    isBackward: boolean;
  },
): LayerPlacement {
  const {rects, focus, isBackward} = measured;
  const top = Math.min(...rects.map(rect => rect.top));
  const bottom = Math.max(...rects.map(rect => rect.bottom));
  const box = container.getBoundingClientRect();
  const originTop = box.top + container.clientTop - container.scrollTop;
  const originLeft = box.left + container.clientLeft - container.scrollLeft;
  anchor.style.top = `${top - originTop}px`;
  anchor.style.left = `${focus.left - originLeft}px`;
  anchor.style.height = `${Math.max(bottom - top, 1)}px`;
  const isMultiline = bottom - top > focus.height * 1.5;
  return isMultiline && !isBackward ? 'below' : 'above';
}

const styles = stylex.create({
  // A one-pixel box at the selection. It owns a box because WebKit counts an
  // empty anchor box as clipped, and the layer's default
  // `position-visibility: anchors-visible` then hides the toolbar.
  anchor: {
    position: 'absolute',
    width: '1px',
    pointerEvents: 'none',
  },
  surface: {
    boxSizing: 'border-box',
    width: 'max-content',
    maxWidth: 'min(100vw, 40rem)',
    padding: spacingVars['--spacing-0-5'],
    backgroundColor: colorVars['--color-background-popover'],
    borderRadius: radiusVars['--radius-container'],
    boxShadow: shadowVars['--shadow-med'],
  },
  divider: {
    alignSelf: 'stretch',
    height: 'auto',
  },
});

function isAltF10(event: KeyboardEvent): boolean {
  return (
    event.key === 'F10' &&
    event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

/**
 * A toolbar beside a non-collapsed selection while the editor is editable: bold, italic, underline, strikethrough, inline code, and Link,
 * the formatting `RichTextEditorToolbar` offers, with the same commands,
 * glyphs, and link popover, plus any `endContent`. It never takes focus when
 * it appears. Alt+F10 (⌥F10) moves focus into it, arrow keys move along it,
 * and Escape returns focus to the editor with the selection kept. Read-only
 * and disabled editors show none.
 *
 * Render it in the editor's `plugins` slot: it uses
 * `useLexicalComposerContext()` to reach the editor.
 *
 * @example
 * ```
 * import {
 *   RichTextEditor,
 *   RichTextEditorSelectionToolbar,
 * } from '@astryxdesign/richtext';
 *
 * <RichTextEditor
 *   label="Notes"
 *   plugins={<RichTextEditorSelectionToolbar />}
 * />
 * ```
 */
export function RichTextEditorSelectionToolbar({
  label: labelFromProps,
  formats = ALL_FORMATS,
  hasLink = true,
  hasNewTabLinks = true,
  endContent,
  xstyle,
  ref,
  ...rest
}: RichTextEditorSelectionToolbarProps) {
  const [editor] = useLexicalComposerContext();
  const t = useTranslator();
  const icon = useToolbarIcon();
  const label =
    labelFromProps ?? t('@astryx.richTextEditor.selectionToolbar.label');
  const formatLabels = inlineFormatLabels(t);

  const [root, setRoot] = useState(() => editor.getRootElement());
  const [isEditable, setIsEditable] = useState(() => editor.isEditable());
  const [facts, setFacts] = useState<SelectionFacts | null>(() =>
    editor.getEditorState().read($readFacts),
  );
  const factsRef = useRef(facts);
  const [isFocused, setIsFocused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [placement, setPlacement] = useState<LayerPlacement>('above');
  const surfaceRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const linkButtonRef = useRef<HTMLButtonElement>(null);
  // The selection as it was when focus left the editor for the toolbar,
  // which Escape gives back.
  const heldSelectionRef = useRef<BaseSelection | null>(null);
  const link = useToolbarLink(editor, {hasNewTabLinks});
  const {toggle: toggleLink} = link;
  const layer = useLayer({mode: 'context'});
  const {ref: anchorLayerTo, show: showLayer, hide: hideLayer} = layer;

  const isShown =
    isEditable && facts != null && !isDragging && (isFocused || link.isOpen);

  // Moves the anchor to the selection. A selection the page no longer shows
  // in the editor (focus is in the link field) keeps the anchor where it is.
  const placeAtSelection = useCallback(
    (current: SelectionFacts | null) => {
      const anchor = anchorRef.current;
      const container = anchor?.parentElement;
      const editorRoot = editor.getRootElement();
      if (
        current == null ||
        anchor == null ||
        container == null ||
        editorRoot == null
      ) {
        return;
      }
      const measured = measureSelection(editor, editorRoot, current);
      if (measured != null) {
        setPlacement(placeAnchor(anchor, container, measured));
      }
    },
    [editor],
  );

  const setAnchor = useCallback(
    (node: HTMLSpanElement | null) => {
      anchorRef.current = node;
      anchorLayerTo(node);
      if (node != null) {
        placeAtSelection(factsRef.current);
      }
    },
    [anchorLayerTo, placeAtSelection],
  );

  useEffect(
    () =>
      mergeRegister(
        editor.registerRootListener(next => setRoot(next)),
        editor.registerEditableListener(editable => setIsEditable(editable)),
        editor.registerUpdateListener(({editorState}) => {
          const next = editorState.read($readFacts);
          if (!sameFacts(factsRef.current, next)) {
            factsRef.current = next;
            setFacts(next);
          }
          placeAtSelection(next);
        }),
      ),
    [editor, placeAtSelection],
  );

  // Text that wraps differently (a narrower field, a font that loads) moves
  // the selection inside the editor, so the anchor moves with it.
  useEffect(() => {
    if (root == null || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(() =>
      placeAtSelection(factsRef.current),
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [root, placeAtSelection]);

  // Focus in the editor, or in anything rendered beside it (this toolbar,
  // its link popover), keeps the toolbar.
  useEffect(() => {
    if (root == null) {
      return;
    }
    const frame = root.parentElement ?? root;
    const onFocusIn = (event: FocusEvent) => {
      if (
        root.contains(event.relatedTarget as Node | null) &&
        surfaceRef.current?.contains(event.target as Node | null)
      ) {
        heldSelectionRef.current = editor
          .getEditorState()
          .read(() => $getSelection()?.clone() ?? null);
      }
      setIsFocused(true);
    };
    // Where focus is going, not where it is: mid-move it is on the body.
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      setIsFocused(next instanceof Node && frame.contains(next));
    };
    const onPointerDown = (event: PointerEvent) => {
      // A drag in the text changes the selection: the toolbar waits for it.
      if (event.button === 0) {
        setIsDragging(true);
      }
    };
    const onPointerUp = () => setIsDragging(false);
    const view = root.ownerDocument.defaultView;
    frame.addEventListener('focusin', onFocusIn);
    frame.addEventListener('focusout', onFocusOut);
    root.addEventListener('pointerdown', onPointerDown);
    view?.addEventListener('pointerup', onPointerUp);
    view?.addEventListener('pointercancel', onPointerUp);
    const active = root.ownerDocument.activeElement;
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- reads where focus is, which only the DOM holds
    setIsFocused(active != null && frame.contains(active));
    return () => {
      frame.removeEventListener('focusin', onFocusIn);
      frame.removeEventListener('focusout', onFocusOut);
      root.removeEventListener('pointerdown', onPointerDown);
      view?.removeEventListener('pointerup', onPointerUp);
      view?.removeEventListener('pointercancel', onPointerUp);
    };
  }, [editor, root]);

  // Shows the anchored layer while the toolbar is shown.
  useEffect(() => {
    if (!isShown) {
      return;
    }
    showLayer();
    return () => hideLayer();
  }, [isShown, showLayer, hideLayer]);

  const focusToolbar = useCallback((): boolean => {
    const toolbar = surfaceRef.current?.querySelector('[role="toolbar"]');
    const target =
      toolbar?.querySelector<HTMLElement>('[tabindex="0"]') ??
      toolbar?.querySelector<HTMLElement>('button:not([disabled])');
    if (target == null) {
      return false;
    }
    target.focus();
    return true;
  }, []);

  // The toolbar's keys, registered with the editor only while it shows.
  useEffect(() => {
    if (!isShown) {
      return;
    }
    return mergeRegister(
      // Alt+F10 (⌥F10), the ARIA toolbar key, moves focus from the
      // selection into the toolbar.
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        event => {
          if (!isAltF10(event)) {
            return false;
          }
          heldSelectionRef.current = editor
            .getEditorState()
            .read(() => $getSelection()?.clone() ?? null);
          if (!focusToolbar()) {
            return false;
          }
          event.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      // Cmd/Ctrl+K opens this toolbar's link popover only when nothing else
      // took it first: RichTextEditorToolbar and its link card do.
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        event => {
          if (
            !hasLink ||
            factsRef.current?.isTable !== false ||
            !isInsertLink(event)
          ) {
            return false;
          }
          event.preventDefault();
          toggleLink();
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor, focusToolbar, hasLink, isShown, toggleLink]);

  const returnToEditor = () => {
    const held = heldSelectionRef.current;
    heldSelectionRef.current = null;
    if (held != null) {
      editor.update(() => {
        $setSelection(held.clone());
      });
    }
    root?.focus({preventScroll: true});
    editor.focus();
  };

  const isTable = facts?.isTable === true;
  return (
    <>
      <span ref={setAnchor} aria-hidden {...stylex.props(styles.anchor)} />
      {isShown &&
        layer.render(
          <div
            ref={surfaceRef}
            // Pressing a control keeps the editor's focus and selection.
            onMouseDown={event => {
              if (!(event.target instanceof HTMLInputElement)) {
                event.preventDefault();
              }
            }}
            onKeyDown={event => {
              // Escape that ends an IME composition is the input method's,
              // and one the link form claimed is the form's.
              if (
                event.key !== 'Escape' ||
                event.defaultPrevented ||
                isImeKeyEvent(event.nativeEvent)
              ) {
                return;
              }
              event.preventDefault();
              returnToEditor();
            }}
            {...stylex.props(styles.surface)}>
            <Toolbar
              {...rest}
              ref={ref}
              label={label}
              size="sm"
              xstyle={xstyle}
              // eslint-disable-next-line @astryx/no-hardcoded-i18n-string -- aria-keyshortcuts takes ARIA key names, which are not translated
              aria-keyshortcuts="Alt+F10"
              startContent={
                <HStack gap={1}>
                  {formats.map(format => (
                    <ToggleButton
                      key={format}
                      label={formatLabels[format]}
                      icon={icon(format)}
                      size="sm"
                      isIconOnly
                      isPressed={facts?.formats.has(format) ?? false}
                      onPressedChange={() => formatSelection(editor, format)}
                    />
                  ))}
                  {hasLink && !isTable && (
                    <ToggleButton
                      ref={linkButtonRef}
                      label={t('@astryx.richTextEditor.toolbar.link')}
                      icon={icon('link')}
                      size="sm"
                      isIconOnly
                      isPressed={facts?.isLink === true || link.isOpen}
                    />
                  )}
                  {isRenderable(endContent) && (
                    <>
                      <Divider orientation="vertical" xstyle={styles.divider} />
                      {endContent}
                    </>
                  )}
                </HStack>
              }
            />
            {/* A sibling of the toolbar, not inside it: the toolbar is one
                roving tab stop, which would leave the form's controls out of
                Tab. */}
            {hasLink && !isTable && (
              <ToolbarLinkPopover
                link={link}
                anchorRef={linkButtonRef}
                size="sm"
                icons={{
                  applyLink: icon('applyLink'),
                  removeLink: icon('removeLink'),
                  cancel: icon('cancel'),
                }}
              />
            )}
          </div>,
          {placement, alignment: 'center', offset: GAP},
        )}
    </>
  );
}

RichTextEditorSelectionToolbar.displayName = 'RichTextEditorSelectionToolbar';
