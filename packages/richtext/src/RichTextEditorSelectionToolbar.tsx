// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file RichTextEditorSelectionToolbar.tsx
 * @input Uses React (createPortal), @lexical/react (composer context),
 *   @lexical/link, @lexical/table, lexical, core Toolbar, ToggleButton,
 *   Divider, useMediaQuery, isImeKeyEvent, and useTranslator, plus the
 *   glyphs and inline formats RichTextEditorToolbar shares and the link
 *   popover in ToolbarLinkPopover.
 * @output Exports RichTextEditorSelectionToolbar, the toolbar a non-collapsed
 *   selection shows while the editor is editable, its props and option
 *   types, and selectionToolbarPlacement, the geometry that places it.
 * @position @astryxdesign/richtext. Rendered in RichTextEditor's `plugins`
 *   slot. It renders into the positioned element that holds the content
 *   editable, a sibling of the editable text as LinkCard is, never inside
 *   it, and overlays the document without reflowing it (spec:AST-061 FR9,
 *   DEC-2). Base props pass through to the core Toolbar it renders as Toolbar
 *   places them, as RichTextEditorToolbar's do (spec:AST-061/DEC-8). Under a
 *   coarse pointer it docks to the bottom of the visual viewport by default,
 *   and `presentation` keeps either surface on every device
 *   (architecture:public-component-api INV16).
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
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import {createPortal} from 'react-dom';
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
import {Toolbar} from '@astryxdesign/core/Toolbar';
import {ToggleButton} from '@astryxdesign/core/ToggleButton';
import {Divider} from '@astryxdesign/core/Divider';
import {HStack} from '@astryxdesign/core/Layout';
import {useMediaQuery} from '@astryxdesign/core/hooks';
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

/**
 * Where the toolbar sits: `floating` beside the selection, `docked` along the
 * bottom of the visual viewport, above an on-screen keyboard, or `adaptive`,
 * which docks under a coarse pointer and floats otherwise.
 */
export type RichTextEditorSelectionToolbarPresentation =
  'adaptive' | 'floating' | 'docked';

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
   * Where the toolbar sits. `adaptive` docks it to the bottom of the visual
   * viewport under a coarse pointer, where the platform's own selection menu
   * and handles sit beside the selection, and floats it beside the selection
   * otherwise. `floating` and `docked` keep one surface on every device.
   * @default 'adaptive'
   */
  presentation?: RichTextEditorSelectionToolbarPresentation;
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

/** The viewport rectangle the toolbar may sit in. */
export interface SelectionToolbarBand {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

/**
 * Where the floating toolbar sits in its positioned container, as `top` and
 * `left` from the container's edges. Every rectangle is in viewport
 * coordinates.
 *
 * It sits by the selection's focus, the end the pointer let go of or the
 * caret end of a keyboard selection, on the side of that line away from the
 * selected text: above a one-line selection and above a selection made
 * upwards, below one made downwards over lines. When that side has no room
 * in the band it takes the other. It stays inside the band, centred on the
 * focus and clamped sideways.
 */
export function selectionToolbarPlacement({
  rects,
  focus,
  isBackward,
  container,
  band,
  width,
  height,
}: {
  /** The selection's line boxes. */
  rects: ReadonlyArray<DOMRect>;
  /** The selection's focus, a caret-wide box on its line. */
  focus: DOMRect;
  /** Whether the focus starts the selection rather than ends it. */
  isBackward: boolean;
  /** The element the toolbar is positioned in. */
  container: DOMRect;
  band: SelectionToolbarBand;
  width: number;
  height: number;
}): {top: number; left: number} {
  const top = Math.min(...rects.map(rect => rect.top));
  const bottom = Math.max(...rects.map(rect => rect.bottom));
  const isMultiline = bottom - top > focus.height * 1.5;
  // Over several lines, the side away from the text clears the whole
  // selection, not just the focus line.
  const aboveTop =
    (isMultiline && !isBackward ? top : focus.top) - height - GAP;
  const belowTop = (isMultiline && isBackward ? bottom : focus.bottom) + GAP;
  const fitsAbove = aboveTop >= band.top + GAP;
  const fitsBelow = belowTop + height <= band.bottom - GAP;
  const prefersBelow = isMultiline && !isBackward;
  let viewportTop = prefersBelow
    ? fitsBelow || !fitsAbove
      ? belowTop
      : aboveTop
    : fitsAbove || !fitsBelow
      ? aboveTop
      : belowTop;
  // Never out of view: a selection taller than the band keeps the toolbar at
  // the band's edge nearest the focus.
  viewportTop = Math.max(
    band.top + GAP,
    Math.min(viewportTop, band.bottom - height - GAP),
  );
  const viewportLeft = Math.max(
    band.left + GAP,
    Math.min(focus.left - width / 2, band.right - width - GAP),
  );
  return {
    top: viewportTop - container.top,
    left: viewportLeft - container.left,
  };
}

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

/** The nearest scrolling ancestor of `element`, or null for the page. */
function scrollerOf(element: HTMLElement): HTMLElement | null {
  for (let at = element.parentElement; at != null; at = at.parentElement) {
    const overflow = getComputedStyle(at).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') {
      return at;
    }
  }
  return null;
}

