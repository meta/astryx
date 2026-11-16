// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ListReorderHandle.tsx
 * @input The List's reorder session (List/listReorderEngine.tsx, through
 *   ListContext's `reorder`), the translator, theme tokens and the theme's
 *   `list-reorder-handle` icon slot
 * @output `ListReorderHandle`, `ListReorderRowName`, `reorderRowStyle`,
 *   `reorderGutterStyle`, `reorderRoomStyle` and `UNREAD_HANDLE_NAME`. The handle starts or ends a reorderable List row,
 *   as the reorderable's `handle` option places it. A finger
 *   held still on it drags it, and so does a pen where the primary pointer is
 *   coarse. A mouse, or a pen where it is fine, drags it at once. It is also a
 *   toggle (`aria-pressed`): a click, Space or Enter turns its row's reorder
 *   mode on and off. The row name serves a row without one, and the style a
 *   row that has one
 * @position Part of the reorder machinery that createReorderable carries.
 *   ListItem renders it, from the List's context, in each row that can move.
 *   Unless it always shows, it shows while its row is hovered or holds the
 *   focus, and always under a coarse pointer
 *
 * On iOS 26.2 (measured), a finger held still on a table's reorder control
 * for the scroll view's content-touch delay (150 ms) claims the drag. A flick
 * that starts on it scrolls the table instead. So until the claim, the handle
 * leaves the browser everything but double-tap zoom (`manipulation`). That
 * `touch-action` applies only where the primary pointer is coarse. Elsewhere
 * a finger gets the browser's defaults until the hold claims it. The handle
 * is the one element the reorder adds to a row. Its grip is the theme's
 * `list-reorder-handle` icon, by default the `drag` icon. It is hidden from
 * assistive technology. The handle listens to
 * nothing itself. The session's listeners take its drags. Its keys go
 * through React's.
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
import {useTouchHitArea} from '../utils/touchHitArea';
import {touchHitAreaStyles} from '../internal/touchHitArea.stylex';
import {styles as revealStyles} from '../hooks/containerReveal.stylex';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/List/ListReorderHandle.generated';
import {Icon} from '../Icon/Icon';
import type {IconVariant} from '../Icon/index';
import {useComponentIcon} from '../Icon/useIcon';
import {getNodeText} from '../utils/getNodeText';
import {ItemLabelContext} from '../Item/ItemLabelContext';
import {
  ListContext,
  type ListContextValue,
  type ListDensity,
  type ListEdge,
} from './ListContext';
import type {
  ListReorderHandleProps,
  ListReorderOptions,
  ListReorderRowNameProps,
} from './listReorderContext';
import type {
  ListReorderController,
  ListReorderHandleName,
} from './listReorderEngine';

registerEnglishFallback(english);

/**
 * The handle's side, for every pointer: a small control's size. A finger's
 * 44 px target is an invisible coarse-only hit layer, clamped so it never
 * takes from a neighbour (utils/hitArea.ts), not a bigger handle.
 */
const HANDLE_SIZE = 28;
/** The grip's side, the `sm` icon size: the handle's share of its row's height. */
const GRIP_SIZE = '1rem';
/**
 * How far a hanging handle sits outside its row's content, px: its own side
 * and a small clearance. The grip's edge then sits 8 px from the content.
 * SYNC: lab ListInput/ListInput.tsx and TransferList/TransferList.tsx
 * REORDER_HANDLE_HANG, which lay out around it.
 */
const REORDER_HANDLE_HANG = HANDLE_SIZE + 2;
/** The hanging handle's inner margin: it gives back the row's gap. */
const HANG_GIVE_BACK = `calc(${REORDER_HANDLE_HANG - HANDLE_SIZE}px - ${spacingVars['--spacing-2']})`;
/** How far a handle at the row's end reaches into the row's inline inset. */
const END_REACH = 'calc(-1 * min(8px, var(--_item-inset-inline, 8px)))';

/** The grip when the theme maps nothing to `list-reorder-handle`. */
const GRIP_FALLBACK = {icon: 'drag', size: 'sm'} as const;

