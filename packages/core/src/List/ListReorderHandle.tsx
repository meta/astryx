// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ListReorderHandle.tsx
 * @input The List's reorder session (List/listReorderEngine.tsx, through
 *   ListContext's `reorder`), the translator, theme tokens and the theme's
 *   `list-reorder-handle` icon slot
 * @output `ListReorderHandle`, `ListReorderRowName`, `reorderRowStyle`,
 *   `reorderRowLayout`, `reorderListLayout`, `UNREAD_HANDLE_NAME` and
 *   `reorderHandleGrowth`. The handle ends a reorderable List row, or starts
 *   it, as the reorderable's `handle` option places it. A finger
 *   held still on it drags it, and so does a pen where the primary pointer is
 *   coarse. A mouse, or a pen where it is fine, drags it at once. It is also a
 *   toggle (`aria-pressed`): a click, Space or Enter turns its row's reorder
 *   mode on and off. The row name serves a row without one, and the style a
 *   row that has one
 * @position Part of the reorder machinery that createReorderable carries.
 *   ListItem renders it, from the List's context, in each row that can move.
 *   Its row and list layout come with it, so a List without `reorderable`
 *   loads none of them
 *
 * On iOS 26.2 (measured), a finger held still on a table's reorder control
 * for the scroll view's content-touch delay (150 ms) claims the drag. A flick
 * that starts on it scrolls the table instead. So until the claim, the handle
 * leaves the browser everything but double-tap zoom (`manipulation`). That
 * `touch-action` applies only where the primary pointer is coarse. Elsewhere
 * a finger gets the browser's defaults until the hold claims it. The handle
 * is the one element the reorder adds to a row. It is its grip alone: the
 * theme's `list-reorder-handle` icon, by default `drag`, hidden from
 * assistive technology. An invisible target of at least 24 px surrounds the
 * grip. The handle listens to nothing itself. The session's listeners take
 * its drags. Its keys go through React's.
 *
 * SYNC: When modified, update List/listReorderEngine.tsx and
 * List/ListItem.tsx.
 */

