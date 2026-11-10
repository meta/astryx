// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ContextMenuLift.ts
 * @input The trigger element, the lift module (liftFromTrigger/), the
 *   context-menu constants and springs, the app's layer inset (LayerProvider)
 * @output useContextMenuLift: lift() and drop() for UIKit's lifted preview
 *   over a tinted page, and the menu's entrance beside it
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
   * Returns where it landed, or null without the popover API.
   */
  lift(from: MorphRect, release: () => void): LiftFromTriggerResult | null;
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
      lift(from, release) {
        const trigger = triggerRef.current;
        if (trigger == null) {
          return null;
        }
        return liftContextMenuTrigger(lift, trigger, {
          motion: MOTION,
          scale: {
            maxScale: contextMenu.lift.maxScale,
            scaleUpPoints: contextMenu.lift.scaleUpPoints,
          },
          from,
          release,
          inset: layerInsetRef.current,
          onBackdropTap: () => onBackdropTapRef.current(),
        });
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
