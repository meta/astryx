// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ListReorderHandle.tsx
 * @input The List's reorder session (List/listReorderEngine.tsx, through
 *   ListContext's `reorder`), the translator, theme tokens and the theme's
 *   `list-reorder-handle` icon slot
 * @output `ListReorderHandle`, `ListReorderRowName`, `reorderRowStyle`,
 *   `UNREAD_HANDLE_NAME` and `reorderHandleGrowth`. The handle ends a reorderable List row. A finger
 *   held still on it drags it, and so does a pen where the primary pointer is
 *   coarse. A mouse, or a pen where it is fine, drags it at once. It is also a
 *   toggle (`aria-pressed`): a click, Space or Enter turns its row's reorder
 *   mode on and off. The row name serves a row without one, and the style a
 *   row that has one
 * @position Part of the reorder machinery that createReorderable carries.
 *   ListItem renders it, from the List's context, at the end of each row
 *   that can move
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
import {colorVars, focusVars, typeScaleVars} from '../theme/tokens.stylex';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {
  ownRingContainerStyles,
  ownRingProps,
} from '../privateAttributes/ownRing.stylex';
import {listReorderHandleProps} from '../privateAttributes/listReorder.stylex';
import {reorderingHandleStyles} from '../privateAttributes/reordering.stylex';
import {reorderLineStyles} from '../privateAttributes/reorderLine.stylex';
import {useTouchHitArea, type TouchHitAreaOptions} from '../utils/touchHitArea';
import {MIN_TOUCH_TARGET, type HitInsets, type HitRect} from '../utils/hitArea';
import {touchHitAreaStyles} from '../internal/touchHitArea.stylex';
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
} from './listReorderContext';
import type {
  ListReorderController,
  ListReorderHandleName,
} from './listReorderEngine';

registerEnglishFallback(english);

/**
 * The handle's target with a fine pointer, px: an invisible square round the
 * grip, at least the WCAG 2.5.8 minimum. A finger's 44 px target is a
 * coarse-only hit layer, clamped so it never takes from a neighbour or
 * reaches past its list (utils/hitArea.ts, `reorderHandleGrowth`).
 * SYNC: utils/hitArea.ts MIN_TOUCH_TARGET.
 */
const TARGET_SIZE = 24;
const TOUCH_TARGET_SIZE = 44;
/** The target's least reach past the grip, px, so the ring clears it. */
const TARGET_MIN_REACH = 4;
/** The grip a handle draws when the theme maps nothing to its slot. */
const REORDER_GRIP_FALLBACK = {icon: 'drag', size: 'sm'} as const;
/**
 * The grip's box: the default icon size. A theme's slot size changes only the
 * icon, which stays centred on the box. The handle's box, target, ring and
 * distance from the row's edge stay the same.
 */
const GRIP = '1rem';
/** How far the target reaches past the grip on each side. */
const TARGET_REACH = `max(${TARGET_MIN_REACH}px, (${TARGET_SIZE}px - ${GRIP}) / 2)`;
/**
 * The handle stays clear of the row's inline end by its target's reach, less
 * the row's own inset. So a list that clips never cuts its target or ring.
 * Under a coarse pointer, the finger's target reaches further.
 */
const INSET = 'var(--_item-inset-inline, 0px)';
const EDGE_GUARD = `max(0px, calc(${TARGET_REACH} - ${INSET}))`;
const TOUCH_EDGE_GUARD = `max(0px, calc((${TOUCH_TARGET_SIZE}px - ${GRIP}) / 2 - ${INSET}))`;

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
  const x = Math.max(0, (MIN_TOUCH_TARGET - (target.right - target.left)) / 2);
  const y = Math.max(0, (MIN_TOUCH_TARGET - (target.bottom - target.top)) / 2);
  const list = element.closest('ul, ol');
  if (list == null) {
    return {top: y, right: x, bottom: y, left: x};
  }
  const {top, bottom, left, right} = list.getBoundingClientRect();
  const box = toLayout({top, bottom, left, right});
  return {
    top: Math.max(0, Math.min(y, target.top - box.top)),
    right: x,
    bottom: Math.max(0, Math.min(y, box.bottom - target.bottom)),
    left: x,
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
    marginInlineEnd: {
      default: EDGE_GUARD,
      '@media (pointer: coarse)': TOUCH_EDGE_GUARD,
    },
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
  // The row's own child, in a row without end content. It ends the row, as
  // the end slot would. It aligns as the row's `align` would align that slot.
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
}: ListReorderHandleProps) {
  const ref = useRef<HTMLButtonElement>(null);
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
        rowAlign != null && styles.inRow,
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