const styles = stylex.create({
  handle: {
    // Centred on its row, with the grip in its middle. It takes only the
    // grip's height in the row's layout (the negative block margins). So a
    // compact row stays compact. The handle and its focus ring reach past
    // that into the row's padding, never past it.
    position: 'relative',
    alignSelf: 'center',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    marginBlock: `calc((${GRIP_SIZE} - ${HANDLE_SIZE}px) / 2)`,
    padding: 0,
    borderWidth: 0,
    borderRadius: 4,
    // The ring sits inside the handle, so a flush row's list never clips it.
    outlineOffset: {
      default: '0',
      ':focus-visible': `calc(-1 * ${focusVars['--focus-outline-width']})`,
    },
    // A bare glyph: no hover or press fill of its own. Only reorder mode
    // fills it, as a pressed toggle button; in forced colors, the system's
    // highlight.
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
  // Where it shows only on hover or focus (a fine primary pointer), it hangs
  // outside the row's content. It takes no width, so the content keeps its
  // place. The inner margin gives back the row's gap. Under a coarse pointer
  // it always shows, so it takes its place in the row. It also takes its
  // place where hanging cannot work (`isInRow`).
  hangAtStart: {
    marginInlineStart: {
      default: -REORDER_HANDLE_HANG,
      '@media (pointer: coarse)': 0,
    },
    marginInlineEnd: {
      default: HANG_GIVE_BACK,
      '@media (pointer: coarse)': 0,
    },
  },
  hangAtEnd: {
    marginInlineStart: {
      default: HANG_GIVE_BACK,
      '@media (pointer: coarse)': 'auto',
    },
    marginInlineEnd: {
      default: -REORDER_HANDLE_HANG,
      '@media (pointer: coarse)': END_REACH,
    },
  },
  // In its place at the row's end, the handle ends the row, as an end slot
  // would. It and its focus ring reach into the row's inline inset, never
  // past it, so a flush row's handle stays inside the clip.
  inRowAtEnd: {
    marginInlineStart: 'auto',
    marginInlineEnd: END_REACH,
  },
  // Presses on the grip land on the handle.
  grip: {
    pointerEvents: 'none',
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
  shown: {
    opacity: {
      default: 1,
      ':is([aria-disabled="true"])': 0.5,
    },
  },
  // `start`: at the top of the row's content.
  inRowStart: {
    alignSelf: 'flex-start',
  },
  // `first-line`: centred on the label's first line, a line of body text at
  // the top of the row's content. Item's first-line slots centre on it too.
  // Its layout height stays the grip's height (the end margin).
  inRowFirstLine: {
    alignSelf: 'flex-start',
    marginBlockStart: `calc((${typeScaleVars['--text-body-leading']} - ${HANDLE_SIZE}px) / 2)`,
  },
});

/**
 * The style of a row that has a handle, which ListItem applies. Its
 * ring on focus within stays off for the handle, which rings itself. The row
 * is the container that reveals its handle.
 */
export const reorderRowStyle = [
  ownRingContainerStyles.focusWithin,
  revealStyles.container,
] as StyleXStyles;

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

// The room a list keeps for handles that hang outside its rows' text, which
// List applies through the session. A padded row's own inset holds part of
// that room (Item's `--_item-inset-inline`).
const PADDED_ROOM = `calc(${REORDER_HANDLE_HANG}px - ${spacingVars['--spacing-2']})`;
const SPACIOUS_ROOM = `calc(${REORDER_HANDLE_HANG}px - ${spacingVars['--spacing-3']})`;
const FLUSH_ROOM = `${REORDER_HANDLE_HANG}px`;
// As much of a room as the container's padding on that side holds. Outside
// a container that publishes its padding, none: the list's rows move in by
// the whole room, so nothing reaches past the host.
const reachOf = (room: string, side: 'start' | 'end') =>
  `min(${room}, var(--container-padding-inline-${side}, 0px))`;

// The list pads the room on the handles' side, and reaches out into its
// container's padding by as much of it as the padding holds. So its inline
// clip keeps the handles, a clipping container never cuts them, and the rows
// move in only by the room the padding lacks. Under a coarse pointer the
// handles sit in their rows.
const gutterStyles = stylex.create({
  paddedAtStart: {
    marginInlineStart: {
      default: `calc(-1 * ${reachOf(PADDED_ROOM, 'start')})`,
      '@media (pointer: coarse)': 0,
    },
    paddingInlineStart: {default: PADDED_ROOM, '@media (pointer: coarse)': 0},
  },
  spaciousAtStart: {
    marginInlineStart: {
      default: `calc(-1 * ${reachOf(SPACIOUS_ROOM, 'start')})`,
      '@media (pointer: coarse)': 0,
    },
    paddingInlineStart: {
      default: SPACIOUS_ROOM,
      '@media (pointer: coarse)': 0,
    },
  },
  flushAtStart: {
    marginInlineStart: {
      default: `calc(-1 * ${reachOf(FLUSH_ROOM, 'start')})`,
      '@media (pointer: coarse)': 0,
    },
    paddingInlineStart: {default: FLUSH_ROOM, '@media (pointer: coarse)': 0},
  },
  paddedAtEnd: {
    marginInlineEnd: {
      default: `calc(-1 * ${reachOf(PADDED_ROOM, 'end')})`,
      '@media (pointer: coarse)': 0,
    },
    paddingInlineEnd: {default: PADDED_ROOM, '@media (pointer: coarse)': 0},
  },
  spaciousAtEnd: {
    marginInlineEnd: {
      default: `calc(-1 * ${reachOf(SPACIOUS_ROOM, 'end')})`,
      '@media (pointer: coarse)': 0,
    },
    paddingInlineEnd: {default: SPACIOUS_ROOM, '@media (pointer: coarse)': 0},
  },
  flushAtEnd: {
    marginInlineEnd: {
      default: `calc(-1 * ${reachOf(FLUSH_ROOM, 'end')})`,
      '@media (pointer: coarse)': 0,
    },
    paddingInlineEnd: {default: FLUSH_ROOM, '@media (pointer: coarse)': 0},
  },
});

/**
 * The style of a reorderable list (List applies it): the room it keeps on
 * its handles' side where they hang outside its rows' text. Null where the
 * handles show in their rows: they always show, or the rows reach the
 * container's padding edge (`outset`, `bleed`).
 */
export function reorderGutterStyle(
  handle: ListReorderOptions['handle'],
  edge: ListEdge,
  density: ListDensity,
): StyleXStyles | null {
  if (
    handle?.revealBehavior !== 'adaptive' ||
    edge === 'outset' ||
    edge === 'bleed'
  ) {
    return null;
  }
  const room =
    edge === 'flush' ? 'flush' : density === 'spacious' ? 'spacious' : 'padded';
  if (handle.placement === 'start') {
    return room === 'flush'
      ? gutterStyles.flushAtStart
      : room === 'spacious'
        ? gutterStyles.spaciousAtStart
        : gutterStyles.paddedAtStart;
  }
  return room === 'flush'
    ? gutterStyles.flushAtEnd
    : room === 'spacious'
      ? gutterStyles.spaciousAtEnd
      : gutterStyles.paddedAtEnd;
}

// A row's inline padding before a handle's room: its inset, or for `bleed`
// the container's padding when that is larger (ListItem's bleed edge).
const INSET = 'var(--_item-inset-inline)';
const BLEED_START =
  'max(var(--container-padding-inline-start, 0px), var(--_item-inset-inline))';
// A handle's room in its row: its side and the row's gap after it.
const IN_ROW_ROOM = `${HANDLE_SIZE}px + ${spacingVars['--spacing-2']}`;
const COARSE = '@media (pointer: coarse)';

// The room a row that stays put keeps where its neighbours' handles start
// their rows: always, or under a coarse pointer when they show on hover.
// After a list marker, the room goes after the marker (Item's
// `--_item-marker-room`), where those handles sit whether or not they show.
const roomStyles = stylex.create({
  afterMarker: {'--_item-marker-room': `calc(${IN_ROW_ROOM})`},
  shownAtStart: {paddingInlineStart: `calc(${INSET} + ${IN_ROW_ROOM})`},
  coarseAtStart: {
    paddingInlineStart: {
      default: INSET,
      [COARSE]: `calc(${INSET} + ${IN_ROW_ROOM})`,
    },
  },
  bleedShownAtStart: {
    paddingInlineStart: `calc(${BLEED_START} + ${IN_ROW_ROOM})`,
  },
  bleedCoarseAtStart: {
    paddingInlineStart: {
      default: BLEED_START,
      [COARSE]: `calc(${BLEED_START} + ${IN_ROW_ROOM})`,
    },
  },
});

/**
 * Where the handles of a List's rows sit and when they show: its
 * reorderable's `handle`, read with the list's marker and edge.
 */
function placementIn(list: ListContextValue | null) {
  const handle = list?.reorder?.options.handle;
  const isAtEnd = handle?.placement !== 'start';
  // A handle cannot hang after a list marker, which it would cover, or in a
  // row that reaches the container's padding edge, where nothing keeps it.
  const isAfterMarker = !isAtEnd && (list?.listStyle ?? 'none') !== 'none';
  const isInRow =
    isAfterMarker || list?.edge === 'outset' || list?.edge === 'bleed';
  // Shown handles are found without hovering a row, so a List shows them
  // unless the reorderable hides them.
  const isAlwaysVisible = (handle?.revealBehavior ?? 'always') === 'always';
  return {isAtEnd, isAfterMarker, isInRow, isAlwaysVisible};
}

/**
 * The style of a reorderable List row without a handle (ListItem applies
 * it): where the handles start their rows, the room they take, so every
 * label lines up. Null where they end their rows: a row there keeps its
 * content where it is.
 */
export function reorderRoomStyle(list: ListContextValue): StyleXStyles | null {
  const {isAtEnd, isAfterMarker, isInRow, isAlwaysVisible} = placementIn(list);
  if (isAtEnd) {
    return null;
  }
  if (isAfterMarker) {
    // A custom property alone is not a StyleXStyles value; the array is.
    return [roomStyles.afterMarker] as StyleXStyles;
  }
  // Whether the handles take a place in their rows for every pointer.
  const areHandlesInRow = isAlwaysVisible || isInRow;
  if (list.edge === 'bleed') {
    return areHandlesInRow
      ? roomStyles.bleedShownAtStart
      : roomStyles.bleedCoarseAtStart;
  }
  return areHandlesInRow ? roomStyles.shownAtStart : roomStyles.coarseAtStart;
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
  isInRow: isInRowProp,
  isAlwaysVisible: isAlwaysVisibleProp,
  placement,
}: ListReorderHandleProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const t = useComponentTranslator();
  const grip = useComponentIcon(
    'list-reorder-handle',
    undefined,
    GRIP_FALLBACK,
  );
  const list = use(ListContext);
  const controller = list?.reorder?.session as
    ListReorderController | undefined;
  // A List row's handle reads its place from the list; a collection that
  // renders the handle itself passes it.
  const fromList = placementIn(list);
  const isAtEnd = placement == null ? fromList.isAtEnd : placement === 'end';
  const isInRow = isInRowProp ?? (list == null ? false : fromList.isInRow);
  const isAlwaysVisible =
    isAlwaysVisibleProp ?? (list == null ? false : fromList.isAlwaysVisible);
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
  const hitAreaRef = useTouchHitArea(true);
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
        isAlwaysVisible
          ? styles.shown
          : [revealStyles.revealLayoutPreserved, styles.reveal],
        reorderingHandleStyles.cursor,
        touchHitAreaStyles.layer,
        isAlwaysVisible || isInRow
          ? isAtEnd && styles.inRowAtEnd
          : isAtEnd
            ? styles.hangAtEnd
            : styles.hangAtStart,
        rowAlign === 'start' && styles.inRowStart,
        rowAlign === 'first-line' && styles.inRowFirstLine,
      )}>
      {grip.icon == null ? null : (
        <Icon
          icon={grip.icon}
          // Resolution keeps only a variant the active theme lists.
          variant={grip.variant as IconVariant | undefined}
          size={grip.size}
          color="inherit"
          xstyle={styles.grip}
        />
      )}
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