/** The viewport, inside the container's scroller when it has one. */
function visibleBand(container: HTMLElement): SelectionToolbarBand {
  const view = container.ownerDocument.defaultView;
  const band = {
    top: 0,
    bottom: view?.innerHeight ?? 0,
    left: 0,
    right: view?.innerWidth ?? 0,
  };
  const scroller = scrollerOf(container);
  if (scroller != null) {
    const rect = scroller.getBoundingClientRect();
    band.top = Math.max(band.top, rect.top);
    band.bottom = Math.min(band.bottom, rect.bottom);
    band.left = Math.max(band.left, rect.left);
    band.right = Math.min(band.right, rect.right);
  }
  return band;
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

type Place =
  | {readonly kind: 'floating'; readonly top: number; readonly left: number}
  | {
      readonly kind: 'docked';
      readonly top: number;
      readonly left: number;
      readonly width: number;
    };

function samePlace(previous: Place | null, next: Place | null): Place | null {
  if (previous == null || next == null || previous.kind !== next.kind) {
    return next;
  }
  const sameWidth =
    previous.kind !== 'docked' ||
    next.kind !== 'docked' ||
    previous.width === next.width;
  return previous.top === next.top && previous.left === next.left && sameWidth
    ? previous
    : next;
}

const styles = stylex.create({
  surface: {
    zIndex: 2,
    boxSizing: 'border-box',
    // Its own width wherever it sits, so the width it is placed by holds.
    width: 'max-content',
  },
  floating: {
    position: 'absolute',
    maxWidth: 'min(100vw, 40rem)',
    padding: spacingVars['--spacing-0-5'],
    backgroundColor: colorVars['--color-background-popover'],
    borderRadius: radiusVars['--radius-container'],
    boxShadow: shadowVars['--shadow-med'],
  },
  docked: {
    position: 'fixed',
    paddingInline: spacingVars['--spacing-2'],
    // Clear of a home indicator when no keyboard is up.
    paddingBlockEnd: 'env(safe-area-inset-bottom, 0px)',
    backgroundColor: colorVars['--color-background-surface'],
    borderBlockStartWidth: 1,
    borderBlockStartStyle: 'solid',
    borderBlockStartColor: colorVars['--color-border'],
    boxShadow: shadowVars['--shadow-med'],
  },
  unplaced: {
    visibility: 'hidden',
  },
  floatingPlace: (top: number, left: number) => ({
    top,
    // eslint-disable-next-line @astryx/no-physical-properties -- intentional: `left` is measured from the selection's boxes, which are physical; `insetInlineStart` would flip the anchor edge in RTL.
    left,
  }),
  dockedPlace: (top: number, left: number, width: number) => ({
    top,
    // eslint-disable-next-line @astryx/no-physical-properties -- intentional: the visual viewport's offset is physical in either direction.
    left,
    width,
  }),
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
 * A toolbar that floats beside a non-collapsed selection while the editor is
 * editable: bold, italic, underline, strikethrough, inline code, and Link,
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
  presentation = 'adaptive',
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
  const isCoarse = useMediaQuery('(pointer: coarse)');
  const isDocked =
    presentation === 'docked' || (presentation === 'adaptive' && isCoarse);
  // Docked controls take touch-sized targets.
  const size = isDocked ? 'md' : 'sm';

  const [root, setRoot] = useState(() => editor.getRootElement());
  const [isEditable, setIsEditable] = useState(() => editor.isEditable());
  const [facts, setFacts] = useState<SelectionFacts | null>(() =>
    editor.getEditorState().read($readFacts),
  );
  const factsRef = useRef(facts);
  const [isFocused, setIsFocused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const linkButtonRef = useRef<HTMLButtonElement>(null);
  // The selection as it was when focus left the editor for the toolbar,
  // which Escape gives back.
  const heldSelectionRef = useRef<BaseSelection | null>(null);
  const link = useToolbarLink(editor, {hasNewTabLinks});
  const {toggle: toggleLink} = link;

  const isShown =
    isEditable && facts != null && !isDragging && (isFocused || link.isOpen);
  const isShownRef = useRef(isShown);
  useEffect(() => {
    isShownRef.current = isShown;
  }, [isShown]);

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
        }),
      ),
    [editor],
  );

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

  useEffect(
    () =>
      mergeRegister(
        // Alt+F10 (⌥F10), the ARIA toolbar key, moves focus from the
        // selection into the toolbar.
        editor.registerCommand(
          KEY_DOWN_COMMAND,
          event => {
            if (!isAltF10(event) || !isShownRef.current) {
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
              !isShownRef.current ||
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
      ),
    [editor, focusToolbar, hasLink, toggleLink],
  );

  const measure = useCallback((): Place | null => {
    const surface = surfaceRef.current;
    const container = root?.parentElement;
    const current = factsRef.current;
    if (
      surface == null ||
      container == null ||
      root == null ||
      current == null
    ) {
      return null;
    }
    if (isDocked) {
      const view = container.ownerDocument.defaultView;
      const viewport = view?.visualViewport;
      const top = viewport?.offsetTop ?? 0;
      const height = viewport?.height ?? view?.innerHeight ?? 0;
      return {
        kind: 'docked',
        top: top + height - surface.offsetHeight,
        left: viewport?.offsetLeft ?? 0,
        width: viewport?.width ?? view?.innerWidth ?? 0,
      };
    }
    const measured = measureSelection(editor, root, current);
    if (measured == null) {
      return null;
    }
    return {
      kind: 'floating',
      ...selectionToolbarPlacement({
        ...measured,
        container: container.getBoundingClientRect(),
        band: visibleBand(container),
        width: surface.offsetWidth,
        height: surface.offsetHeight,
      }),
    };
  }, [editor, isDocked, root]);

  // Placed before it paints, and again as the selection or the page moves.
  useLayoutEffect(() => {
    if (!isShown) {
      return;
    }
    const next = measure();
    if (next != null) {
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- places the toolbar from a layout measurement before it paints
      setPlace(previous => samePlace(previous, next));
    }
  }, [facts, isShown, measure]);

  useEffect(() => {
    if (!isShown || root == null) {
      return;
    }
    const view = root.ownerDocument.defaultView;
    let frame = 0;
    const schedule = () => {
      if (frame !== 0) {
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        const next = measure();
        if (next != null) {
          setPlace(previous => samePlace(previous, next));
        }
      });
    };
    const viewport = view?.visualViewport;
    view?.addEventListener('resize', schedule);
    view?.addEventListener('scroll', schedule, true);
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    return () => {
      view?.removeEventListener('resize', schedule);
      view?.removeEventListener('scroll', schedule, true);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      cancelAnimationFrame(frame);
    };
  }, [isShown, measure, root]);

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

  const container = root?.parentElement;
  if (!isShown || container == null) {
    return null;
  }
  const isTable = facts?.isTable === true;
  const placed =
    place != null && place.kind === (isDocked ? 'docked' : 'floating');
  return createPortal(
    <div
      ref={surfaceRef}
      data-richtext-selection-toolbar={isDocked ? 'docked' : 'floating'}
      // Pressing a control keeps the editor's focus and selection.
      onMouseDown={event => {
        if (!(event.target instanceof HTMLInputElement)) {
          event.preventDefault();
        }
      }}
      onKeyDown={event => {
        // Escape that ends an IME composition is the input method's, and
        // one the link form claimed is the form's.
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
      {...stylex.props(
        styles.surface,
        isDocked ? styles.docked : styles.floating,
        !placed && styles.unplaced,
        placed &&
          (place.kind === 'docked'
            ? styles.dockedPlace(place.top, place.left, place.width)
            : styles.floatingPlace(place.top, place.left)),
      )}>
      <Toolbar
        {...rest}
        ref={ref}
        label={label}
        size={size}
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
                size={size}
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
                size={size}
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
      {/* A sibling of the toolbar, not inside it: the toolbar is one roving
          tab stop, which would leave the form's controls out of Tab. */}
      {hasLink && !isTable && (
        <ToolbarLinkPopover
          link={link}
          anchorRef={linkButtonRef}
          size={size}
          icons={{
            applyLink: icon('applyLink'),
            removeLink: icon('removeLink'),
            cancel: icon('cancel'),
          }}
        />
      )}
    </div>,
    container,
  );
}

RichTextEditorSelectionToolbar.displayName = 'RichTextEditorSelectionToolbar';
