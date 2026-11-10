// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ContextMenuLift.ts
 * @input The trigger element, the lift module (liftFromTrigger/), the
 *   context-menu constants and springs, the app's layer inset (LayerProvider),
 *   the theme's surface color, container radius and spacing
 * @output useContextMenuLift: lift() and drop() for UIKit's lifted preview
 *   over a tinted page, and the menu's entrance beside it. A trigger that
 *   shows no surface of its own lifts on a plate of the theme's surface
 * @position The lift presentation of ContextMenu's touch invocation, run by
 *   the touch layer (ContextMenuTouchLayer.tsx). ContextMenu.tsx places the
 *   menu beside the lifted trigger.
 *
 * SYNC: When modified, update /packages/core/src/ContextMenu/ContextMenu.tsx
 */

import {use, useMemo, useRef, type RefObject} from 'react';
import {LayerContext, type LayerInset} from '../Layer/LayerContext';
import type {
  LiftFromTriggerMotion,
  LiftFromTriggerResult,
} from '../liftFromTrigger/liftFromTrigger';
import {useLiftFromTrigger} from '../liftFromTrigger/useLiftFromTrigger';
import type {MorphRect} from '../motion/rectMorph';
import {contextMenu} from '../motion/uikit/contextMenu';
import {
  CONTEXT_MENU_DISMISS_SPRING,
  CONTEXT_MENU_LIFT_SPRING,
  CONTEXT_MENU_MORPH_SPRING,
} from '../motion/uikit/springs';
import {liftContextMenuTrigger} from '../privateAttributes/contextMenuLift.stylex';
import {colorVars, radiusVars, spacingVars} from '../theme/tokens.stylex';

/** A computed color's alpha: 0 when it paints nothing, 1 when it names none. */
function alphaOf(color: string): number {
  if (color === '' || color === 'transparent') {
    return 0;
  }
  const slash = /\/\s*([\d.]+)(%?)\s*\)$/.exec(color);
  if (slash != null) {
    return Number(slash[1]) / (slash[2] === '%' ? 100 : 1);
  }
  const comma = /rgba?\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/.exec(color);
  return comma == null ? 1 : Number(comma[1]);
}

/** A fill this opaque hides the tint behind it. */
const OPAQUE_ALPHA = 0.9;

/** Elements whose content is their own surface: a picture, a canvas. */
const SURFACE_ELEMENTS = 'img, picture, video, canvas, svg, iframe';

function fills(style: CSSStyleDeclaration): boolean {
  return (
    (style.backgroundImage !== 'none' && style.backgroundImage !== '') ||
    alphaOf(style.backgroundColor) >= OPAQUE_ALPHA
  );
}

/** Whether the element, or a pseudo-element over its whole box, fills it. */
function fillsItsBox(element: Element): boolean {
  if (element.matches(SURFACE_ELEMENTS) || fills(getComputedStyle(element))) {
    return true;
  }
  return ['::before', '::after'].some(pseudo => {
    const style = getComputedStyle(element, pseudo);
    return (
      style.content !== 'none' &&
      style.content !== 'normal' &&
      style.position === 'absolute' &&
      [style.top, style.right, style.bottom, style.left].every(
        side => side === '0px',
      ) &&
      fills(style)
    );
  });
}

/**
 * The union of the boxes the trigger shows, in client px. Empty line space
 * below an inline box is not part of it. A box of a pixel or less, such as
 * the cursor anchor, does not count.
 */
function shownBox(trigger: HTMLElement): DOMRect | null {
  const range = trigger.ownerDocument.createRange();
  range.selectNodeContents(trigger);
  if (typeof range.getClientRects !== 'function') {
    return null;
  }
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const rect of Array.from(range.getClientRects())) {
    if (rect.width > 1 && rect.height > 1) {
      left = Math.min(left, rect.left);
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
    }
  }
  return right > left && bottom > top
    ? new DOMRect(left, top, right - left, bottom - top)
    : null;
}

/** How many elements the surface search reads at most. */
const SURFACE_SEARCH_LIMIT = 64;

/**
 * Whether the trigger shows a surface of its own. That is a near-opaque fill
 * or a picture that covers all it shows, such as a card or a thumbnail. An
 * icon beside a row's text covers part of it, so the row has none.
 */
