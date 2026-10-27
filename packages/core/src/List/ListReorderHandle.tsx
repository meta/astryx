// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ListReorderHandle.tsx
 * @input The List's reorder session (List/listReorderEngine.tsx, through
 *   ListContext's `reorder`), the translator and theme tokens
 * @output `ListReorderHandle`, `ListReorderRowName` and `reorderRowStyle`:
 *   the trailing handle of a reorderable List row, a button that a finger
 *   (held still for a moment, where the primary pointer is coarse) or a
 *   mouse drags, and a toggle (`aria-pressed`) whose activation without a
 *   drag (a click, Space or Enter) turns its row's reorder mode on and off
 *   (spec:AST-103 FR4); the name of a row without one; and the style of a
 *   row that has one
 * @position Part of the reorder machinery that createReorderable carries:
 *   ListItem renders it, from the List's context, at the end of each row
 *   that can move
 *
 * UIKit's reorder control (iOS 26.2, measured): the three gray lines at the
 * trailing edge of a row in edit mode. A finger held still on it for the
 * scroll view's content-touch delay (150 ms) claims the drag; a flick that
 * starts on it scrolls the table instead, so the handle leaves the browser
 * everything but double-tap zoom (`manipulation`, for a long press:
 * spec:AST-094 FR18) until the claim. All of that applies only where the
 * primary pointer is coarse (spec:AST-094 FR19);
 * elsewhere a finger gets the browser's defaults. The handle is the one
 * element the reorder adds to a row (spec:AST-103 FR5): its lines are a
 * pseudo-element, and it listens to nothing itself. The list's listeners
 * (the session's) take its drags; its keys go through React's.
 *
 * SYNC: When modified, update List/listReorderEngine.tsx and
 * List/ListItem.tsx.
 */

import {
  isValidElement,
  use,
  useEffect,
  useRef,
  useSyncExternalStore,
  useId,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import * as stylex from '@stylexjs/stylex';
import {colorVars, focusVars, typeScaleVars} from '../theme/tokens.stylex';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {ownRingContainerStyles} from './ownRing.stylex';
import {watchHitArea, writeHitInsets} from '../utils/hitArea';
import {useTranslator} from '../i18n/useTranslator';
import {devWarn} from '../utils/devWarning';
import {ItemLabelContext} from '../Item/ItemLabelContext';
import {ListContext} from './ListContext';
import {
  HANDLE_ATTRIBUTE,
  type ListReorderHandleProps,
  type ListReorderRowNameProps,
} from './listReorderContext';
import type {ListReorderController} from './listReorderEngine';

/**
 * The handle's side, for every pointer: a small control's size. A finger's
 * 44 px target is an invisible coarse-only hit layer, clamped so it never
 * takes from a neighbour (utils/hitArea.ts), not a bigger handle.
 */
const HANDLE_SIZE = 28;
/** The three lines' height: the handle's share of its row's height. */
const LINES_HEIGHT = 14;
/** The lines' length and thickness, and the distance between them. */
const LINE_WIDTH = 20;
const LINE_THICKNESS = 2;
const LINE_GAP = (LINES_HEIGHT - LINE_THICKNESS) / 2;

const styles = stylex.create({
  handle: {
    // Centred on its row, with the lines in its middle. It takes only the
    // lines' height in the row's layout (the negative block margins), so a
    // compact row stays compact; the handle and its focus ring reach past
    // that into the row's padding, never past it: no further than the row's
    // own inline inset, so a flush row's handle stays inside the list's clip.
    position: 'relative',
    alignSelf: 'center',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    marginBlock: (LINES_HEIGHT - HANDLE_SIZE) / 2,
    marginInlineEnd: 'calc(-1 * min(8px, var(--_item-inset-inline, 8px)))',
    padding: 0,
    borderWidth: 0,
    borderRadius: 4,
    // The ring sits inside the handle: the handle reaches the row's inline
    // end, and the list clips what passes it.
    outlineOffset: {
      default: '0',
      ':focus-visible': `calc(-1 * ${focusVars['--focus-outline-width']})`,
    },
    // Pressed while its row is in reorder mode, as a pressed toggle button
    // is; in forced colors, the system's highlight.
    backgroundColor: {
      default: 'transparent',
      ':is([aria-pressed="true"])': {
        default: colorVars['--color-overlay-pressed'],
        '@media (forced-colors: active)': 'Highlight',
      },
    },
    forcedColorAdjust: {
      default: null,
      ':is([aria-pressed="true"])': 'none',
    },
    color: {
      default: colorVars['--color-icon-secondary'],
      ':is([aria-disabled="true"])': colorVars['--color-icon-disabled'],
      ':is([aria-pressed="true"])': {
        default: colorVars['--color-icon-secondary'],
        '@media (forced-colors: active)': 'HighlightText',
      },
    },
    // Grabbing while its list reorders (a drag holds the pointer). Not
    // `:active`: that is the touch press controller's arm, and the handle
    // paints no press.
    cursor: {
      default: 'grab',
      ':is([data-astryx-reordering] *)': 'grabbing',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    // Where the primary pointer is coarse: until the hold claims the drag,
    // the page keeps its scrolling and its pinch-zoom (a flick on the handle
    // scrolls, as on iOS): `manipulation`, what a long press leaves the
    // browser (spec:AST-094 FR18). No text selection under a held finger: the
    // hold's selection lock holds it while the finger is down, so a mouse
    // keeps the page's selection as it was. Where it is fine, a finger gets
    // the browser's defaults.
    touchAction: {
      default: null,
      '@media (pointer: coarse)': 'manipulation',
    },
    WebkitTapHighlightColor: {
      default: null,
      '@media (pointer: coarse)': 'transparent',
    },
    // The three lines: one bar and its two shadows, in the handle's color.
    // Forced colors keep them (shadows and backgrounds go there otherwise),
    // drawn in the system's button text.
    '::before': {
      content: '""',
      display: 'block',
      width: LINE_WIDTH,
      height: LINE_THICKNESS,
      borderRadius: LINE_THICKNESS / 2,
      backgroundColor: 'currentColor',
      boxShadow: `0 -${LINE_GAP}px currentColor, 0 ${LINE_GAP}px currentColor`,
      forcedColorAdjust: 'none',
      pointerEvents: 'none',
    },
    // The coarse-only hit layer: invisible, grown toward 44 px by the insets
    // the hit area writes where the primary pointer is coarse (0 elsewhere),
    // each side capped at half the gap to a neighbouring target.
    '::after': {
      content: '""',
      position: 'absolute',
      // SYNC: utils/hitArea.ts HIT_INSET_PROPERTIES (StyleX reads no
      // imported value).
      inset:
        'calc(var(--astryx-hit-inset-top, 0px) * -1) calc(var(--astryx-hit-inset-right, 0px) * -1) calc(var(--astryx-hit-inset-bottom, 0px) * -1) calc(var(--astryx-hit-inset-left, 0px) * -1)',
    },
  },
  // The row's own child (a row without end content, spec:AST-103 FR5): it
  // ends the row, as the end slot would, and aligns as the row's `align`
  // would align that slot.
  inRow: {
    marginInlineStart: 'auto',
  },
  // `start`: at the top of the row's content.
  inRowStart: {
    alignSelf: 'flex-start',
  },
  // `first-line`: centred on the label's first line, a line of body text at
  // the top of the row's content (the line Item's first-line slots centre
  // on). Its layout height stays the lines' height (the end margin).
  inRowFirstLine: {
    alignSelf: 'flex-start',
    marginBlockStart: `calc((${typeScaleVars['--text-body-leading']} - ${HANDLE_SIZE}px) / 2)`,
  },
});

/**
 * The style of a row that ends with a handle (ListItem applies it): its ring
 * on focus within stays off for the handle, which rings itself.
 */
export const reorderRowStyle = ownRingContainerStyles.focusWithin;

/** The insertion line's thickness, px (the engine centres it on a gap). */
export const INSERTION_LINE_THICKNESS = 2;

const listStyles = stylex.create({
  // The insertion line (design:ordered-collection-reordering): the list's own
  // pseudo-element, decoration with no semantic role, so no element joins the
  // list (architecture:component-style-authoring INV7). The engine shows it
  // with `data-astryx-reorder-line` on the list and places it with the list's
  // custom properties: its top (`--astryx-reorder-line-y`, a compositor
  // translate) and its inline start and size (the dragged row's).
  list: {
    '::after': {
      content: '""',
      display: {
        default: 'none',
        '[data-astryx-reorder-line]': 'block',
      },
      position: 'absolute',
      top: 0,
      insetInlineStart: 'var(--astryx-reorder-line-start, 0px)',
      inlineSize: 'var(--astryx-reorder-line-size, 0px)',
      blockSize: INSERTION_LINE_THICKNESS,
      borderRadius: INSERTION_LINE_THICKNESS / 2,
      backgroundColor: {
        default: colorVars['--color-accent'],
        '@media (forced-colors: active)': 'Highlight',
      },
      forcedColorAdjust: 'none',
      translate: '0 var(--astryx-reorder-line-y, 0px)',
      pointerEvents: 'none',
      zIndex: 2,
    },
  },
});

/** The style of a reorderable list (List applies it): its insertion line. */
export const reorderListStyle = listStyles.list;

/**
 * The text a label shows: its strings and numbers, through its elements'
 * children, with runs of space collapsed. Empty when it shows none (an icon,
 * an image).
 */
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textOf).join('');
  }
  if (isValidElement<{children?: ReactNode}>(node)) {
    return textOf(node.props.children);
  }
  return '';
}