import {
  use,
  useRef,
  useSyncExternalStore,
  useId,
  type KeyboardEvent,
} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {useMergedRefs} from '../hooks/useMergedRefs';
import * as stylex from '@stylexjs/stylex';
import type {StyleXStyles} from '@stylexjs/stylex';
import {
  colorVars,
  focusVars,
  spacingVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {
  ownRingContainerStyles,
  ownRingProps,
} from '../privateAttributes/ownRing.stylex';
import {listReorderHandleProps} from '../privateAttributes/listReorder.stylex';
import {reorderingHandleStyles} from '../privateAttributes/reordering.stylex';
import {reorderLineStyles} from '../privateAttributes/reorderLine.stylex';
import {useTouchHitArea, type TouchHitAreaOptions} from '../utils/touchHitArea';
import {
  centeredGrowth,
  MIN_TOUCH_TARGET,
  type HitInsets,
  type HitRect,
} from '../utils/hitArea';
import {touchHitAreaStyles} from '../internal/touchHitArea.stylex';
import {reorderHandle} from '../internal/reorderHandle.stylex';
import {styles as revealStyles} from '../hooks/containerReveal.stylex';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/List/ListReorderHandle.generated';
import {ComponentIcon} from '../Icon/ComponentIcon';
import {getNodeText} from '../utils/getNodeText';
import {ItemLabelContext} from '../Item/ItemLabelContext';
import {ListContext} from './ListContext';
import type {
  ListReorderHandleProps,
  ListReorderRowNameProps,
  ReorderListFacts,
  ReorderRowFacts,
  ReorderRowLayout,
} from './listReorderContext';
import type {
  ListReorderController,
  ListReorderHandleName,
} from './listReorderEngine';

registerEnglishFallback(english);

/** The grip a handle draws when the theme maps nothing to its slot. */
const REORDER_GRIP_FALLBACK = {icon: 'drag', size: 'sm'} as const;
// The grip's box, and how far its target reaches past it, for a fine pointer
// (at least the WCAG 2.5.8 minimum) and for a finger. A finger's target is a
// coarse-only hit layer, clamped so it never takes from a neighbour or
// reaches past its list (utils/hitArea.ts, `reorderHandleGrowth`). A theme's
// slot size changes only the icon, which stays centred on the box.
const GRIP = reorderHandle.grip;
const TARGET_REACH = reorderHandle.targetReach;
const TOUCH_REACH = reorderHandle.touchReach;
/**
 * The handle stays clear of the row's inline end by its target's reach, less
 * the row's own inset. So a list that clips never cuts its target or ring.
 * Under a coarse pointer, the finger's target reaches further.
 */
const INSET = 'var(--_item-inset-inline, 0px)';
const EDGE_GUARD = `max(0px, calc(${TARGET_REACH} - ${INSET}))`;
const TOUCH_EDGE_GUARD = `max(0px, calc(${TOUCH_REACH} - ${INSET}))`;
/**
 * How far a hanging handle sits outside its row's content: its grip, then
 * the row's gap. So its focus ring keeps the same space from the content as
 * a handle that always shows.
 */
const HANG = `calc(${GRIP} + ${spacingVars['--spacing-2']})`;
const COARSE = '@media (pointer: coarse)';

/**
 * A finger's target grows toward 44 px, centred on the grip, but it stays
 * inside its list on the block axis. On the first and last rows, a control
 * right against the list's top or bottom edge then keeps its taps, as it does
 * next to the rows' own targets. `toLayout` maps a client rect to
 * the handle's layout px.
 */
export function reorderHandleGrowth(
  target: HitRect,
  toLayout: (rect: HitRect) => HitRect,
  element: HTMLElement,
): HitInsets {
  const full = centeredGrowth(target, MIN_TOUCH_TARGET);
  const list = element.closest('ul, ol');
  if (list == null) {
    return full;
  }
  const {top, bottom, left, right} = list.getBoundingClientRect();
  const box = toLayout({top, bottom, left, right});
  return {
    ...full,
    top: Math.max(0, Math.min(full.top, target.top - box.top)),
    bottom: Math.max(0, Math.min(full.bottom, box.bottom - target.bottom)),
  };
}

const HANDLE_HIT_AREA: TouchHitAreaOptions = {growth: reorderHandleGrowth};

const styles = stylex.create({
  handle: {
    // Centred on its row: the grip alone, so a compact row stays compact.
    // The box keeps its size; a larger icon overflows it evenly.
    position: 'relative',
    alignSelf: 'center',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    inlineSize: GRIP,
    blockSize: GRIP,
    padding: 0,
    borderWidth: 0,
    borderRadius: 4,
    backgroundColor: 'transparent',
    // The ring's outer edge is the target's edge, clear of the grip.
    outlineOffset: {
      default: '0',
      ':focus-visible': `calc(${TARGET_REACH} - ${focusVars['--focus-outline-width']})`,
    },
    // The target: an invisible square round the grip, so a pointer hits it to
    // its corners. Only reorder mode fills it (`pressed`). The fill paints
    // under the grip, inside the handle's own stacking context.
    isolation: 'isolate',
    '::before': {
      content: '""',
      position: 'absolute',
      inset: `calc(-1 * ${TARGET_REACH})`,
      zIndex: -1,
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
    // Where the primary pointer is coarse, the page keeps its scrolling and
    // its pinch-zoom until the hold claims the drag. A flick on the handle
    // scrolls, as on iOS. That is `manipulation`, what a long press leaves the
    // browser. The hold's selection lock stops text selection while the
    // finger is down, so a mouse keeps the page's selection. Where the
    // pointer is fine, a finger gets the browser's defaults.
    touchAction: {
      default: null,
      '@media (pointer: coarse)': 'manipulation',
    },
    WebkitTapHighlightColor: {
      default: null,
      '@media (pointer: coarse)': 'transparent',
    },
  },
  // Reorder mode fills the target, as a pressed toggle button, and rounds its
  // corners; in forced colors, the system's highlight.
  pressed: {
    '::before': {
      borderRadius: 4,
      backgroundColor: {
        default: colorVars['--color-overlay-pressed'],
        '@media (forced-colors: active)': 'Highlight',
      },
      forcedColorAdjust: 'none',
    },
  },
  // Presses on the grip land on the handle.
  grip: {
    pointerEvents: 'none',
  },
  // In its place at the row's end, after the row's content or in its end
  // slot, clear of the row's edge.
  endInRow: {
    marginInlineEnd: {default: EDGE_GUARD, [COARSE]: TOUCH_EDGE_GUARD},
  },
  // In its place at the row's start, clear of the row's edge.
  startInRow: {
    marginInlineStart: {default: EDGE_GUARD, [COARSE]: TOUCH_EDGE_GUARD},
  },
  // Where it shows only on hover or focus (a fine primary pointer), it hangs
  // outside the row's content. It takes no width, so the content keeps its
  // place, and the row's gap stays between the handle and the content. Under
  // a coarse pointer it always shows, so it takes its place in the row.
  hangAtStart: {
    marginInlineStart: {
      default: `calc(-1 * ${HANG})`,
      [COARSE]: TOUCH_EDGE_GUARD,
    },
  },
  hangAtEnd: {
    marginInlineStart: {default: 0, [COARSE]: 'auto'},
    marginInlineEnd: {
      default: `calc(-1 * ${HANG})`,
      [COARSE]: TOUCH_EDGE_GUARD,
    },
  },
  // Shown while its row is hovered or holds the focus (the row is the reveal
  // container), and always in reorder mode. It keeps its tab stop while
  // hidden. A disabled row dims its label and end content to half. The
  // handle is outside them, so it dims itself to match.
  reveal: {
    opacity: {
      default: 'var(--_reveal-opacity, 1)',
      ':is([aria-pressed="true"])': 1,
      ':is([aria-disabled="true"])': 'calc(0.5 * var(--_reveal-opacity, 1))',
    },
  },
  // Shown outside an end slot, and outside the label: it dims itself as the
  // row does.
  shown: {
    opacity: {
      default: 1,
      ':is([aria-disabled="true"])': 0.5,
    },
  },
  // The row's own child, in a row without end content. It ends the row, as
  // the end slot would. It aligns as the row's `align` would align that slot.
  // A hanging handle keeps its give-back instead: the row's content, which
  // grows, already ends the row.
  inRow: {
    marginInlineStart: 'auto',
  },
  // `start`: at the top of the row's content.
  inRowStart: {
    alignSelf: 'flex-start',
  },
  // `first-line`: centred on the label's first line, a line of body text at
  // the top of the row's content. Item's first-line slots centre on it too.
  inRowFirstLine: {
    alignSelf: 'flex-start',
    marginBlockStart: `calc((${typeScaleVars['--text-body-leading']} - ${GRIP}) / 2)`,
  },
});

/**
 * The style of a row that ends with a handle, which ListItem applies. Its
 * ring on focus within stays off for the handle, which rings itself.
 */
export const reorderRowStyle = ownRingContainerStyles.focusWithin;

/** The insertion line's thickness, px (the engine centres it on a gap). */
export const INSERTION_LINE_THICKNESS = 2;

const listStyles = stylex.create({
  // The insertion line is the list's own pseudo-element. It is decoration
  // with no semantic role, so no element joins the list. The engine shows it
  // with `showReorderLine` and places it with the list's custom properties.
  // They set its top (`--astryx-reorder-line-y`, a compositor translate) and
  // its inline start and size, which are the dragged row's.
  list: {
    '::after': {
      content: '""',
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
export const reorderListStyle = [listStyles.list, reorderLineStyles.list];

// The list publishes, for its rows: whether their handles take a place in
// them (`--_reorder-shown`, 1 or 0), and how far a handle's target reaches
// past its grip (`--_reorder-reach`). A bleeding list also publishes its
// container's start padding. A row computes its handle room from these and
// its own inset, so every room is one class.
const LIST_REACH = TARGET_REACH;
const LIST_TOUCH_REACH = TOUCH_REACH;
// The room a hanging handle needs beside a row's text: the hang, then its
// target's reach past it, which holds its focus ring. SYNC: Lab ListInput's
// and TransferList's hanging room.
const GUTTER = `calc(${HANG} + ${TARGET_REACH})`;
// A padded row's own inset holds part of that room. SYNC: Item/Item.tsx.
const PADDED_ROOM = `calc(${GUTTER} - ${spacingVars['--spacing-2']})`;
const SPACIOUS_ROOM = `calc(${GUTTER} - ${spacingVars['--spacing-3']})`;
const FLUSH_ROOM = GUTTER;
// As much of each room as the container's padding holds. Outside a container
// that publishes its padding, none: the rows move in by the whole room, and
// no handle reaches past the list's host.
const PADDED_REACH = `min(${PADDED_ROOM}, var(--container-padding-inline-start, 0px))`;
const SPACIOUS_REACH = `min(${SPACIOUS_ROOM}, var(--container-padding-inline-start, 0px))`;
const FLUSH_REACH = `min(${FLUSH_ROOM}, var(--container-padding-inline-start, 0px))`;
const PADDED_REACH_END = `min(${PADDED_ROOM}, var(--container-padding-inline-end, 0px))`;
const SPACIOUS_REACH_END = `min(${SPACIOUS_ROOM}, var(--container-padding-inline-end, 0px))`;
const FLUSH_REACH_END = `min(${FLUSH_ROOM}, var(--container-padding-inline-end, 0px))`;

const listLayoutStyles = stylex.create({
  reach: {
    '--_reorder-reach': {default: LIST_REACH, [COARSE]: LIST_TOUCH_REACH},
  },
  shown: {
    '--_reorder-shown': '1',
  },
  shownWhenCoarse: {
    '--_reorder-shown': {default: '0', [COARSE]: '1'},
  },
  bleed: {
    '--_reorder-bleed-start': 'var(--container-padding-inline-start, 0px)',
  },
  // Where handles show only on hover or focus, they hang outside their rows'
  // text. The list pads that room on the handles' side and reaches out into
  // its container's padding by as much of it as the padding holds. So its
  // inline clip keeps the handles, a clipping container never cuts them, and
  // the rows move in only by the room the padding lacks. Under a coarse
  // pointer the handles sit in their rows.
  gutterPadded: {
    marginInlineStart: {
      default: `calc(-1 * ${PADDED_REACH})`,
      [COARSE]: 0,
    },
    paddingInlineStart: {default: PADDED_ROOM, [COARSE]: 0},
  },
  gutterSpacious: {
    marginInlineStart: {
      default: `calc(-1 * ${SPACIOUS_REACH})`,
      [COARSE]: 0,
    },
    paddingInlineStart: {default: SPACIOUS_ROOM, [COARSE]: 0},
  },
  gutterFlush: {
    marginInlineStart: {
      default: `calc(-1 * ${FLUSH_REACH})`,
      [COARSE]: 0,
    },
    paddingInlineStart: {default: FLUSH_ROOM, [COARSE]: 0},
  },
  gutterPaddedAtEnd: {
    marginInlineEnd: {
      default: `calc(-1 * ${PADDED_REACH_END})`,
      [COARSE]: 0,
    },
    paddingInlineEnd: {default: PADDED_ROOM, [COARSE]: 0},
  },
  gutterSpaciousAtEnd: {
    marginInlineEnd: {
      default: `calc(-1 * ${SPACIOUS_REACH_END})`,
      [COARSE]: 0,
    },
    paddingInlineEnd: {default: SPACIOUS_ROOM, [COARSE]: 0},
  },
  gutterFlushAtEnd: {
    marginInlineEnd: {
      default: `calc(-1 * ${FLUSH_REACH_END})`,
      [COARSE]: 0,
    },
    paddingInlineEnd: {default: FLUSH_ROOM, [COARSE]: 0},
  },
});

const gutters = {
  padded: listLayoutStyles.gutterPadded,
  spacious: listLayoutStyles.gutterSpacious,
  flush: listLayoutStyles.gutterFlush,
};
const guttersAtEnd = {
  padded: listLayoutStyles.gutterPaddedAtEnd,
  spacious: listLayoutStyles.gutterSpaciousAtEnd,
  flush: listLayoutStyles.gutterFlushAtEnd,
};

// A handle's place in its row: its distance from the row's edge, its grip,
// and the row's gap after it. A row reads the list's published values.
const ROW_GUARD =
  'max(0px, calc(var(--_reorder-reach, 4px) - var(--_item-inset-inline)))';
const ROW_ROOM = `calc(${ROW_GUARD} + ${GRIP} + ${spacingVars['--spacing-2']})`;

const rowRoomStyles = stylex.create({
  // A row that stays put keeps the place its neighbours' handles take at
  // their start, while they take one: always, or under a coarse pointer.
  atStart: {
    paddingInlineStart: `calc(max(var(--_reorder-bleed-start, 0px), var(--_item-inset-inline)) + var(--_reorder-shown, 1) * ${ROW_ROOM})`,
  },
  // After a list marker the handles always take their place. Item pads the
  // content after the marker by this room.
  afterMarker: {
    '--_item-marker-room': ROW_ROOM,
  },
});

/** A row with a handle that shows only on hover or focus reveals it. */
const revealingRowStyle = [
  ownRingContainerStyles.focusWithin,
  revealStyles.container,
] as StyleXStyles;

/**
 * Where a List row's handle sits, and the row's own style for it: the
 * session's `rowLayout`.
 */
export function reorderRowLayout({
  edge,
  handle,
  hasHandle,
  hasMarker,
  hasEndContent,
}: ReorderRowFacts): ReorderRowLayout {
  const isAtStart = handle?.placement === 'start';
  const isAlwaysVisible = (handle?.revealBehavior ?? 'always') === 'always';
  // A handle cannot hang after a list marker, which it would cover, or in a
  // row that reaches the container's padding edge, where nothing keeps it.
  const isAfterMarker = isAtStart && hasMarker;
  const isInRow = isAfterMarker || edge === 'outset' || edge === 'bleed';
  return {
    placement: isAtStart ? 'start' : 'end',
    isAlwaysVisible,
    isInRow,
    isInEndSlot: !isAtStart && isAlwaysVisible && hasEndContent,
    rowStyle: (hasHandle
      ? isAlwaysVisible
        ? reorderRowStyle
        : revealingRowStyle
      : isAfterMarker
        ? rowRoomStyles.afterMarker
        : isAtStart
          ? rowRoomStyles.atStart
          : null) as StyleXStyles,
  };
}

/**
 * The List's own style while it reorders: the session's `listLayout`.
 */
export function reorderListLayout({
  edge,
  density,
  handle,
  hasMarkers,
}: ReorderListFacts): StyleXStyles {
  const isAtStart = handle?.placement === 'start';
  const isAlwaysVisible = (handle?.revealBehavior ?? 'always') === 'always';
  // Rows that reach the container's padding, and rows after a marker, keep
  // their handles in the rows, so the list keeps no room for them.
  // Under `outset` and `bleed` the handles sit in their rows, so a row that
  // stays put keeps their room whenever they show.
  const sitsInRows = isAlwaysVisible || edge === 'outset' || edge === 'bleed';
  const hangs = !sitsInRows && !(isAtStart && hasMarkers);
  const room =
    edge === 'flush' ? 'flush' : density === 'spacious' ? 'spacious' : 'padded';
  return [
    reorderListStyle,
    listLayoutStyles.reach,
    sitsInRows ? listLayoutStyles.shown : listLayoutStyles.shownWhenCoarse,
    edge === 'bleed' && listLayoutStyles.bleed,
    hangs && (isAtStart ? gutters : guttersAtEnd)[room],
  ] as StyleXStyles;
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
  placement = 'end',
  isAlwaysVisible = true,
  isInRow = false,
  isInEndSlot = false,
}: ListReorderHandleProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const isAtEnd = placement === 'end';
  const hangs = !isAlwaysVisible && !isInRow;
  const t = useComponentTranslator();
  const controller = use(ListContext)?.reorder?.session as
    ListReorderController | undefined;
  // The row's label element, when the handle sits in an Item's slot.
  const labelID = use(ItemLabelContext);
  const verbID = useId();
  const text = getNodeText(label).replace(/\s+/g, ' ').trim();
  // Named "Reorder" followed by the row's name: the name
  // its caller gave the row. Else the elements that name the row (its
  // caller's `aria-labelledby`, or the label element Item renders), so a
  // label of any shape names it. Outside an Item, the label's text. A row
  // that shows no name is named after its place.
  const callerLabel = rowLabel?.trim() || null;
  const labelledBy =
    callerLabel != null ? undefined : (rowLabelledBy ?? labelID ?? undefined);
  const named = callerLabel != null || labelledBy != null || text !== '';
  const verb = t('@astryx.list.reorderHandleVerb');
  // Named by Item's label element only while it shows a name: a label of an
  // unnamed icon alone falls back to the place.
  const byLabel = labelID != null && labelledBy === labelID;
  // Syncs the handle into the reorder session, which lives outside React. The
  // session moves the row only with its handle recorded, and reports its
  // moves with the row's key.
  useIsomorphicLayoutEffect(
    () => controller?.registerHandle(ref.current, itemKey),
    [controller, itemKey],
  );
  // Syncs the row's name into the session, which announces the moves with
  // it. A new name keeps the handle recorded, so its row stays in reorder
  // mode. A component label's text is read from its element, rendered by now.
  // The session also reads, from the DOM, whether the label element names the
  // row and where the row sits, for the handle's name.
  useIsomorphicLayoutEffect(() => {
    const handle = ref.current;
    const spoken =
      callerLabel ??
      (text !== '' ? text : labelTextOf(handle, labelID ?? null));
    const unname = controller?.registerName(handle, spoken);
    const unlabel = controller?.registerHandleLabel(
      handle,
      byLabel ? (labelID ?? null) : null,
      named,
    );
    return () => {
      unname?.();
      unlabel?.();
    };
  }, [controller, callerLabel, text, labelID, byLabel, named]);
  const shown = useSyncExternalStore(
    controller?.subscribeHandleNames ?? subscribeNothing,
    () => controller?.handleNameOf(ref.current) ?? UNREAD_HANDLE_NAME,
    () => UNREAD_HANDLE_NAME,
  );
  const isPressed = useSyncExternalStore(
    controller?.subscribeMode ?? subscribeNothing,
    () => controller?.isInMode(ref.current) ?? false,
    () => false,
  );
  const isEnabled = controller != null && !isDisabled;
  // A finger's target: the shared touch hit area grows the handle's hit
  // layer where the primary pointer is coarse.
  const hitAreaRef = useTouchHitArea(true, HANDLE_HIT_AREA);
  const handleRef = useMergedRefs(ref, hitAreaRef);
  // A handle that stops taking gestures mid-drag sends a drag of its row
  // home, whichever pointer or key drives it. Its row may be disabled or no
  // longer reorderable, or the handle may be gone.
  useIsomorphicLayoutEffect(() => {
    const handle = ref.current;
    if (!isEnabled || controller == null) {
      return undefined;
    }
    return () => controller.release(handle);
  }, [controller, isEnabled]);
  if (controller == null) {
    return null;
  }
  // A label element that shows no name falls back to the row's place.
  const labelShowsName = byLabel && !shown.labelShowsNoName;
  const byPlace = byLabel ? !labelShowsName : !named;
  const shownLabelledBy = byLabel && !labelShowsName ? undefined : labelledBy;
  // Named through the label element. The handle's own `aria-label` is the
  // verb. It lists itself first in its `aria-labelledby`, which reads its
  // `aria-label` there: "Reorder", then the row's label.
  const name =
    byPlace && shown.position != null
      ? t('@astryx.list.reorderHandleAt', {position: shown.position})
      : callerLabel != null
        ? t('@astryx.list.reorderHandle', {label: callerLabel})
        : labelledBy != null
          ? verb
          : text !== ''
            ? t('@astryx.list.reorderHandle', {label: text})
            : undefined;
  return (
    <button
      ref={handleRef}
      id={shownLabelledBy == null ? undefined : verbID}
      type="button"
      {...listReorderHandleProps}
      // The handle takes its own press, so the row does not highlight under
      // it (it paints nothing itself).
      data-astryx-pressable=""
      // It rings itself: the row's focus-within ring stays off for it.
      {...ownRingProps}
      aria-label={name}
      aria-labelledby={
        shownLabelledBy == null ? undefined : `${verbID} ${shownLabelledBy}`
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
      // A hold on the handle picks the row up. Only a hold elsewhere on the
      // row opens the row's menu. A menu around the row never starts its long
      // press from the handle, and a finger's long press there sends it no
      // context request. A mouse's right click on the handle still reaches it.
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
        reorderingHandleStyles.cursor,
        touchHitAreaStyles.layer,
        isPressed && styles.pressed,
        isAlwaysVisible
          ? !isInEndSlot && styles.shown
          : [revealStyles.revealLayoutPreserved, styles.reveal],
        hangs
          ? isAtEnd
            ? styles.hangAtEnd
            : styles.hangAtStart
          : isAtEnd
            ? styles.endInRow
            : styles.startInRow,
        rowAlign != null && isAtEnd && !hangs && styles.inRow,
        rowAlign === 'start' && styles.inRowStart,
        rowAlign === 'first-line' && styles.inRowFirstLine,
      )}>
      <ComponentIcon
        slot="list-reorder-handle"
        state={undefined}
        fallback={REORDER_GRIP_FALLBACK}
        color="inherit"
        xstyle={styles.grip}
      />
    </button>
  );
}

ListReorderHandle.displayName = 'ListReorderHandle';

const subscribeNothing = () => () => {};

/**
 * A handle's name before the session reads it: its server snapshot, and the
 * session's answer for a handle it has not read. One object keeps the
 * snapshot through hydration and the first read.
 */
export const UNREAD_HANDLE_NAME: ListReorderHandleName = {
  position: null,
  labelShowsNoName: false,
};

/**
 * Names a reorderable List's row that has no handle, for the announcements
 * of the moves beside it. That is a row that stays, or one without an item
 * key. Renders nothing.
 */
export function ListReorderRowName({row, label}: ListReorderRowNameProps) {
  const controller = use(ListContext)?.reorder?.session as
    ListReorderController | undefined;
  const text = getNodeText(label).replace(/\s+/g, ' ').trim();
  // Syncs the row's name into the reorder session, which lives outside React.
  useIsomorphicLayoutEffect(
    () => controller?.registerName(row.current, text),
    [controller, row, text],
  );
  return null;
}

ListReorderRowName.displayName = 'ListReorderRowName';