function showsOwnSurface(trigger: HTMLElement): boolean {
  // Without line boxes to read, the trigger's own box stands in.
  const shown = shownBox(trigger) ?? trigger.getBoundingClientRect();
  const covers = (element: Element) => {
    const rect = element.getBoundingClientRect();
    return (
      rect.left <= shown.left + 1 &&
      rect.top <= shown.top + 1 &&
      rect.right >= shown.right - 1 &&
      rect.bottom >= shown.bottom - 1
    );
  };
  // Only an element that covers all the trigger shows can be its surface.
  const queue: Element[] = [trigger];
  for (let read = 0; queue.length > 0 && read < SURFACE_SEARCH_LIMIT; read++) {
    const element = queue.shift() as Element;
    if (covers(element)) {
      if (fillsItsBox(element)) {
        return true;
      }
      queue.push(...Array.from(element.children));
    }
  }
  return false;
}

const SURFACE = colorVars['--color-background-surface'];
const PLATE_INSET = spacingVars['--spacing-2'];
const CORNERS = [
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius',
] as const;

/**
 * UIKit lifts a table cell on its own opaque background, inside the cell's
 * own margins. A trigger that shows no surface of its own lifts on the
 * theme's surface instead. An outline of the same color reaches past its box
 * on every side, so its content keeps a margin, with the container radius
 * outside. The lift pins these with its own styles and puts them back with
 * them.
 */
function plateFor(trigger: HTMLElement): Readonly<Record<string, string>> {
  const computed = getComputedStyle(trigger);
  const isSquare = CORNERS.every(
    corner => (parseFloat(computed.getPropertyValue(corner)) || 0) === 0,
  );
  const inner = `max(0px, calc(${radiusVars['--radius-container']} - ${PLATE_INSET}))`;
  return {
    'background-color': SURFACE,
    'outline-style': 'solid',
    'outline-width': PLATE_INSET,
    'outline-color': SURFACE,
    'outline-offset': '0px',
    ...(isSquare
      ? Object.fromEntries(CORNERS.map(corner => [corner, inner]))
      : null),
  };
}

/**
 * The trigger lifts and the tint rises on `springs.contextMenuLift`. The menu
 * enters on `springs.contextMenuMorph`. The return and the tint's clear are
 * part of the exit, on `springs.contextMenuDismiss`.
 */
const MOTION: LiftFromTriggerMotion = {
  lift: CONTEXT_MENU_LIFT_SPRING,
  drop: CONTEXT_MENU_DISMISS_SPRING,
  clear: CONTEXT_MENU_DISMISS_SPRING,
  surfaceIn: CONTEXT_MENU_MORPH_SPRING,
  surfaceOut: CONTEXT_MENU_MORPH_SPRING,
};

export interface ContextMenuLift {
  /**
   * Lifts the trigger from `from`, client px: where the press feedback left
   * it. `release` runs after the lift reads the page and before it writes.
   * `onLayerShown` runs once the layer shows, before the trigger lifts into
   * it. Returns where it landed, or null without the popover API.
   */
  lift(
    from: MorphRect,
    release: () => void,
    onLayerShown?: (lifted: LiftFromTriggerResult) => void,
  ): LiftFromTriggerResult | null;
  /** The menu's entrance beside the lifted trigger: it fades in. */
  enterMenu(menu: HTMLElement): void;
  /** Returns the trigger to its place. */
  drop(): void;
}

export function useContextMenuLift(
  triggerRef: RefObject<HTMLElement | null>,
  onBackdropTap: () => void,
): ContextMenuLift {
  const lift = useLiftFromTrigger();
  const onBackdropTapRef = useRef(onBackdropTap);
  onBackdropTapRef.current = onBackdropTap;
  // The app's declared inset, which the gutter adds.
  const layerInsetRef = useRef<LayerInset | undefined>(undefined);
  layerInsetRef.current = use(LayerContext)?.inset;
  return useMemo(
    () => ({
      lift(from, release, onLayerShown) {
        const trigger = triggerRef.current;
        if (trigger == null) {
          return null;
        }
        // Read before the lift writes.
        const plate = showsOwnSurface(trigger) ? undefined : plateFor(trigger);
        const lifted = liftContextMenuTrigger(lift, trigger, {
          motion: MOTION,
          scale: {
            maxScale: contextMenu.lift.maxScale,
            scaleUpPoints: contextMenu.lift.scaleUpPoints,
          },
          from,
          release,
          onLayerShown,
          pin: plate,
          inset: layerInsetRef.current,
          onBackdropTap: () => onBackdropTapRef.current(),
        });
        return lifted;
      },
      enterMenu(menu) {
        lift.presentSurface(menu, null);
      },
      drop() {
        lift.drop();
      },
    }),
    [lift, triggerRef],
  );
}