/** The text the row's label element shows, collapsed; empty without one. */
function labelTextOf(handle: HTMLElement | null, labelID: string | null) {
  const element =
    labelID == null
      ? null
      : (handle?.ownerDocument.getElementById(labelID) ?? null);
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Whether the row's label element names it: it shows text, or holds an icon
 * or image with an accessible name of its own.
 */
function namesRow(element: HTMLElement | null): boolean {
  if (element == null) {
    return false;
  }
  return (
    (element.textContent ?? '').trim() !== '' ||
    element.querySelector(
      '[aria-label]:not([aria-label=""]), [aria-labelledby], img[alt]:not([alt=""])',
    ) != null
  );
}

/**
 * The reorder handle of a List row. Renders nothing outside a reorderable
 * List.
 */
export function ListReorderHandle({
  label,
  itemKey,
  isDisabled = false,
  rowLabel,
  rowLabelledBy,
  rowAlign,
}: ListReorderHandleProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const t = useTranslator();
  const controller = use(ListContext)?.reorder?.session as
    ListReorderController | undefined;
  // The row's label element, when the handle sits in an Item's slot.
  const labelID = use(ItemLabelContext);
  const verbID = useId();
  const text = textOf(label).replace(/\s+/g, ' ').trim();
  // Named "Reorder" followed by the row's name (spec:AST-103 FR4): the name
  // its caller gave the row; else the elements that name the row (its
  // caller's `aria-labelledby`, or the label element Item renders), so a
  // label of any shape names it; outside an Item, the label's text. A row
  // that shows no name is named after its place.
  const callerLabel = rowLabel?.trim() || null;
  const labelledBy =
    callerLabel != null ? undefined : (rowLabelledBy ?? labelID ?? undefined);
  const named = callerLabel != null || labelledBy != null || text !== '';
  const verb = t('@astryx.list.reorderHandleVerb');
  const warnedNamelessRef = useRef(false);
  // The session moves the row only with its handle recorded, reports its
  // moves with the row's key, and announces them with its name: a component
  // label's text is read from its element, rendered by now.
  useIsomorphicLayoutEffect(() => {
    const spoken =
      callerLabel ??
      (text !== '' ? text : labelTextOf(ref.current, labelID ?? null));
    return controller?.registerHandle(ref.current, itemKey, spoken);
  }, [controller, itemKey, callerLabel, text, labelID]);
  // Pressed while its row is in reorder mode.
  const isPressed = useSyncExternalStore(
    controller?.subscribeMode ?? subscribeNothing,
    () => controller?.isInMode(ref.current) ?? false,
    () => false,
  );
  const isEnabled = controller != null && !isDisabled;
  // The row the handle sits in, read after each commit: the list's own ref is
  // attached after its rows' layout effects run, and by the cleanup below the
  // handle may already be out of the row.
  const rowRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    rowRef.current = controller?.rowOf(ref.current) ?? null;
  });
  // A finger's target: the hit area watches the handle where the primary
  // pointer is coarse and writes how far its hit layer may grow.
  useIsomorphicLayoutEffect(() => {
    const handle = ref.current;
    if (handle == null) {
      return undefined;
    }
    return watchHitArea(handle, insets => writeHitInsets(handle, insets));
  }, []);
  // A handle that stops taking gestures mid-drag (its row disabled or no
  // longer reorderable, the handle gone) sends a drag of its row home,
  // whichever pointer or key drives it.
  useIsomorphicLayoutEffect(() => {
    if (!isEnabled || controller == null) {
      return undefined;
    }
    return () => controller.release(rowRef.current);
  }, [controller, isEnabled]);
  // That place is read from the DOM after each commit (the row does not
  // know its index). A passive effect: the list's own ref is attached after
  // its rows' layout effects run.
  useEffect(() => {
    const handle = ref.current;
    if (handle == null) {
      return;
    }
    // Named by Item's label element only while it shows a name: a label of
    // an unnamed icon alone falls back to the place.
    if (labelID != null && labelledBy === labelID) {
      if (namesRow(handle.ownerDocument.getElementById(labelID))) {
        handle.setAttribute('aria-labelledby', `${verbID} ${labelID}`);
        handle.setAttribute('aria-label', verb);
        return;
      }
      handle.removeAttribute('aria-labelledby');
    } else if (named) {
      return;
    }
    const position = controller?.positionOf(handle) ?? null;
    if (position == null) {
      return;
    }
    // Named after its place only: a person hears "Reorder item 3" with
    // nothing to tell the rows apart. Development says so, once a handle.
    if (!warnedNamelessRef.current) {
      warnedNamelessRef.current = true;
      devWarn(
        'ListItem',
        'A reorderable row has no accessible name, so its reorder handle is ' +
          'named after its place ("Reorder item N"). Give the row a text ' +
          'label or an aria-label.',
      );
    }
    handle.setAttribute(
      'aria-label',
      t('@astryx.list.reorderHandleAt', {position}),
    );
  });
  if (controller == null) {
    return null;
  }
  // Named through the label element: the handle's own `aria-label` is the
  // verb, and it lists itself first in its `aria-labelledby`, which reads its
  // `aria-label` there ("Reorder" then the row's label).
  const name =
    callerLabel != null
      ? t('@astryx.list.reorderHandle', {label: callerLabel})
      : labelledBy != null
        ? verb
        : text !== ''
          ? t('@astryx.list.reorderHandle', {label: text})
          : undefined;
  return (
    <button
      ref={ref}
      id={labelledBy == null ? undefined : verbID}
      type="button"
      {...{[HANDLE_ATTRIBUTE]: ''}}
      // The handle takes its own press, so the row does not highlight under
      // it (it paints nothing itself).
      data-astryx-pressable=""
      // It rings itself: the row's focus-within ring stays off for it.
      data-astryx-own-ring=""
      aria-label={name}
      aria-labelledby={
        labelledBy == null ? undefined : `${verbID} ${labelledBy}`
      }
      aria-describedby={controller.hintId}
      aria-disabled={isDisabled || undefined}
      aria-pressed={isPressed}
      // A click, Space or Enter: reorder mode, unless the press dragged.
      onClick={() => {
        if (!controller.takeDrag(ref.current) && !isDisabled) {
          controller.toggleMode(ref.current);
        }
      }}
      onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
        if (!isDisabled) {
          controller.keyDown(ref.current, event);
        }
      }}
      onBlur={event => controller.blur(ref.current, event.relatedTarget)}
      // The row's own pointer handling (its swipe) never sees the handle's
      // presses: the list's listeners have them, before this.
      onPointerDown={event => event.stopPropagation()}
      // A hold on the handle picks the row up, and only a hold elsewhere on
      // the row opens the row's menu (spec:AST-103): a menu around the row
      // never starts its long press from the handle, and a finger's long
      // press there sends it no context request. A mouse's right click on
      // the handle still reaches it.
      onTouchStart={event => event.stopPropagation()}
      onContextMenu={event => {
        if (
          (event.nativeEvent as Partial<PointerEvent>).pointerType === 'touch'
        ) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      {...focusOutlineProps.focusVisible(
        styles.handle,
        rowAlign != null && styles.inRow,
        rowAlign === 'start' && styles.inRowStart,
        rowAlign === 'first-line' && styles.inRowFirstLine,
      )}
    />
  );
}

ListReorderHandle.displayName = 'ListReorderHandle';

const subscribeNothing = () => () => {};

/**
 * Names a reorderable List's row that has no handle (one that stays, or one
 * without an item key) for the announcements of the moves beside it.
 * Renders nothing.
 */
export function ListReorderRowName({row, label}: ListReorderRowNameProps) {
  const controller = use(ListContext)?.reorder?.session as
    ListReorderController | undefined;
  const text = textOf(label).replace(/\s+/g, ' ').trim();
  useIsomorphicLayoutEffect(
    () => controller?.registerName(row.current, text),
    [controller, row, text],
  );
  return null;
}

ListReorderRowName.displayName = 'ListReorderRowName';
