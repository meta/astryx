// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ContextMenuLift.tsx
 * @input The trigger element, the lift module (lift/), the context-menu
 *   constants and springs, the app's declared layer inset (LayerProvider)
 * @output Exports useContextMenuLift: lift() / drop() to show UIKit's lifted
 *   preview over a tinted backdrop and to return it to its place, and the
 *   menu's growth out of the finger beside it and its shrink back into it,
 *   on the lift module with UIKit's numbers
 * @position The lift presentation of ContextMenu's touch invocation, run by
 *   the touch layer (ContextMenuTouchLayer.tsx); ContextMenu.tsx places the
 *   menu beside the preview it lifts
 *
 * When a context menu shows on iOS 26.2, the long-pressed view lifts out of
 * the page (UIKit's preview platter): it grows on from the size the press
 * gave it to its lifted size, a shadow rising under it, above a backdrop
 * that tints the page (no blur, no zoom), and the menu grows out of the
 * finger beside it.
 * When the menu closes, it shrinks back into the finger as it fades, while
 * the view returns to its place and the backdrop and the shadow clear.
 *
 * The lift module (lift/lift.ts) plays it: the trigger itself lifts into the
 * top layer, with one placeholder holding its spot, and nothing of the lift
 * is in the DOM at rest. ContextMenu supplies UIKit's numbers: the scale rule
 * (`contextMenu.lift`), the springs as motion roles a theme may retune, the
 * tint (the theme's modal overlay, `--color-overlay`; UIKit's own is #16152A
 * at 21 %) and the shadow (the theme's `--shadow-high`; UIKit's: black at
 * 0.30, radius 20, no offset, shaped by the view's pixels). A block trigger
 * lifts; an inline one keeps the cursor menu. The menu grows out of the
 * press from `contextMenu.lift.morphStartWidth`, in its own aspect, on
 * `morphSpring` (the module's rect morph: translate, scale and opacity only,
 * so UIKit's blob and the content's blur and clip are not played).

 *
 * SYNC: When modified, update /packages/core/src/ContextMenu/ContextMenu.tsx
 * and /packages/core/src/ContextMenu/__tests__/ContextMenuLift.interaction.browser.spec.ts
 */

import {use, useMemo, useRef, type RefObject} from 'react';
import {LayerContext, type LayerInset} from '../Layer/LayerContext';
import type {LiftMotion, LiftResult} from '../lift/lift';
import {useLift} from '../lift/useLift';
import type {MorphRect} from '../motion/rectMorph';
import {
  contextMenu,
  registerContextMenuTable,
} from '../motion/uikit/contextMenu';
import {registerSpringsTable, springs} from '../motion/uikit/springs';

const LIFT = contextMenu.lift;

/**
 * The lift's springs, as measured: the preview grows and the tint fades in
 * on `springs.contextMenuLift`, the menu enters and the shadow rises and
 * fades on `morphSpring`, the preview returns on `morphSpring` while the tint
 * clears on `springs.contextMenuDismiss`.
 */
const MOTION: LiftMotion = {
  lift: springs.contextMenuLift,
  drop: LIFT.morphSpring,
  clear: springs.contextMenuDismiss,
  shadowIn: LIFT.morphSpring,
  shadowOut: LIFT.morphSpring,
  surfaceIn: LIFT.morphSpring,
  surfaceOut: LIFT.morphSpring,
};

/** Where a lift landed: the view's box, the preview's, and the viewport. */
export type ContextMenuLiftResult = LiftResult;

export interface ContextMenuLift {
  /**
   * Lift the trigger from `from` (where the press feedback left it, client
   * px; its box by default). `release` runs once the lift has read the page,
   * before it writes: the press feedback lets go there. Returns where it
   * landed, or null without the popover API.
   */
  lift(from?: MorphRect, release?: () => void): ContextMenuLiftResult | null;
  /**
   * The menu's entrance beside the lifted preview: it grows out of `press`
   * (client px) into its frame as it fades in. The lift layer takes no touch
   * until the lift and the menu settle (spec:AST-094 FR35).
   */
  morphMenu(menu: HTMLElement, press: {x: number; y: number}): void;
  /**
   * The menu is closing: its exit copy (the layer runtime's) shrinks back
   * into the finger from wherever its growth stands, with its velocity.
   * Call it while the menu still shows; a no-op when nothing is lifted.
   */
  dismissMenu(menu: HTMLElement): void;
  /** Return the preview to its place. */
  drop(): void;
}

export function useContextMenuLift(
  triggerRef: RefObject<HTMLElement | null>,
  {
    onBackdropTap,
  }: {
    /**
     * A finger lifted on the backdrop: UIKit ends the presentation at that
     * lift. (WebKit sends no mouse events for a tap on the bare backdrop, so
     * the document's outside-press handler cannot stand in.)
     */
    onBackdropTap?: () => void;
  } = {},
): ContextMenuLift {
  const lift = useLift();
  const onBackdropTapRef = useRef(onBackdropTap);
  onBackdropTapRef.current = onBackdropTap;
  // The app's declared inset (LayerProvider), which the gutter adds.
  const layerInsetRef = useRef<LayerInset | undefined>(undefined);
  layerInsetRef.current = use(LayerContext)?.inset;
  return useMemo(
    () => ({
      lift(from, release) {
        const trigger = triggerRef.current;
        if (trigger == null) {
          return null;
        }
        // The lift's springs are motion roles a theme may retune: register
        // their tables before the first motion (idempotent).
        registerContextMenuTable();
        registerSpringsTable();
        return lift.lift(trigger, {
          motion: MOTION,
          scale: {maxScale: LIFT.maxScale, scaleUpPoints: LIFT.scaleUpPoints},
          surfaceStartWidth: LIFT.morphStartWidth,
          from,
          release,
          inset: layerInsetRef.current,
          onBackdropTap: () => onBackdropTapRef.current?.(),
          attribute: 'data-astryx-context-menu-lift',
        });
      },
      morphMenu(menu, press) {
        lift.presentSurface(menu, press);
      },
      dismissMenu(menu) {
        lift.dismissSurface(menu);
      },
      drop() {
        lift.drop();
      },
    }),
    [lift, triggerRef],
  );
}
